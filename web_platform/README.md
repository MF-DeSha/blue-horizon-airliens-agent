# Blue Horizon Platform

Admin and user surface for the Blue Horizon state-graph agents.

The platform talks to the live backend and MySQL-backed workflow store — not a static mock. Operators can start any of the three agents, inject external wait results, resolve HITL tasks and failure tickets, and toggle MCP tool permissions without redeploying the server.

---

## What you can do

| Area | Capabilities |
|------|----------------|
| **Dashboard** | Live API health + recent workflow runs (`status`, `current_node`, `run_id`) |
| **Start Agent** | Start **Maintenance Release**, **Compensation Appeal**, or **Safety Incident** from one place |
| **External waits** | On `waiting_external` runs: inject maintenance reports, customer documents, payment results, or safety ground/authority data |
| **Failed runs** | **Fix & resume** actions (e.g. corrected maintenance report) so recovery is demoable from the UI |
| **HITL Review** | Open pending admin tasks, approve / reject / request changes → graph resumes from checkpoint |
| **Tickets** | Resolve failure tickets → resume from the failed node (not from graph start) |
| **Agents & tools** | List agents; enable/disable MCP tools per agent via `agent_tool_permissions` (live) |

---

## Structure

```text
web_platform/
├── README.md                 # this file
├── backend/
│   ├── app.py                # Flask app entry (CORS, blueprints)
│   ├── routes_agents.py      # list agents, start, get run, resume
│   ├── routes_admin.py       # HITL, tickets, tool permissions
│   └── services.py           # bridge to state_graph runners / hitl / tickets
└── frontend/
    ├── index.html            # Dashboard · Agents · Start · HITL · Tickets
    ├── app.js                # UI logic + inject/fix-resume helpers
    └── styles.css
```

Shared state-graph code lives at the repo root (`state_graph/`, `mcp_server/`, `rag/`). This package is the HTTP + browser layer on top.

---

## Prerequisites

- Repo root on `PYTHONPATH` (so `state_graph` and `mcp_server` import)
- MySQL with state-graph migrations applied (`workflow_runs`, `admin_tasks`, `failure_tickets`, `agent_tool_permissions`, …)
- Platform backend default: `http://127.0.0.1:5050`

---

## Run

### Backend (from **repository root**)

```bash
pip install flask flask-cors
PYTHONPATH=. python -m web_platform.backend.app
# → http://127.0.0.1:5050
```

Alternative:

```bash
cd web_platform/backend
PYTHONPATH=../.. python app.py
```

### Frontend

```bash
cd web_platform/frontend
python -m http.server 5500
# → http://127.0.0.1:5500
```

Or open `frontend/index.html` directly. If the API URL differs:

```js
localStorage.setItem("bh_api_base", "http://127.0.0.1:5050");
location.reload();
```

---

## Main API surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/agents` | Agent list + recent runs |
| `POST` | `/api/agents/start` | Start agent (`agent_type`: `maintenance_release` \| `compensation_appeal` \| `safety_incident`) |
| `GET` | `/api/agents/runs/<run_id>` | Load run state |
| `POST` | `/api/agents/runs/<run_id>/resume` | Resume with `data_updates` + `transition_name` |
| `GET` | `/api/admin/tasks` | List HITL tasks |
| `POST` | `/api/admin/tasks/<task_id>/decide` | Approve / reject / request changes |
| `GET` | `/api/admin/tickets` | List failure tickets |
| `POST` | `/api/admin/tickets/<ticket_id>/resolve` | Resolve ticket (+ optional resume) |
| `GET` | `/api/admin/tools?agent=<type>` | List tool permissions for an agent |
| `POST` | `/api/admin/tools` | Enable/disable a tool (`agent_name`, `tool_name`, `is_enabled`) |

---

## Suggested demo path

1. **Start Agent** → Maintenance Release for a flight in `disrupted` / `delayed` / `cancelled` status.
2. **Dashboard** → run is `waiting_external` → **Inject valid report** (or invalid to open a ticket).
3. **HITL Review** → approve operations release → run reaches `completed`.
4. **Tickets** → resolve a failure ticket → use **Fix & resume** on the same run if the payload still needs correction.
5. **Agents** → toggle a tool (e.g. `search_policy_manual`) and show the next call respects live permissions.

Compensation and Safety follow the same pattern: start → wait/inject → HITL or ticket → resume.

---

## Design notes

- **HITL** = expected pause for a human decision (`admin_tasks`).
- **Ticket** = unplanned failure (`failure_tickets`), resumed from the same checkpoint after resolve.
- External events in demos are injected through **resume** APIs / Dashboard actions; production would replace these with webhooks or operator systems.
- Tool gates use `state_graph.tool_registry.require_enabled_tool()` so admin toggles apply on the next tool call without restarting the MCP server.

---

## Related docs (repo root)

- Root `README.md` — full system, three agents, setup, ownership
- `demo.md` — captured HITL / ticket / checkpoint evidence

Team: platform originally scaffolded with the Safety agent; multi-agent start, inject/fix-resume UI, and live tool controls extended for the full product surface.

