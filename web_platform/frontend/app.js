/**
 * Blue Horizon Platform frontend
 * Talks to the platform backend API.
 */

const API_BASE = localStorage.getItem("bh_api_base") || "http://127.0.0.1:5050";

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function showResult(el, payload) {
  el.classList.remove("hidden");
  el.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

// ---- Navigation ----
document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
    if (btn.dataset.view === "dashboard") loadDashboard();
    if (btn.dataset.view === "agents") loadAgents();
    if (btn.dataset.view === "hitl") loadHitl();
    if (btn.dataset.view === "tickets") loadTickets();
  });
});

function badge(status) {
  const s = (status || "unknown").toLowerCase();
  return `<span class="badge ${s}">${s}</span>`;
}

// ---- Dashboard ----
async function loadDashboard() {
  const el = document.getElementById("health-status");
  const runsEl = document.getElementById("recent-runs");
  try {
    const health = await api("/api/health");
    el.textContent = `API: ${health.status} (${API_BASE})`;
  } catch (e) {
    el.textContent = `API unreachable at ${API_BASE}: ${e.message}`;
  }
  try {
    const data = await api("/api/agents");
    const runs = data.recent_runs || [];
    runsEl.innerHTML =
      runs.length === 0
        ? `<div class="card">No recent runs (checkpoint store may be offline).</div>`
        : runs
            .map((r) => {
              const status = (r.status || "").toLowerCase();
              const wtype = r.workflow_type || r.type || "run";
              const node = r.current_node || "—";
              const injectBtns = injectButtonsHtml(r);
              return `
      <div class="card">
        <strong>${wtype}</strong>
        ${badge(status)}
        <div style="color:var(--muted);font-size:0.85rem;margin-top:0.35rem">
          ${r.run_id || ""} · flight ${r.flight_number || "—"} · node ${node}
        </div>
        ${injectBtns}
      </div>`;
            })
            .join("");
  } catch {
    runsEl.innerHTML = `<div class="card">Could not load runs.</div>`;
  }
}

function injectButtonsHtml(r) {
  const status = (r.status || "").toLowerCase();
  const wtype = (r.workflow_type || r.type || "").toLowerCase();
  const node = (r.current_node || "").toLowerCase();
  const runId = r.run_id;
  if (!runId) return "";

  const buttons = [];

  // Maintenance: waiting for external maintenance report
  if (
    status === "waiting_external" &&
    (wtype.includes("maintenance") || node.includes("maintenance_report") || node.includes("awaiting_maintenance"))
  ) {
    buttons.push(
      `<button class="btn" onclick="injectMaintenanceReport('${runId}', true)">Inject valid report</button>`
    );
    buttons.push(
      `<button class="btn secondary" onclick="injectMaintenanceReport('${runId}', false)">Inject invalid report (ticket)</button>`
    );
  }

  // Compensation: customer documents
  if (
    status === "waiting_external" &&
    (wtype.includes("compensation") ||
      node.includes("customer_document") ||
      node.includes("await_customer") ||
      node.includes("awaiting_document"))
  ) {
    buttons.push(
      `<button class="btn" onclick="injectCustomerDocuments('${runId}', true)">Inject valid documents</button>`
    );
    buttons.push(
      `<button class="btn secondary" onclick="injectCustomerDocuments('${runId}', false)">Inject invalid documents (ticket)</button>`
    );
  }

  // Compensation: payment result
  if (
    status === "waiting_external" &&
    (node.includes("payment") || node.includes("await_payment"))
  ) {
    buttons.push(
      `<button class="btn" onclick="injectPaymentResult('${runId}', 'paid')">Payment paid</button>`
    );
    buttons.push(
      `<button class="btn secondary" onclick="injectPaymentResult('${runId}', 'rejected')">Payment rejected</button>`
    );
  }

  // Safety: ground/crew report or authority ack
  if (
    status === "waiting_external" &&
    (wtype.includes("safety") ||
      node.includes("ground") ||
      node.includes("crew") ||
      node.includes("authority") ||
      node.includes("acknowledgement"))
  ) {
    if (node.includes("authority") || node.includes("acknowledgement")) {
      buttons.push(
        `<button class="btn" onclick="injectSafetyExternal('${runId}', 'authority_ack')">Inject authority ACK</button>`
      );
    } else {
      buttons.push(
        `<button class="btn" onclick="injectSafetyExternal('${runId}', 'ground_report')">Inject ground/crew report</button>`
      );
    }
  }

  if (!buttons.length && status === "waiting_external") {
    buttons.push(
      `<button class="btn secondary" onclick="promptGenericResume('${runId}')">Generic resume (JSON)</button>`
    );
  }

  // Failed runs: allow fixing payload + resume from same checkpoint (demo recovery)
  if (status === "failed") {
    if (wtype.includes("maintenance") || node.includes("maintenance") || node.includes("validate_maintenance")) {
      buttons.push(
        `<button class="btn" onclick="injectMaintenanceReport('${runId}', true)">Fix report &amp; resume</button>`
      );
      buttons.push(
        `<button class="btn secondary" onclick="injectMaintenanceReport('${runId}', false)">Retry invalid report</button>`
      );
    } else if (
      wtype.includes("compensation") ||
      node.includes("document") ||
      node.includes("payment") ||
      node.includes("validate_document")
    ) {
      if (node.includes("payment") || node.includes("submit_payment")) {
        buttons.push(
          `<button class="btn" onclick="injectPaymentResult('${runId}', 'paid')">Fix: mark payment paid &amp; resume</button>`
        );
      } else {
        buttons.push(
          `<button class="btn" onclick="injectCustomerDocuments('${runId}', true)">Fix documents &amp; resume</button>`
        );
      }
    } else if (wtype.includes("safety")) {
      buttons.push(
        `<button class="btn" onclick="injectSafetyExternal('${runId}', 'ground_report')">Fix evidence &amp; resume</button>`
      );
    } else {
      buttons.push(
        `<button class="btn secondary" onclick="promptGenericResume('${runId}')">Fix data &amp; resume (JSON)</button>`
      );
    }
  }

  if (!buttons.length) return "";
  return `<div class="actions">${buttons.join("")}</div>`;
}

