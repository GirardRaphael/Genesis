"""Five-role broker workflow over a frozen free-fleet and static road matrix."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
import time

from fastapi import HTTPException

from .broker_solver import compare_strategies, validate_solution
from .dispatch import cancel_broker_ready_trips, fleet_snapshot, materialize_broker_trips, road_matrix
from .llm import LiveUnavailable
from .models import content_hash
from .workflow import Runtime, agent_id, PROMPT_ROOT


def _cents(value: str) -> int:
    return int((Decimal(str(value)) * 100).to_integral_value(rounding=ROUND_HALF_UP))


class BrokerRuntime(Runtime):
    def execute(self):
        try:
            return super().execute()
        except Exception:
            row = self.store.get_run(self.run_id)
            if (row["owner"], row["generation"]) == self.fence and row["status"] != "succeeded":
                cancel_broker_ready_trips(self.store, self.run_id)
            raise

    def prompt_path(self, role):
        return PROMPT_ROOT / f"broker-{role}-v1.txt"

    def planning(self, state, calls):
        request = self.request
        snapshot = self.tool(
            "planning", "freeze_free_fleet", {"vehicle_ids": request["vehicle_ids"]},
            lambda: fleet_snapshot(self.store.engine, request["vehicle_ids"], request["depot"]), calls,
        )
        snapshot["captured_at"] = self.store.get_run(self.run_id)["started_at"]
        available = [v for v in snapshot["vehicles"] if v["available"]]
        if not available:
            raise LiveUnavailable("No selected van remains free; replan when fleet capacity changes")
        nodes = [{"coordinates": list(v["origin"]), "kind": "start", "vehicle_id": v["id"]} for v in available]
        vehicles = [{
            "id": v["id"], "start_index": i, "capacity": 40,
            "fixed_cost_cents": _cents(request["activation_cost_cad"]),
            "cost_per_km_cents": _cents(request["cost_per_km_cad"]),
            "driver_hour_cents": _cents(request["driver_cost_per_hour_cad"]),
        } for i, v in enumerate(available)]
        deliveries = []
        for item in request["deliveries"]:
            pickup_index = len(nodes)
            nodes.append({"coordinates": list(item["pickup"]["coordinates"]), "kind": "pickup", "delivery_id": item["id"]})
            dropoff_index = len(nodes)
            nodes.append({"coordinates": list(item["dropoff"]["coordinates"]), "kind": "dropoff", "delivery_id": item["id"]})
            deliveries.append({
                "id": item["id"], "pickup_index": pickup_index,
                "dropoff_index": dropoff_index, "parcels": item["parcels"],
                "deadline_s": item["deadline_minutes"] * 60,
            })
        snapshot_id = self.store.put_artifact(self.run_id, "broker_fleet_snapshot", snapshot, self.fence, agent_id(self.run_id, "planning"))
        result = {"snapshot": snapshot, "nodes": nodes, "vehicles": vehicles, "deliveries": deliveries, "snapshot_artifact_id": snapshot_id}
        output = {
            "summary": f"{len(available)} free vans for {len(deliveries)} deliveries; fleet snapshot frozen.",
            "free_vehicle_ids": [v["id"] for v in available],
            "delivery_ids": [d["id"] for d in deliveries],
            "evidence_refs": [snapshot_id],
        }
        return result, output

    def traffic(self, state, calls):
        planning = state["planning"]
        if not planning["vehicles"]:
            return {"problem": None, "matrix_artifact_id": None}, {
                "summary": "No free van; road matrix request omitted.",
                "evidence_refs": [planning["snapshot_artifact_id"]],
            }
        matrix = self.tool(
            "traffic", "osrm_static_table", {"node_count": len(planning["nodes"])},
            lambda: road_matrix(planning["nodes"]), calls,
        )
        problem = {
            "nodes": planning["nodes"], "vehicles": planning["vehicles"],
            "deliveries": planning["deliveries"], "durations": matrix["durations"],
            "distances": matrix["distances"], "service_seconds": self.request["service_minutes"] * 60,
            "objective": self.request["objective"],
            "balance_value_cents_per_minute": _cents(self.request["balance_value_cad_per_minute"]),
            "max_duration_s": 28800,
        }
        problem["input_hash"] = content_hash(problem)
        matrix_id = self.store.put_artifact(self.run_id, "broker_problem", {"problem": problem, "road_source": matrix["source"], "computed_at": matrix["computed_at"]}, self.fence, agent_id(self.run_id, "traffic"))
        return {"problem": problem, "matrix_artifact_id": matrix_id}, {
            "summary": f"Static directional road table captured for {len(planning['nodes'])} nodes; no live traffic claim.",
            "input_hash": problem["input_hash"], "road_source": matrix["source"],
            "evidence_refs": [matrix_id, planning["snapshot_artifact_id"]],
        }

    def optimization(self, state, calls):
        problem = state["traffic"]["problem"]
        comparison = self.tool(
            "optimization", "compare_fleet_strategies", {"input_hash": problem["input_hash"] if problem else None},
            lambda: compare_strategies(problem) if problem else {
                "selected": None, "selected_strategy": None, "candidates": [], "certificate": None,
                "status": "no_candidate", "reason": "no_free_vehicle",
            }, calls,
        )
        artifact_id = self.store.put_artifact(self.run_id, "broker_comparison", comparison, self.fence, agent_id(self.run_id, "optimization"))
        summaries = [{
            "strategy": c["strategy"], "status": c["status"],
            "fleet_cost_cents": (c.get("solution") or {}).get("fleet_cost_cents"),
            "makespan_seconds": (c.get("solution") or {}).get("makespan_seconds"),
            "certificate_valid": (c.get("certificate") or {}).get("valid"),
        } for c in comparison["candidates"]]
        return {"comparison": comparison, "comparison_artifact_id": artifact_id}, {
            "summary": f"Compared {len(summaries)} consolidation choices; selected {comparison['selected_strategy'] or 'none'}.",
            "selected_strategy": comparison["selected_strategy"], "candidate_summaries": summaries,
            "evidence_refs": [artifact_id, *([state["traffic"]["matrix_artifact_id"]] if state["traffic"]["matrix_artifact_id"] else [])],
        }

    def monitoring(self, state, calls):
        problem = state["traffic"]["problem"]
        selected = state["optimization"]["comparison"]["selected"]
        certificate = self.tool(
            "monitoring", "independent_broker_certificate",
            {"input_hash": problem["input_hash"] if problem else None, "solution_hash": selected.get("solution_hash") if selected else None},
            lambda: validate_solution(problem, selected) if problem and selected else {"valid": False, "issues": ["No feasible candidate or free vehicle"]}, calls,
        )
        certificate_id = self.store.put_artifact(self.run_id, "broker_certificate", certificate, self.fence, agent_id(self.run_id, "monitoring"))
        return {"certificate": certificate, "certificate_artifact_id": certificate_id}, {
            "summary": "Independent route certificate valid." if certificate["valid"] else "No admissible certified route.",
            "certificate_valid": certificate["valid"], "issues": certificate["issues"],
            "evidence_refs": [certificate_id, state["optimization"]["comparison_artifact_id"]],
        }

    def exception(self, state, calls):
        valid = state["monitoring"]["certificate"]["valid"]
        assessment = self.tool(
            "exception", "dispatch_admissibility",
            {"certificate_valid": valid},
            lambda: {"decision": "materialize_after_handoffs" if valid else "diagnostic_only", "replan_needed": not valid}, calls,
        )
        return assessment, {
            "summary": "Certified plan can be prepared for dispatch." if valid else "No van trip will be created; replan or revise inputs.",
            **assessment, "evidence_refs": [state["monitoring"]["certificate_artifact_id"]],
        }

    def finalize(self, state):
        self.check()
        comparison = state["optimization"]["comparison"]
        certificate = state["monitoring"]["certificate"]
        trip_ids = []
        reason = None
        if certificate["valid"] and comparison["selected"]:
            try:
                trip_ids = materialize_broker_trips(
                    self.store, self.run_id, self.fence, state["planning"]["snapshot"],
                    self.request, comparison["selected"], state["traffic"]["problem"],
                    state["monitoring"]["certificate_artifact_id"],
                )
            except HTTPException as exc:
                reason = exc.detail["code"] if isinstance(exc.detail, dict) else "dispatch_unavailable"
        kind = "accepted_plan" if trip_ids else "accepted_diagnostic"
        final = {
            "kind": kind, "summary": "Broker plan certified and ready trips created." if trip_ids else "Broker analysis completed without dispatch trips.",
            "feasible": certificate["valid"] and bool(trip_ids),
            "reason": reason, "created_trip_ids": trip_ids,
            "comparison_artifact_id": state["optimization"]["comparison_artifact_id"],
            "certificate_artifact_id": state["monitoring"]["certificate_artifact_id"],
        }
        final_id = self.store.put_artifact(self.run_id, kind, final, self.fence, agent_id(self.run_id, "planning"))
        self.store.finish(self.run_id, "succeeded", {
            "workflow_kind": "broker", "broker_solution": {"selected_strategy": comparison["selected_strategy"], "selected": comparison["selected"]},
            "candidates": comparison["candidates"], "certificate": certificate,
            "fleet_snapshot": state["planning"]["snapshot"], "created_trip_ids": trip_ids,
            "duration_ms": int((time.monotonic() - self.started_monotonic) * 1000) if self.fence[1] == 1 else None,
            "duration_source": "monotonic" if self.fence[1] == 1 else "unavailable_across_recovered_processes",
            "final_kind": kind, "final_output": final, "final_artifact_id": final_id,
            "artifact_ids": {"fleet": state["planning"]["snapshot_artifact_id"], "comparison": state["optimization"]["comparison_artifact_id"], "certificate": state["monitoring"]["certificate_artifact_id"], "final": final_id},
        }, self.fence)
        if self.store.get_run(self.run_id)["status"] == "cancelled":
            cancel_broker_ready_trips(self.store, self.run_id)
        return {"finalization": {"final_artifact_id": final_id}}
