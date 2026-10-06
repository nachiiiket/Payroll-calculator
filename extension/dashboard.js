let settings = null;
let port = null;
let saveTimer = null;
let historyCache = [];

const $ = id => document.getElementById(id);
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2);
}

function connectPort() {
  port = chrome.runtime.connect({ name: "dashboard" });
  port.onMessage.addListener(m => {
    if (m.action === "verifyResult") showVerify(m);
  });
  port.onDisconnect.addListener(() => { port = null; setTimeout(connectPort, 1000); });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    collectSetup();
    Storage.saveSettings(settings);
  }, 400);
}

function saveNow() {
  clearTimeout(saveTimer);
  collectSetup();
  Storage.saveSettings(settings);
}

function collectSetup() {
  settings.senderEmail = $("senderEmail").value;
  settings.senderName = $("senderName").value;
  settings.company = $("company").value;
  settings.speed = Number($("speed").value);
  settings.skipSent = $("skipSent").checked;
  settings.claimBpa = $("claimBpa").checked;
  settings.subjectTpl = $("subjectTpl").value;
  settings.bodyTpl = $("bodyTpl").value;
}

function showVerify(result) {
  const badge = $("verifyBadge");
  const alert = $("verifyAlert");
  if (result.ok) {
    badge.className = "badge badge-ok";
    badge.textContent = "Verified: " + result.detected;
    alert.hidden = true;
    alert.textContent = "";
  } else {
    const isMismatch = /mismatch/i.test(String(result.error || ""));
    badge.className = "badge badge-bad";
    badge.textContent = isMismatch ? "Sender mismatch!" : "Not verified";
    alert.hidden = false;
    alert.textContent = result.error || "Sender verification failed.";
  }
}

function verify() {
  collectSetup();
  if (!EMAIL_RX.test(settings.senderEmail.trim())) {
    $("verifyAlert").hidden = false;
    $("verifyAlert").textContent = "Enter a valid sender (employer) email first.";
    return;
  }
  if (!port) return;
  Storage.saveSettings(settings);
  $("verifyAlert").hidden = true;
  port.postMessage({ action: "verifySender", expected: settings.senderEmail.trim().toLowerCase() });
}

// ---------- tabs ----------

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach(p => {
        p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab);
      });
      if (btn.dataset.tab === "history") loadHistory();
    });
  });
}

// ---------- template helpers ----------

function renderChips() {
  const wrap = $("chips");
  wrap.innerHTML = "";
  PayrollTemplate.PLACEHOLDERS.forEach(ph => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = "{" + ph + "}";
    b.title = "Insert {" + ph + "} into the body";
    b.addEventListener("click", () => insertAtCursor($("bodyTpl"), "{" + ph + "}"));
    wrap.appendChild(b);
  });
}

function insertAtCursor(ta, text) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const pos = start + text.length;
  ta.setSelectionRange(pos, pos);
  ta.focus();
  settings.bodyTpl = ta.value;
  scheduleSave();
}

// ---------- employees ----------

function blankEmployee() {
  return { name: "", email: "", rate: "", ytd: "" };
}

function renderEmployees() {
  const body = $("empBody");
  body.innerHTML = "";
  if (!settings.employees.length) settings.employees.push(blankEmployee());

  settings.employees.forEach((emp, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="num">' + (i + 1) + '</td>' +
      '<td><input data-i="' + i + '" data-f="name" value="' + esc(emp.name) + '" placeholder="Beth"></td>' +
      '<td><input data-i="' + i + '" data-f="email" type="email" value="' + esc(emp.email) + '" placeholder="beth@email.com"></td>' +
      '<td><input data-i="' + i + '" data-f="rate" type="number" step="0.01" min="0" value="' + esc(emp.rate) + '" placeholder="17.60"></td>' +
      '<td class="ytd"><input data-i="' + i + '" data-f="ytd" type="number" step="0.01" min="0" value="' + esc(emp.ytd) + '" placeholder="0.00"></td>' +
      '<td><button type="button" class="row-del" data-del="' + i + '" title="Remove employee">&times;</button></td>';
    body.appendChild(tr);
  });
}

// ---------- history ----------

async function loadHistory() {
  historyCache = await Storage.getHistory();
  renderHistoryFilters();
  renderHistory();
}

function renderHistoryFilters() {
  const empSel = $("histEmp");
  const yearSel = $("histYear");
  const prevEmp = empSel.value;
  const prevYear = yearSel.value;

  const byEmail = {};
  historyCache.forEach(h => {
    const email = String(h.to || "").toLowerCase();
    if (!email || byEmail[email]) return;
    byEmail[email] = h.name || email;
  });
  const years = Array.from(new Set(historyCache.map(h => h.year).filter(Boolean))).sort((a, b) => b - a);

  empSel.innerHTML = '<option value="">All employees</option>';
  Object.keys(byEmail).sort().forEach(email => {
    const opt = document.createElement("option");
    opt.value = email;
    opt.textContent = byEmail[email];
    empSel.appendChild(opt);
  });
  yearSel.innerHTML = '<option value="">All years</option>';
  years.forEach(y => {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  });

  if (prevEmp) empSel.value = prevEmp;
  if (prevYear) yearSel.value = prevYear;
}

