"""
Admin / HITL / Ticket API routes.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from . import services

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.get("/tasks")
def list_tasks():
    status = request.args.get("status")
    return jsonify({"tasks": services.list_admin_tasks(status=status)})


@admin_bp.post("/tasks/<task_id>/decide")
def decide_task(task_id: str):
    body = request.get_json(force=True, silent=True) or {}
    decision = (body.get("decision") or "").lower().strip()
    if decision not in {"approved", "changes_requested", "rejected", "revise"}:
        return jsonify(
            {"error": "decision must be approved | changes_requested | rejected"}
        ), 400
    decided_by = body.get("decided_by") or body.get("admin") or "admin"
    comment = body.get("comment") or body.get("admin_comment")
    payload = body.get("payload") or {}
    if body.get("run_id"):
        payload["run_id"] = body["run_id"]
    if body.get("revised_report"):
        payload["revised_report"] = body["revised_report"]

    try:
        result = services.resolve_admin_task(
            task_id=task_id,
            decision=decision,
            decided_by=decided_by,
            comment=comment,
            payload=payload,
        )
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@admin_bp.get("/tickets")
def list_tickets():
    status = request.args.get("status")
    return jsonify({"tickets": services.list_tickets(status=status)})


@admin_bp.post("/tickets/<ticket_id>/resolve")
def resolve_ticket(ticket_id: str):
    body = request.get_json(force=True, silent=True) or {}
    resolved_by = body.get("resolved_by") or body.get("admin") or "admin"
    notes = body.get("resolution_notes") or body.get("notes") or "Resolved from admin dashboard"
    resume = body.get("resume", True)
    data_updates = body.get("data_updates")
    try:
        result = services.resolve_ticket(
            ticket_id=ticket_id,
            resolved_by=resolved_by,
            resolution_notes=notes,
            resume=resume,
            data_updates=data_updates,
        )
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@admin_bp.get("/health")
def health():
    return jsonify({"status": "ok", "component": "admin_api"})


@admin_bp.get("/tools")
def list_tools():
    """List tool permissions for one agent (query: ?agent=maintenance_release)."""
    agent = request.args.get("agent") or request.args.get("agent_name")
    if not agent:
        return jsonify({"error": "query param agent is required"}), 400
    try:
        from state_graph.tool_registry import list_agent_tools

        tools = list_agent_tools(agent)
        return jsonify(
            {
                "agent": agent,
                "tools": [
                    {
                        "agent_name": t.agent_name,
                        "tool_name": t.tool_name,
                        "is_enabled": t.is_enabled,
                    }
                    for t in tools
                ],
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc), "tools": []}), 200


@admin_bp.post("/tools")
def set_tool():
    """Enable or disable one tool for one agent."""
    body = request.get_json(force=True, silent=True) or {}
    agent = body.get("agent_name") or body.get("agent")
    tool = body.get("tool_name") or body.get("tool")
    enabled = body.get("is_enabled")
    updated_by = body.get("updated_by") or "platform_admin"
    if not agent or not tool or enabled is None:
        return jsonify({"error": "agent_name, tool_name, is_enabled required"}), 400
    try:
        from state_graph.tool_registry import set_tool_permission

        set_tool_permission(
            agent_name=agent,
            tool_name=tool,
            is_enabled=bool(enabled),
            updated_by=updated_by,
        )
        return jsonify(
            {
                "ok": True,
                "agent_name": agent,
                "tool_name": tool,
                "is_enabled": bool(enabled),
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

