"""Five-role broker workflow over a frozen free-fleet and static road matrix."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
import time

from fastapi import HTTPException

from .broker_solver import _materialize, compare_strategies, validate_solution
from .dispatch import cancel_broker_ready_trips, fleet_snapshot, materialize_broker_trips, road_matrix
from .llm import LiveUnavailable
from .models import content_hash
from .route_memory import route_context
from .workflow import Runtime, agent_id, PROMPT_ROOT


def _cents(value: str) -> int:
    return int((Decimal(str(value)) * 100).to_integral_value(rounding=ROUND_HALF_UP))


class BrokerRuntime(Runtime):
    def explanation_skip_reason(self, role, state, result):
        if self.request.get("explanation_policy", "always") != "routine":
            return None
        if role in {"planning", "traffic"}:
            return "not_applicable_routine_policy"
        memory = (result if role == "optimization" else state["optimization"]).get("route_memory", {})
        valid = result.get("certificate", {}).get("valid", True) if role == "monitoring" else state.get("monitoring", {}).get("certificate", {}).get("valid", True)
        return "not_applicable_route_memory" if memory.get("outcome") == "reused" and valid else None

    def model_evidence(self, role, state, output):
        evidence = super().model_evidence(role, state, output)
        context = state.get("planning", {}).get("route_memory_context", {})
        # Aggregate only: semantic route orders and local dispatch inputs stay out of prompts.
        evidence["route_history"] = {key: context.get(key) for key in (
            "tracking_mode", "history_limit", "scanned_trip_count", "matched_route_count",
            "completed_sample_count", "completed_mission_count", "completed_trip_sample_count",
            "sample_unit", "ranking_basis", "mean_elapsed_simulation_seconds",
            "p50_elapsed_simulation_seconds", "mean_distance_km", "deliveries_per_simulation_hour",
            "on_time_rate", "on_time_sample_count",
        )}
        evidence["route_history"]["interpretation"] = (
            "Historical timings are simulated mission makespans, including vehicle approach "
            "and service; vehicle origins may vary. Deliveries per simulation hour describes "
            "mission completion cadence, not measured driver labor or productivity. "
            "Historical means do not isolate the effect of stop order."
        )
        return evidence

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
        context = route_context(self.store.engine, request)
        self.event("route_memory.context", context, agent_id(self.run_id, "planning"))
        result = {"snapshot": snapshot, "nodes": nodes, "vehicles": vehicles, "deliveries": deliveries, "snapshot_artifact_id": snapshot_id, "route_memory_context": context}
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
        return {"problem": problem, "matrix_artifact_id": matrix_id, "road_computed_at": matrix["computed_at"]}, {
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
        context = state["planning"].get("route_memory_context", {})
        memory = self.tool(
            "optimization", "revalidate_route_memory", {"candidate_count": len(context.get("candidates", []))},
            lambda: self.assess_route_memory(problem, comparison["selected"], context), calls,
        )
        memory.update({
            "context": {k: v for k, v in context.items() if k != "candidates"},
            "explanation_policy": self.request.get("explanation_policy", "always"),
            "fresh_road_computed_at": state["traffic"].get("road_computed_at"),
            "omitted_explanation_roles": [a["role"] for a in self.store.get_run(self.run_id)["detail"]["agents"] if a.get("output", {}).get("explanation_omitted")],
            "planned_explanation_calls": 0 if self.request["mode"] == "fixture" else 5 if self.request.get("explanation_policy", "always") == "always" else 0 if memory["outcome"] == "reused" else 3,
        })
        self.event("route_memory.assessed", memory, agent_id(self.run_id, "optimization"))
        self.store.update_detail(self.run_id, {"route_memory": memory}, self.fence)
        artifact_id = self.store.put_artifact(self.run_id, "broker_comparison", comparison, self.fence, agent_id(self.run_id, "optimization"))
        summaries = [{
            "strategy": c["strategy"], "status": c["status"],
            "fleet_cost_cents": (c.get("solution") or {}).get("fleet_cost_cents"),
            "makespan_seconds": (c.get("solution") or {}).get("makespan_seconds"),
            "certificate_valid": (c.get("certificate") or {}).get("valid"),
        } for c in comparison["candidates"]]
        return {"comparison": comparison, "comparison_artifact_id": artifact_id, "route_memory": memory}, {
            "summary": f"Compared {len(summaries)} consolidation choices; selected {comparison['selected_strategy'] or 'none'}.",
            "selected_strategy": comparison["selected_strategy"], "candidate_summaries": summaries,
            "route_memory_outcome": memory["outcome"],
            "evidence_refs": [artifact_id, *([state["traffic"]["matrix_artifact_id"]] if state["traffic"]["matrix_artifact_id"] else [])],
        }

    @staticmethod
    def assess_route_memory(problem, selected, context):
        candidates = context.get("candidates", [])[:3]
        result = {"outcome": "changed" if candidates else "miss", "reason": "historical_assignment_changed" if candidates else "no_exact_completed_history", "source_run_id": None, "source_trip_ids": []}
        if not problem or not selected:
            return result
        if not validate_solution(problem, selected)["valid"]:
            return result
        selected_orders = {route["vehicle_id"]: route["node_order"] for route in selected["vehicle_routes"]}
        indices = {(node.get("delivery_id"), node["kind"]): index for index, node in enumerate(problem["nodes"]) if node["kind"] != "start"}
        for candidate in candidates:
            try:
                orders = {}
                for route in candidate["vehicle_routes"]:
                    if route["vehicle_id"] in orders:
                        raise ValueError("duplicate historical vehicle")
                    order = []
                    for stop in route["stop_order"]:
                        delivery_id, kind = stop.rsplit(":", 1)
                        order.append(indices[(delivery_id, kind)])
                    orders[route["vehicle_id"]] = order
                vehicle_ids = [vehicle["id"] for vehicle in problem["vehicles"]]
                if set(orders) - set(vehicle_ids):
                    raise ValueError("historical vehicle is unavailable")
                orders = {vehicle_id: orders[vehicle_id] for vehicle_id in vehicle_ids if vehicle_id in orders}
                rebuilt = _materialize(problem, orders, "feasible_candidate")
                certified = validate_solution(problem, rebuilt)
            except (KeyError, TypeError, ValueError, IndexError):
                continue
            if (certified["valid"] and candidate.get("provider_matches") is True
                    and orders == selected_orders):
                return {"outcome": "reused", "reason": "same_assignment_revalidated", "source_run_id": candidate["source_run_id"], "source_trip_ids": candidate["source_trip_ids"], "historical_input_hash": candidate.get("problem_input_hash"), "current_input_hash": problem["input_hash"]}
        return result

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
        memory = {**state["optimization"].get("route_memory", {}), "omitted_explanation_roles": [a["role"] for a in self.store.get_run(self.run_id)["detail"]["agents"] if a.get("output", {}).get("explanation_omitted")]}
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
        memory.update({"admission_outcome": "created" if trip_ids else "rejected" if reason else "not_attempted", "admission_reason": reason})
        if reason:
            memory.update({"selection_outcome": memory.get("outcome"), "outcome": "changed", "reason": reason})
        self.event("route_memory.admission", memory, agent_id(self.run_id, "planning"))
        kind = "accepted_plan" if trip_ids else "accepted_diagnostic"
        final = {
            "kind": kind, "summary": "Broker plan certified and ready trips created." if trip_ids else "Broker analysis completed without dispatch trips.",
            "feasible": certificate["valid"] and bool(trip_ids),
            "reason": reason, "created_trip_ids": trip_ids,
            "comparison_artifact_id": state["optimization"]["comparison_artifact_id"],
            "certificate_artifact_id": state["monitoring"]["certificate_artifact_id"],
            "route_memory": memory,
        }
        final_id = self.store.put_artifact(self.run_id, kind, final, self.fence, agent_id(self.run_id, "planning"))
        self.store.finish(self.run_id, "succeeded", {
            "workflow_kind": "broker", "broker_solution": {"selected_strategy": comparison["selected_strategy"], "selected": comparison["selected"]},
            "candidates": comparison["candidates"], "certificate": certificate,
            "route_memory": memory,
            "fleet_snapshot": state["planning"]["snapshot"], "created_trip_ids": trip_ids,
            "duration_ms": int((time.monotonic() - self.started_monotonic) * 1000) if self.fence[1] == 1 else None,
            "duration_source": "monotonic" if self.fence[1] == 1 else "unavailable_across_recovered_processes",
            "final_kind": kind, "final_output": final, "final_artifact_id": final_id,
            "artifact_ids": {"fleet": state["planning"]["snapshot_artifact_id"], "comparison": state["optimization"]["comparison_artifact_id"], "certificate": state["monitoring"]["certificate_artifact_id"], "final": final_id},
        }, self.fence)
        if self.store.get_run(self.run_id)["status"] == "cancelled":
            cancel_broker_ready_trips(self.store, self.run_id)
        return {"finalization": {"final_artifact_id": final_id}}