function filteredHistory() {
  const email = $("histEmp").value;
  const year = $("histYear").value;
  return historyCache
    .filter(h => !email || String(h.to || "").toLowerCase() === email)
    .filter(h => !year || String(h.year) === year)
    .slice()
    .reverse();
}

function sumField(list, field) {
  return list.reduce((acc, h) => acc + (Number(h[field]) || 0), 0);
}

function renderHistory() {
  const view = $("histView").value;
  const rows = filteredHistory();
  const head = $("histHead");
  const body = $("histBody");
  const foot = $("histFoot");
  head.innerHTML = "";
  body.innerHTML = "";
  foot.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = '<tr><td class="empty">No payroll runs recorded yet.</td></tr>';
    $("histSummary").textContent = "";
    return;
  }

  const trHead = document.createElement("tr");
  const trFoot = document.createElement("tr");
  let bodyRows = [];
  let moneyCols = [];

  if (view === "runs") {
    moneyCols = [3, 4, 5, 6, 7, 8, 9];
    ["Date", "Employee", "Period", "Hours", "Rate", "Gross", "CPP", "EI", "Income tax", "Net pay", "Mode"]
      .forEach((th, i) => {
        const el = document.createElement("th");
        el.textContent = th;
        if (moneyCols.indexOf(i) !== -1) el.className = "money";
        trHead.appendChild(el);
      });

    bodyRows = rows.map(h => [
      h.at || "",
      h.name || h.to || "",
      h.period || ((h.dateFrom && h.dateTo) ? h.dateFrom + " \u2192 " + h.dateTo : ""),
      h.hours ? (Number(h.hours) % 1 ? Number(h.hours).toFixed(2) : String(Number(h.hours))) : "\u2014",
      h.rate ? money(h.rate) : "\u2014",
      money(h.gross), money(h.cpp), money(h.ei), money(h.tax), money(h.net),
      h.mode === "send" ? "Sent" : "Draft"
    ]);

    trFoot.innerHTML =
      '<td colspan="5" class="total-label">Totals (' + rows.length + " run" + (rows.length === 1 ? "" : "s") + ')</td>' +
      '<td class="money">' + money(sumField(rows, "gross")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "cpp")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "ei")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "tax")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "net")) + "</td><td></td>";
  } else {
    moneyCols = [1, 2, 3, 4, 5, 6];
    ["Employee", "Runs", "Gross paid", "CPP", "EI", "Income tax", "Net paid"]
      .forEach((th, i) => {
        const el = document.createElement("th");
        el.textContent = th;
        if (moneyCols.indexOf(i) !== -1) el.className = "money";
        trHead.appendChild(el);
      });

    const groups = {};
    rows.forEach(h => {
      const email = String(h.to || "").toLowerCase();
      if (!groups[email]) groups[email] = { name: h.name || h.to || email, rows: [] };
      groups[email].rows.push(h);
    });
    bodyRows = Object.keys(groups).map(email => {
      const g = groups[email];
      return [
        g.name,
        String(g.rows.length),
        money(sumField(g.rows, "gross")),
        money(sumField(g.rows, "cpp")),
        money(sumField(g.rows, "ei")),
        money(sumField(g.rows, "tax")),
        money(sumField(g.rows, "net"))
      ];
    });

    trFoot.innerHTML =
      '<td class="total-label">Total (' + rows.length + " run" + (rows.length === 1 ? "" : "s") + ')</td>' +
      "<td>" + rows.length + "</td>" +
      '<td class="money">' + money(sumField(rows, "gross")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "cpp")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "ei")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "tax")) + "</td>" +
      '<td class="money">' + money(sumField(rows, "net")) + "</td>";
  }

  head.appendChild(trHead);
  bodyRows.forEach(cells => {
    const tr = document.createElement("tr");
    cells.forEach((c, i) => {
      const td = document.createElement("td");
      td.textContent = c;
      if (moneyCols.indexOf(i) !== -1) td.className = "money";
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  foot.appendChild(trFoot);

  const totalPaid = sumField(rows, "gross");
  const totalDed = sumField(rows, "cpp") + sumField(rows, "ei") + sumField(rows, "tax");
  $("histSummary").textContent =
    rows.length + " run" + (rows.length === 1 ? "" : "s") +
    " \u00b7 gross paid " + money(totalPaid) +
    " \u00b7 deductions " + money(totalDed) +
    " \u00b7 net paid " + money(totalPaid - totalDed);
}

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCsv() {
  const view = $("histView").value;
  const rows = filteredHistory();
  if (!rows.length) return;

  let table = [];
  if (view === "runs") {
    table.push(["Date", "Employee", "Email", "Period", "Hours", "Rate", "Gross", "CPP", "EI", "Income tax", "Net pay", "Mode"]);
    rows.forEach(h => table.push([
      h.at || "", h.name || "", h.to || "", h.period || "", h.hours || "", h.rate || "",
      h.gross || 0, h.cpp || 0, h.ei || 0, h.tax || 0, h.net || 0, h.mode === "send" ? "Sent" : "Draft"
    ]));
    table.push(["TOTAL", "", "", "", "", "",
      sumField(rows, "gross"), sumField(rows, "cpp"), sumField(rows, "ei"), sumField(rows, "tax"), sumField(rows, "net"), ""]);
  } else {
    table.push(["Employee", "Email", "Runs", "Gross paid", "CPP", "EI", "Income tax", "Net paid"]);
    const groups = {};
    rows.forEach(h => {
      const email = String(h.to || "").toLowerCase();
      if (!groups[email]) groups[email] = { name: h.name || h.to || email, rows: [] };
      groups[email].rows.push(h);
    });
    Object.keys(groups).forEach(email => {
      const g = groups[email];
      table.push([g.name, email, g.rows.length,
        sumField(g.rows, "gross"), sumField(g.rows, "cpp"), sumField(g.rows, "ei"),
        sumField(g.rows, "tax"), sumField(g.rows, "net")]);
    });
    table.push(["TOTAL", "", rows.length,
      sumField(rows, "gross"), sumField(rows, "cpp"), sumField(rows, "ei"),
      sumField(rows, "tax"), sumField(rows, "net")]);
  }

  const csv = table.map(r => r.map(csvCell).join(",")).join("\r\n");
  const year = $("histYear").value || "all-years";
  const scope = $("histEmp").value ? "-employee" : "";
  const name = "payroll-" + view + scope + "-" + year + ".csv";
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- bindings ----------

function bindEvents() {
  ["senderEmail", "senderName", "company", "subjectTpl", "bodyTpl"].forEach(id => {
    $(id).addEventListener("input", scheduleSave);
  });
  ["speed", "skipSent", "claimBpa"].forEach(id => {
    $(id).addEventListener("change", scheduleSave);
  });

  $("btnVerify").addEventListener("click", verify);

  $("btnDeductBlock").addEventListener("click", () => {
    insertAtCursor($("bodyTpl"), "\n" + PayrollTemplate.DEDUCTIONS_BLOCK + "\n");
  });
  $("btnResetTpl").addEventListener("click", () => {
    if (!confirm("Reset the subject and body template to the default?")) return;
    $("subjectTpl").value = PayrollTemplate.DEFAULT_SUBJECT;
    $("bodyTpl").value = PayrollTemplate.DEFAULT_BODY;
    saveNow();
  });

  $("btnAddEmp").addEventListener("click", () => {
    settings.employees.push(blankEmployee());
    saveNow();
    renderEmployees();
    const inputs = $("empBody").querySelectorAll("input");
    if (inputs.length) inputs[inputs.length - 4].focus();
  });

  $("empBody").addEventListener("input", e => {
    const el = e.target;
    const i = Number(el.dataset.i);
    const f = el.dataset.f;
    if (isNaN(i) || !f) return;
    settings.employees[i][f] = el.value;
    scheduleSave();
  });

  $("empBody").addEventListener("click", e => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    const i = Number(btn.dataset.del);
    settings.employees.splice(i, 1);
    if (!settings.employees.length) settings.employees.push(blankEmployee());
    saveNow();
    renderEmployees();
  });

  ["histView", "histEmp", "histYear"].forEach(id => {
    $(id).addEventListener("change", renderHistory);
  });
  $("btnExportCsv").addEventListener("click", exportCsv);
  $("btnClearHistory").addEventListener("click", async () => {
    if (!confirm("Clear the sent log? Everyone will be processed again for past periods.")) return;
    await Storage.clearHistory();
    await loadHistory();
  });
}

async function init() {
  settings = await Storage.getSettings();
  if (!settings.subjectTpl) settings.subjectTpl = PayrollTemplate.DEFAULT_SUBJECT;
  if (!settings.bodyTpl) settings.bodyTpl = PayrollTemplate.DEFAULT_BODY;
  if (!settings.employees.length) settings.employees.push(blankEmployee());

  $("senderEmail").value = settings.senderEmail;
  $("senderName").value = settings.senderName;
  $("company").value = settings.company;
  $("speed").value = String(settings.speed);
  $("skipSent").checked = settings.skipSent;
  $("claimBpa").checked = settings.claimBpa;
  $("subjectTpl").value = settings.subjectTpl;
  $("bodyTpl").value = settings.bodyTpl;

  initTabs();
  renderChips();
  renderEmployees();
  bindEvents();
  connectPort();
}

document.addEventListener("DOMContentLoaded", init);
