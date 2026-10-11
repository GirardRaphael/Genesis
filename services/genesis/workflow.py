"""Five observable roles coordinated by a checkpointed LangGraph."""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import time
from typing import TypedDict
from uuid import UUID, uuid4, uuid5

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph

from .db import now
from .llm import BillingUncertain, ModelAdapter

ROLES = ["planning", "traffic", "optimization", "monitoring", "exception"]
NAMES = {
    "planning": "Planning",
    "traffic": "Simulated traffic",
    "optimization": "Optimization",
    "monitoring": "Monitoring",
    "exception": "Exception",
}
PROMPT_ROOT = Path(__file__).resolve().parents[2] / "agents" / "prompts"


class Cancelled(RuntimeError):
    pass


class RunTimedOut(RuntimeError):
    pass


class State(TypedDict, total=False):
    run_id: str
    planning: dict
    traffic: dict
    optimization: dict
    monitoring: dict
    exception: dict
    finalization: dict


def agent_id(run_id, role):
    return str(uuid5(UUID(run_id), role))


def dump(value):
    return value.model_dump(mode="json") if hasattr(value, "model_dump") else value


class Runtime:
    def agent_name(self, role):
        return (
            "Road network"
            if role == "traffic" and self.request.get("workflow_kind") == "broker"
            else NAMES[role]
        )

    def prompt_path(self, role):
        return PROMPT_ROOT / f"{role}-v1.txt"

    def explanation_skip_reason(self, role, state, result):
        return None

    def model_evidence(self, role, state, output):
        index = ROLES.index(role)
        prior_message = state.get(ROLES[index - 1], {}).get("agent_message") if index else None
        return {**output, "prior_agent_message": prior_message}

    def __init__(self, store, row):
        self.store, self.run_id, self.request = store, row["id"], row["request"]
        self.fence = (row["owner"], row["generation"])
        self.started_monotonic = time.monotonic()
        self.deadline = time.monotonic() + max(
            0,
            300
            - (
                datetime.now(timezone.utc) - datetime.fromisoformat(row["started_at"])
            ).total_seconds(),
        )

    def check(self):
        row = self.store.get_run(self.run_id)
        if (row["owner"], row["generation"]) != self.fence:
            from .db import LostLease

            raise LostLease("Worker ownership changed")
        if row["cancel_requested"]:
            raise Cancelled("Cancellation requested")
        if time.monotonic() > self.deadline:
            raise RunTimedOut("Five minute runtime cap reached")

    def event(self, kind, payload, invocation_id=None):
        return self.store.append_event(self.run_id, kind, payload, invocation_id, fence=self.fence)

    def tool(self, role, name, arguments, fn, calls):
        self.check()
        call_id = str(uuid4())
        started_at = now()
        began = time.monotonic()
        if sum(e["kind"] == "tool.started" for e in self.store.history(self.run_id, 0, 500)) >= 24:
            raise ValueError("24 tool-call cap reached")
        invocation_id = agent_id(self.run_id, role)
        self.event(
            "tool.started",
            {"tool_call_id": call_id, "name": name, "input": arguments, "version": "v1"},
            invocation_id,
        )
        try:
            result = fn()
            value = dump(result)
        except Exception as exc:
            self.event(
                "tool.failed",
                {
                    "tool_call_id": call_id,
                    "name": name,
                    "error_code": type(exc).__name__,
                    "duration_ms": int((time.monotonic() - began) * 1000),
                    "retryable": False,
                },
                invocation_id,
            )
            raise
        completed = {
            "id": call_id,
            "name": name,
            "status": "succeeded",
            "duration_ms": int((time.monotonic() - began) * 1000),
            "input": arguments,
            "output": value,
            "started_at": started_at,
            "finished_at": now(),
        }
        calls.append(completed)
        self.event(
            "tool.completed",
            {
                "tool_call_id": call_id,
                "name": name,
                "duration_ms": completed["duration_ms"],
                "output_summary": self.safe_evidence(value),
            },
            invocation_id,
        )
        return result

    @staticmethod
    def safe_evidence(value):
        if not isinstance(value, dict):
            return {"result_type": type(value).__name__}
        permitted = {
            "valid",
            "issues",
            "scope",
            "served",
            "total",
            "solver_status",
            "objective_cents",
            "unserved_ids",
            "matrix_hash",
            "input_hash",
            "diagnostics",
            "replan_applied",
            "replan_count",
            "metrics",
            "forecast",
            "summary",
            "decision",
            "reason",
        }
        return {k: v for k, v in value.items() if k in permitted}

    def handoff(self, sender, receiver, summary):
        handoff = {
            "id": str(uuid5(UUID(self.run_id), f"handoff:{sender}:{receiver}")),
            "sender_id": agent_id(self.run_id, sender),
            "receiver_id": agent_id(self.run_id, receiver),
            "sender_role": sender,
            "receiver_role": receiver,
            "summary": summary,
            "actual": True,
        }
        event = self.store.append_event(
            self.run_id,
            "handoff.sent",
            handoff,
            handoff["sender_id"],
            event_id=handoff["id"],
            fence=self.fence,
        )
        handoff["run_seq"] = event["run_seq"]
        detail = self.store.get_run(self.run_id)["detail"]
        if not any(item["id"] == handoff["id"] for item in detail["handoffs"]):
            self.store.update_detail(
                self.run_id, {"handoffs": [*detail["handoffs"], handoff]}, self.fence
            )

    def node(self, role, operation):
        def execute(state):
            self.check()
            cached = self.store.get_run(self.run_id)["detail"]["node_results"].get(role)
            if cached is not None:
                agent = next(
                    a
                    for a in self.store.get_run(self.run_id)["detail"]["agents"]
                    if a["role"] == role
                )
                next_role = ROLES[ROLES.index(role) + 1] if role != "exception" else "planning"
                self.handoff(
                    role,
                    next_role,
                    (agent["output"].get("explanation") or {}).get("summary")
                    or agent["output"].get(
                        "summary", f"{self.agent_name(role)} evidence is available"
                    ),
                )
                return {role: cached}
            if self.request["mode"] == "live" and self.store.held(self.run_id):
                raise BillingUncertain("Unreconciled prior attempt; redispatch refused")
            if (
                self.request["mode"] == "live"
                and self.fence[1] > 1
                and any(
                    e["kind"] == "model.started"
                    and e["invocation_id"] == agent_id(self.run_id, role)
                    for e in self.store.history(self.run_id, 0, 500)
                )
            ):
                raise BillingUncertain(
                    "Recovered role has prior provider intent without a stored role result; redispatch refused"
                )
            invocation_id = agent_id(self.run_id, role)
            began = time.monotonic()
            started_at = now()
            calls = []
            self.event(
                "agent.started",
                {
                    "role": role,
                    "name": self.agent_name(role),
                    "prompt_version": "v1",
                    "provenance": self.request["mode"],
                },
                invocation_id,
            )
            active_detail = self.store.get_run(self.run_id)["detail"]
            active_agent = {
                "id": invocation_id,
                "role": role,
                "name": self.agent_name(role),
                "status": "running",
                "model": None,
                "requested_model": self.request.get("model_policy", {}).get(role),
                "duration_ms": 0,
                "duration_source": "unavailable_until_completed",
                "input_tokens": None,
                "output_tokens": None,
                "cost": None,
                "output": {},
                "tool_calls": [],
                "started_at": started_at,
                "finished_at": None,
            }
            self.store.update_detail(
                self.run_id,
                {
                    "agents": [a for a in active_detail["agents"] if a["role"] != role]
                    + [active_agent]
                },
                self.fence,
            )
            try:
                result, output = operation(state, calls)
                self.check()
                usage = None
                explanation = None
                skip_reason = self.explanation_skip_reason(role, state, result)
                if self.request["mode"] == "live" and not skip_reason:
                    prompt = self.prompt_path(role).read_text(encoding="utf-8")
                    evidence = self.model_evidence(role, {**state, role: result}, output)
                    explanation, usage = ModelAdapter(
                        self.store, self.run_id, self.fence, role
                    ).explain(role, prompt, evidence, invocation_id)
                    output = {**output, "explanation": explanation}
                elif self.request["mode"] == "live":
                    output = {**output, "explanation_omitted": skip_reason}
                    self.event("model.omitted", {"role": role, "usage_source": skip_reason}, invocation_id)
                output_artifact = self.store.put_artifact(
                    self.run_id, "agent_output", output, self.fence, invocation_id
                )
                result = {
                    **result,
                    "output_artifact_id": output_artifact,
                    "agent_message": explanation,
                }
                agent = {
                    "id": invocation_id,
                    "role": role,
                    "name": self.agent_name(role),
                    "status": "succeeded",
                    "model": usage["resolved_model"] if usage else None,
                    "requested_model": usage["requested_model"] if usage else None,
                    "duration_ms": int((time.monotonic() - began) * 1000),
                    "input_tokens": usage["input_tokens"] if usage else None,
                    "output_tokens": usage["output_tokens"] if usage else None,
                    "cost": usage["cost_usd"] if usage else None,
                    "usage_source": usage["usage_source"] if usage else skip_reason if self.request["mode"] == "live" else "not_applicable_fixture",
                    "prompt_version": "v1",
                    "output": output,
                    "output_artifact_id": output_artifact,
                    "tool_calls": calls,
                    "started_at": started_at,
                    "finished_at": now(),
                }
                self.store.save_node(self.run_id, role, result, agent, self.fence)
                next_role = ROLES[ROLES.index(role) + 1] if role != "exception" else "planning"
                self.handoff(
                    role,
                    next_role,
                    explanation["summary"]
                    if explanation
                    else output.get("summary", f"{self.agent_name(role)} evidence is available"),
                )
                return {role: result}
            except Exception as exc:
                agent = {
                    "id": invocation_id,
                    "role": role,
                    "name": self.agent_name(role),
                    "status": "cancelled" if isinstance(exc, Cancelled) else "failed",
                    "model": None,
                    "requested_model": self.request.get("model_policy", {}).get(role)
                    or os.getenv(
                        "GENESIS_ANTHROPIC_ECONOMY_MODEL"
                        if role in {"traffic", "exception"}
                        else "GENESIS_ANTHROPIC_VERIFIER_MODEL"
                        if role == "monitoring"
                        else "GENESIS_ANTHROPIC_MODEL"
                    )
                    if self.request["mode"] == "live" and self.request.get("explanation_policy") != "none"
                    else None,
                    "duration_ms": int((time.monotonic() - began) * 1000),
                    "input_tokens": None,
                    "output_tokens": None,
                    "cost": None,
                    "output": {"error_code": type(exc).__name__},
                    "tool_calls": calls,
                    "started_at": started_at,
                    "finished_at": now(),
                }
                if self.request.get("explanation_policy") == "none":
                    agent["usage_source"] = "not_applicable_deterministic_policy"
                detail = self.store.get_run(self.run_id)["detail"]
                self.store.update_detail(
                    self.run_id,
                    {"agents": [a for a in detail["agents"] if a["role"] != role] + [agent]},
                    self.fence,
                )
                self.event(
                    "agent.failed",
                    {
                        "role": role,
                        "error_code": type(exc).__name__,
                        "duration_ms": agent["duration_ms"],
                    },
                    invocation_id,
                )
                raise

        return execute

    def planning(self, state, calls):
        from .scenarios import build_scenario

        dataset = self.tool(
            "planning",
            "dataset_loader",
            {"scenario_id": self.request["scenario_id"], "seed": self.request["seed"]},
            lambda: build_scenario(self.request["scenario_id"], self.request["seed"]),
            calls,
        )
        value = dump(dataset)
        artifact = self.store.put_artifact(
            self.run_id, "dataset", value, self.fence, agent_id(self.run_id, "planning")
        )
        return {"dataset": value, "dataset_artifact_id": artifact}, {
            "summary": "Work order: validate all mandatory deliveries within capacity, service windows and shifts.",
            "stop_count": len(dataset.stops),
            "vehicle_count": len(dataset.vehicles),
            "input_hash": dataset.input_hash,
            "policy": self.request["policy"],
            "evidence_refs": [artifact],
        }

    def traffic(self, state, calls):
        data = state["planning"]["dataset"]
        forecast = self.tool(
            "traffic",
            "frozen_matrix",
            {"dataset_hash": data["input_hash"]},
            lambda: {
                "matrix_hash": data["matrix_hash"],
                "forecast": data["forecast"],
                "source": data["road_source"],
            },
            calls,
        )
        self.event("matrix.created", forecast, agent_id(self.run_id, "traffic"))
        return forecast, {
            "summary": "Frozen synthetic directed matrix and permitted initial forecast prepared.",
            **forecast,
            "evidence_refs": [state["planning"]["dataset_artifact_id"]],
        }

    def optimization(self, state, calls):
        from .models import Dataset
        from .solver import baseline_plan, optimize_plan, validate_plan, select_plan

        dataset = Dataset.model_validate(state["planning"]["dataset"])
        baseline = self.tool(
            "optimization",
            "baseline_planner",
            {"input_hash": dataset.input_hash},
            lambda: baseline_plan(dataset),
            calls,
        )
        baseline_certificate = self.tool(
            "optimization",
            "independent_validator",
            {"plan_id": baseline.id},
            lambda: validate_plan(dataset, baseline),
            calls,
        )
        candidate = None
        candidate_certificate = None
        if self.request["policy"] == "solver_with_one_replan":
            candidate = self.tool(
                "optimization",
                "ortools_planner",
                {"input_hash": dataset.input_hash, "time_limit_s": 1},
                lambda: optimize_plan(dataset, time_limit_s=1),
                calls,
            )
            candidate_certificate = self.tool(
                "optimization",
                "independent_validator",
                {"plan_id": candidate.id},
                lambda: validate_plan(dataset, candidate),
                calls,
            )
        selected, reason = select_plan(dataset, baseline, candidate)
        artifacts = {}
        for label, plan in [
            ("baseline", baseline),
            ("candidate", candidate),
            ("selected_plan", selected),
        ]:
            if plan is not None:
                artifacts[label] = self.store.put_artifact(
                    self.run_id,
                    "route_plan",
                    dump(plan),
                    self.fence,
                    agent_id(self.run_id, "optimization"),
                )
        self.event(
            "route.proposed",
            {"plan_id": selected.id, "artifact_id": artifacts["selected_plan"], "reason": reason},
            agent_id(self.run_id, "optimization"),
        )
        result = {
            "baseline": dump(baseline),
            "candidate": dump(candidate),
            "selected_plan": dump(selected),
            "baseline_certificate": dump(baseline_certificate),
            "candidate_certificate": dump(candidate_certificate),
            "plan_artifact_ids": artifacts,
            "selection_reason": reason,
        }
        return result, {
            "summary": reason,
            "baseline": self.safe_evidence(dump(baseline)),
            "candidate": self.safe_evidence(dump(candidate)) if candidate else None,
            "evidence_refs": list(artifacts.values()),
        }

    def monitoring(self, state, calls):
        from .models import Dataset, Plan
        from .solver import validate_plan
        from .simulation import simulate_plan

        dataset = Dataset.model_validate(state["planning"]["dataset"])
        plan = Plan.model_validate(state["optimization"]["selected_plan"])
        certificate = self.tool(
            "monitoring",
            "independent_validator",
            {"plan_id": plan.id},
            lambda: validate_plan(dataset, plan),
            calls,
        )
        simulation = self.tool(
            "monitoring",
            "logistics_simulator",
            {"plan_id": plan.id, "policy": self.request["policy"]},
            lambda: simulate_plan(
                dataset,
                plan,
                self.request["scenario_id"],
                self.request["seed"],
                allow_replan=self.request["policy"] == "solver_with_one_replan",
            ),
            calls,
        )
        certificate_artifact = self.store.put_artifact(
            self.run_id,
            "certificate",
            dump(certificate),
            self.fence,
            agent_id(self.run_id, "monitoring"),
        )
        simulation_artifact = self.store.put_artifact(
            self.run_id, "simulation", simulation, self.fence, agent_id(self.run_id, "monitoring")
        )
        self.event(
            "route.validated",
            {"plan_id": plan.id, "artifact_id": certificate_artifact, **dump(certificate)},
            agent_id(self.run_id, "monitoring"),
        )
        for event in simulation["events"]:
            self.event("simulation.event", event, agent_id(self.run_id, "monitoring"))
        self.event(
            "validation.completed",
            {
                "valid": certificate.valid,
                "issues": certificate.issues,
                "artifact_id": certificate_artifact,
            },
            agent_id(self.run_id, "monitoring"),
        )
        return {
            "certificate": dump(certificate),
            "simulation": simulation,
            "certificate_artifact_id": certificate_artifact,
            "simulation_artifact_id": simulation_artifact,
        }, {
            "summary": "Independent certificate and completed synthetic simulation checked; fleet outcome remains separate from mission completion.",
            "certificate": dump(certificate),
            "metrics": simulation["metrics"],
            "diagnostics": simulation.get("diagnostics", []),
            "evidence_refs": [certificate_artifact, simulation_artifact],
        }

    def exception(self, state, calls):
        monitoring = state["monitoring"]

        def assess():
            simulation = monitoring["simulation"]
            return {
                "decision": "replan_applied"
                if simulation.get("replan_applied")
                else "diagnostic"
                if not monitoring["certificate"]["valid"] or simulation.get("diagnostics")
                else "no_action",
                "replan_count": simulation.get("replan_count", 0),
                "diagnostics": simulation.get("diagnostics", []),
                "summary": "Bounded exception assessment preserves cargo and completed work; no further repair loop is permitted.",
            }

        output = self.tool(
            "exception",
            "exception_policy_validator",
            {
                "policy": self.request["policy"],
                "certificate_artifact_id": monitoring["certificate_artifact_id"],
            },
            assess,
            calls,
        )
        if output["replan_count"] > 1:
            raise ValueError("Replan cap violated")
        self.event("exception.assessed", output, agent_id(self.run_id, "exception"))
        if output["replan_count"]:
            self.event(
                "route.replanned",
                {
                    "replan_count": output["replan_count"],
                    "simulation_artifact_id": monitoring["simulation_artifact_id"],
                },
                agent_id(self.run_id, "exception"),
            )
        return output, {
            **output,
            "evidence_refs": [
                monitoring["simulation_artifact_id"],
                monitoring["certificate_artifact_id"],
            ],
        }

    def finalize(self, state):
        self.check()
        monitoring = state["monitoring"]
        optimization = state["optimization"]
        kind = "accepted_plan" if monitoring["certificate"]["valid"] else "accepted_diagnostic"
        final = {
            "kind": kind,
            "summary": "Verified planning analysis completed using deterministic fixture tools."
            if self.request["mode"] == "fixture"
            else "Planning analysis completed with live model explanations and deterministic certificates.",
            "feasible": monitoring["certificate"]["valid"],
            "fleet_metrics": monitoring["simulation"]["metrics"],
            "limitations": [
                "Synthetic schematic matrices and paths; no measured traffic or real dispatch.",
                "Simulation clock uses zero decision delay; actual role duration is separate.",
            ],
            "certificate_artifact_id": monitoring["certificate_artifact_id"],
            "simulation_artifact_id": monitoring["simulation_artifact_id"],
        }
        final_id = self.store.put_artifact(
            self.run_id, kind, final, self.fence, agent_id(self.run_id, "planning")
        )
        changes = {
            "duration_ms": int((time.monotonic() - self.started_monotonic) * 1000)
            if self.fence[1] == 1
            else None,
            "duration_source": "monotonic"
            if self.fence[1] == 1
            else "unavailable_across_recovered_processes",
            "dataset": state["planning"]["dataset"],
            "baseline": optimization["baseline"],
            "candidate": optimization["candidate"],
            "selected_plan": optimization["selected_plan"],
            "certificate": monitoring["certificate"],
            "simulation": monitoring["simulation"],
            "metrics": monitoring["simulation"]["metrics"],
            "final_kind": kind,
            "final_output": final,
            "final_artifact_id": final_id,
            "artifact_ids": {
                **optimization["plan_artifact_ids"],
                "certificate": monitoring["certificate_artifact_id"],
                "simulation": monitoring["simulation_artifact_id"],
                "dataset": state["planning"]["dataset_artifact_id"],
                "final": final_id,
            },
        }
        self.store.finish(self.run_id, "succeeded", changes, self.fence)
        return {"finalization": {"final_artifact_id": final_id}}

    def execute(self):
        checkpoint_path = os.getenv("GENESIS_CHECKPOINT_PATH", "data/checkpoints.sqlite")
        Path(checkpoint_path).parent.mkdir(parents=True, exist_ok=True)
        with SqliteSaver.from_conn_string(checkpoint_path) as saver:
            builder = StateGraph(State)
            for role in ROLES:
                builder.add_node(role, self.node(role, getattr(self, role)))
            builder.add_node("finalization", self.finalize)
            builder.add_edge(START, "planning")
            for a, b in zip(ROLES, ROLES[1:]):
                builder.add_edge(a, b)
            builder.add_edge("exception", "finalization")
            builder.add_edge("finalization", END)
            graph = builder.compile(checkpointer=saver)
            config = {
                "configurable": {"thread_id": f"{self.run_id}:project-demo"},
                "recursion_limit": 20,
            }
            snapshot = graph.get_state(config)
            graph.invoke(None if snapshot.next else {"run_id": self.run_id}, config)