window.injectMaintenanceReport = async function (runId, valid) {
  const data_updates = valid
    ? {
        maintenance_report: {
          reference: "MR-DEMO-001",
          clearance: "cleared",
          summary: "All systems checked. Aircraft cleared for release.",
        },
      }
    : {
        maintenance_report: {
          reference: "MR-BAD",
          // missing clearance + summary on purpose → ticket
        },
      };
  try {
    const result = await api(`/api/agents/runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({
        data_updates,
        transition_name: valid ? "maintenance_report_received" : "maintenance_report_invalid_injected",
      }),
    });
    alert(
      valid
        ? "Valid report injected & resume attempted. Check Dashboard (waiting_admin) or HITL."
        : "Invalid report injected. A failure ticket should appear under Tickets."
    );
    loadDashboard();
    console.log(result);
  } catch (e) {
    alert("Error: " + e.message);
  }
};

window.injectCustomerDocuments = async function (runId, valid) {
  const data_updates = valid
    ? {
        customer_documents: {
          reference: "DOC-DEMO-001",
          file_type: "pdf",
          notes: "Boarding pass + delay confirmation",
        },
      }
    : {
        customer_documents: {
          reference: "DOC-BAD",
          // missing file_type → ticket path
        },
      };
  try {
    await api(`/api/agents/runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({
        data_updates,
        transition_name: valid ? "customer_documents_received" : "customer_documents_invalid_injected",
      }),
    });
    alert(valid ? "Documents injected." : "Invalid documents injected — expect a ticket.");
    loadDashboard();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

window.injectPaymentResult = async function (runId, result) {
  try {
    await api(`/api/agents/runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({
        data_updates: { payment_result: result },
        transition_name: "payment_result_received",
      }),
    });
    alert(`Payment result "${result}" injected.`);
    loadDashboard();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

window.injectSafetyExternal = async function (runId, kind) {
  const data_updates =
    kind === "authority_ack"
      ? {
          authority_acknowledgement: {
            reference: "AUTH-ACK-001",
            status: "received",
            notes: "Regulator acknowledged filing",
          },
        }
      : {
          ground_or_crew_report: {
            reference: "GCR-001",
            summary: "Ground crew confirmed bird remains on runway 27L",
            evidence_complete: true,
          },
        };
  try {
    await api(`/api/agents/runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({
        data_updates,
        transition_name: kind === "authority_ack" ? "authority_ack_received" : "ground_report_received",
      }),
    });
    alert("External safety data injected.");
    loadDashboard();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

window.promptGenericResume = async function (runId) {
  const raw = prompt(
    "Paste JSON for data_updates (example: {\"maintenance_report\":{...}})",
    "{}"
  );
  if (!raw) return;
  try {
    const data_updates = JSON.parse(raw);
    await api(`/api/agents/runs/${runId}/resume`, {
      method: "POST",
      body: JSON.stringify({ data_updates, transition_name: "platform_manual_resume" }),
    });
    alert("Resumed.");
    loadDashboard();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

// ---- Agents + tool permissions ----
async function loadAgents() {
  const el = document.getElementById("agents-list");
  try {
    const data = await api("/api/agents");
    const agents = data.agents || [];
    const blocks = [];
    for (const a of agents) {
      let toolsHtml = `<div style="color:var(--muted);font-size:0.85rem">Loading tools…</div>`;
      try {
        const toolsData = await api(`/api/admin/tools?agent=${encodeURIComponent(a.type)}`);
        const tools = toolsData.tools || [];
        if (!tools.length) {
          toolsHtml = `<div style="color:var(--muted);font-size:0.85rem">No tool permissions rows yet (seed agent_tool_permissions).</div>`;
        } else {
          toolsHtml = tools
            .map(
              (t) => `
            <label class="checkbox tool-row">
              <input type="checkbox" ${t.is_enabled ? "checked" : ""}
                onchange="toggleTool('${a.type}', '${t.tool_name}', this.checked)" />
              <span>${t.tool_name}</span>
            </label>`
            )
            .join("");
        }
      } catch {
        toolsHtml = `<div style="color:var(--muted);font-size:0.85rem">Tool API unavailable — backend may not expose /api/admin/tools yet.</div>`;
      }
      blocks.push(`
        <div class="card">
          <strong>${a.name}</strong>
          <div style="color:var(--muted);font-size:0.85rem">${a.type} · owner: ${a.owner}</div>
          <div class="actions" style="margin-top:0.5rem">
            <button class="btn secondary" onclick="goStart('${a.type}')">Start from form →</button>
          </div>
          <div style="margin-top:0.75rem"><strong style="font-size:0.85rem">Tools</strong></div>
          ${toolsHtml}
        </div>`);
    }
    el.innerHTML = blocks.join("") || `<div class="card">No agents registered.</div>`;
  } catch (e) {
    el.innerHTML = `<div class="card">Error: ${e.message}</div>`;
  }
}

window.goStart = function (type) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const btn = document.querySelector('nav button[data-view="start"]');
  if (btn) btn.classList.add("active");
  document.getElementById("view-start").classList.add("active");
  const map = {
    maintenance_release: "maintenance-form",
    compensation_appeal: "compensation-form",
    safety_incident: "safety-form",
  };
  const form = document.getElementById(map[type] || "safety-form");
  if (form) form.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.toggleTool = async function (agent, tool, enabled) {
  try {
    await api("/api/admin/tools", {
      method: "POST",
      body: JSON.stringify({
        agent_name: agent,
        tool_name: tool,
        is_enabled: enabled,
        updated_by: "platform_admin",
      }),
    });
  } catch (e) {
    alert("Could not update tool permission: " + e.message);
    loadAgents();
  }
};

// ---- HITL ----
async function loadHitl() {
  const el = document.getElementById("hitl-tasks");
  const detail = document.getElementById("hitl-detail");
  detail.classList.add("hidden");
  try {
    const data = await api("/api/admin/tasks");
    const tasks = data.tasks || [];
    if (!tasks.length) {
      el.innerHTML = `<div class="card">No pending HITL tasks.</div>
        <div class="card">
          <label>Manual decide — Task ID <input id="manual-task-id" placeholder="task uuid" /></label>
          <label>Run ID <input id="manual-run-id" placeholder="run uuid" /></label>
          <label>Comment <textarea id="manual-comment" rows="2"></textarea></label>
          <div class="actions">
            <button class="btn" onclick="manualDecide('approved')">Approve</button>
            <button class="btn secondary" onclick="manualDecide('rejected')">Reject</button>
            <button class="btn secondary" onclick="manualDecide('changes_requested')">Request changes</button>
          </div>
        </div>`;
      return;
    }
    el.innerHTML = tasks
      .map(
        (t) => `
      <div class="card">
        <strong>${t.title || t.task_type || "Task"}</strong> ${badge(t.status || "open")}
        <div style="color:var(--muted);font-size:0.85rem">${t.task_id} · run ${t.run_id || "—"}</div>
        <div class="actions">
          <button class="btn" onclick='openHitlDetail(${JSON.stringify(t).replace(/'/g, "&#39;")})'>Review</button>
        </div>
      </div>`
      )
      .join("");
  } catch (e) {
    el.innerHTML = `<div class="card">Error: ${e.message}</div>`;
  }
}

window.openHitlDetail = function (task) {
  const detail = document.getElementById("hitl-detail");
  const payload = task.request_payload || task.payload || task.decision_payload || {};
  let body = "";
  if (typeof payload === "string") {
    try {
      body = JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      body = payload;
    }
  } else {
    body = JSON.stringify(payload, null, 2);
  }
  const report =
    payload.draft_report ||
    payload.report ||
    payload.maintenance_report ||
    body ||
    "(no payload attached)";
  detail.classList.remove("hidden");
  detail.innerHTML = `
    <h3>${task.title || task.task_type || "Admin task"}</h3>
    <p class="hint">${task.request_message || ""}</p>
    <pre>${typeof report === "string" ? report : JSON.stringify(report, null, 2)}</pre>
    <label>Comment <textarea id="hitl-comment" rows="2"></textarea></label>
    <div class="actions">
      <button class="btn" onclick="decide('${task.task_id}', 'approved', '${task.run_id || ""}')">Approve</button>
      <button class="btn secondary" onclick="decide('${task.task_id}', 'rejected', '${task.run_id || ""}')">Reject</button>
      <button class="btn secondary" onclick="decide('${task.task_id}', 'changes_requested', '${task.run_id || ""}')">Request changes</button>
    </div>`;
};

window.decide = async function (taskId, decision, runId) {
  const comment = document.getElementById("hitl-comment")?.value || "";
  try {
    await api(`/api/admin/tasks/${taskId}/decide`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        decided_by: "platform_admin",
        comment,
        run_id: runId || undefined,
      }),
    });
    alert(`Decision "${decision}" submitted. Graph will resume from checkpoint.`);
    loadHitl();
    loadDashboard();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

window.manualDecide = async function (decision) {
  const taskId = document.getElementById("manual-task-id")?.value;
  const runId = document.getElementById("manual-run-id")?.value;
  const comment = document.getElementById("manual-comment")?.value || "";
  if (!taskId) return alert("Task ID required");
  try {
    await api(`/api/admin/tasks/${taskId}/decide`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        decided_by: "platform_admin",
        comment,
        run_id: runId || undefined,
      }),
    });
    alert(`Decision "${decision}" submitted.`);
    loadHitl();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

// ---- Tickets ----
async function loadTickets() {
  const el = document.getElementById("tickets-list");
  try {
    const data = await api("/api/admin/tickets");
    const tickets = data.tickets || [];
    if (!tickets.length) {
      el.innerHTML = `<div class="card">No open tickets.</div>`;
      return;
    }
    el.innerHTML = tickets
      .map(
        (t) => `
      <div class="card">
        <strong>${t.error_type || "ticket"}</strong> ${badge(t.status || "open")}
        <div style="font-size:0.85rem;margin:0.35rem 0">${t.error_message || ""}</div>
        <div style="color:var(--muted);font-size:0.8rem">${t.ticket_id} · run ${t.run_id || "—"} · node ${t.failed_node || "—"}</div>
        <div class="actions">
          <button class="btn" onclick="resolveTicket('${t.ticket_id}')">Resolve &amp; resume</button>
        </div>
      </div>`
      )
      .join("");
  } catch (e) {
    el.innerHTML = `<div class="card">Error: ${e.message}</div>`;
  }
}

window.resolveTicket = async function (ticketId) {
  const notes = prompt("Resolution notes:", "Corrected payload / gateway fixed") || "Resolved";
  try {
    await api(`/api/admin/tickets/${ticketId}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        resolved_by: "admin",
        resolution_notes: notes,
        resume: true,
      }),
    });
    alert("Ticket resolved; workflow resume attempted.");
    loadTickets();
    loadDashboard();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

// ---- Start forms (all three agents) ----
function bindStartForm(formId, resultId, buildBody) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = buildBody(fd);
    const out = document.getElementById(resultId);
    out.classList.remove("hidden");
    out.textContent = "Starting…";
    try {
      const result = await api("/api/agents/start", {
        method: "POST",
        body: JSON.stringify(body),
      });
      showResult(out, result);
      // Refresh dashboard so the new run appears
      setTimeout(loadDashboard, 400);
    } catch (err) {
      showResult(out, "Error: " + err.message);
    }
  });
}

bindStartForm("maintenance-form", "maintenance-result", (fd) => ({
  agent_type: "maintenance_release",
  flight_number: fd.get("flight_number"),
  requested_by: fd.get("requested_by") || "platform_user",
}));

bindStartForm("compensation-form", "compensation-result", (fd) => ({
  agent_type: "compensation_appeal",
  flight_number: fd.get("flight_number"),
  passenger_email: fd.get("passenger_email"),
  appeal_reason: fd.get("appeal_reason"),
  requested_amount: parseFloat(fd.get("requested_amount") || "0"),
  currency: "USD",
  loyalty_tier: fd.get("loyalty_tier"),
  requested_by: fd.get("requested_by") || "platform_user",
}));

bindStartForm("safety-form", "safety-result", (fd) => ({
  agent_type: "safety_incident",
  flight_number: fd.get("flight_number"),
  incident_type: fd.get("incident_type"),
  severity: fd.get("severity"),
  description: fd.get("description") || "",
  has_passenger_impact: fd.get("has_passenger_impact") === "on",
}));

// Initial load
loadDashboard();
