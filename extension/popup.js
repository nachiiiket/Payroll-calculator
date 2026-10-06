let settings = null;
let roster = [];
let port = null;
let running = false;
let saveTimer = null;
let historyYtd = {};
let calculated = null;

const EMBED = new URLSearchParams(location.search).get("embed") === "1";
const $ = id => document.getElementById(id);
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function connectPort() {
  port = chrome.runtime.connect({ name: "popup" });
  port.onMessage.addListener(onPortMessage);
  port.onDisconnect.addListener(() => { port = null; setTimeout(connectPort, 1000); });
}

function onPortMessage(m) {
  if (m.action === "payrollLog") addLog(m.type, m.message);
  if (m.action === "verifyResult") showVerify(m, m.silent === true);
  if (m.action === "payrollFinished") setRunning(false);
}

function addLog(type, text) {
  const logEl = $("log");
  const entry = document.createElement("div");
  entry.className = "log-entry log-" + (type || "info");
  entry.textContent = text;
  logEl.appendChild(entry);
  while (logEl.children.length > 60) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    collectDates();
    Storage.saveSettings(settings);
  }, 400);
}

function collectDates() {
  settings.dateFrom = $("dateFrom").value;
  settings.dateTo = $("dateTo").value;
  settings.mode = $("sendMode").value;
}

function setVerifyAlert(message) {
  const el = $("verifyAlert");
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function showVerify(result, silent) {
  const badge = $("verifyBadge");
  if (result.ok) {
    badge.className = "badge badge-ok";
    badge.textContent = "Verified: " + result.detected;
    setVerifyAlert(null);
    if (!silent) addLog("success", "Sender verified: " + result.detected);
  } else {
    const isMismatch = /mismatch/i.test(String(result.error || ""));
    badge.className = "badge badge-bad";
    badge.textContent = isMismatch ? "Sender mismatch!" : "Not verified";
    setVerifyAlert(result.error || "Sender verification failed.");
    if (!silent) addLog("error", result.error || "Sender verification failed.");
  }
}

function isoParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function formatPeriod(fromISO, toISO) {
  const f = isoParts(fromISO);
  const t = isoParts(toISO);
  if (!f || !t || t < f) return "";
  const sameYear = f.getFullYear() === t.getFullYear();
  const sameMonth = sameYear && f.getMonth() === t.getMonth();
  if (sameMonth) {
    return MONTHS[f.getMonth()] + " " + f.getDate() + "\u2013" + t.getDate() + ", " + t.getFullYear();
  }
  const left = MONTHS[f.getMonth()] + " " + f.getDate() + (sameYear ? "" : ", " + f.getFullYear());
  return left + " \u2013 " + MONTHS[t.getMonth()] + " " + t.getDate() + ", " + t.getFullYear();
}

function suggestFrequency(fromISO, toISO) {
  const f = isoParts(fromISO);
  const t = isoParts(toISO);
  if (!f || !t || t < f) return null;
  const days = Math.round((t - f) / 86400000) + 1;
  if (days === 7) return "weekly";
  if (days === 14) return "biweekly";
  if (days === 15 || days === 16) return "semimonthly";
  if (days >= 28 && days <= 31) return "monthly";
  return null;
}

function runYear() {
  const t = isoParts(settings.dateTo);
  return t ? t.getFullYear() : new Date().getFullYear();
}

async function refreshYtd() {
  const year = runYear();
  historyYtd = await Storage.yearGrossByEmail(year);
}

function selectedEmployee() {
  const i = Number($("empSel").value);
  return roster[i] || null;
}

function meaningfulEmployees(list) {
  return (list || []).filter(e =>
    String(e.name || "").trim() || String(e.email || "").trim() || parseFloat(e.rate) > 0);
}

function renderRoster() {
  const sel = $("empSel");
  const previous = sel.value;
  sel.innerHTML = "";
  roster.forEach((emp, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = (emp.name || "").trim() || (emp.email || "").trim() || "Employee " + (i + 1);
    sel.appendChild(opt);
  });
  if (previous !== "" && Number(previous) < roster.length) sel.value = previous;
  if (!roster.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No employees - open the dashboard";
    sel.appendChild(opt);
  }
  fillEmployee();
}

function fillEmployee() {
  const emp = selectedEmployee();
  $("rate").value = emp && parseFloat(emp.rate) > 0 ? "$" + Number(emp.rate).toFixed(2) + " / hr" : "";
  $("empEmail").value = emp ? (emp.email || "") : "";
  invalidateCalc();
}

function invalidateCalc() {
  calculated = null;
  ["sGross", "sCpp", "sEi", "sTax", "sNet"].forEach(id => { $(id).textContent = "\u2014"; });
  $("calcNote").hidden = true;
  $("btnRun").disabled = true;
}

function updatePeriodText() {
  const label = formatPeriod($("dateFrom").value, $("dateTo").value);
  $("periodText").textContent = label || "Pick the pay period dates";
  return label;
}

function onDatesChanged() {
  const prevFreq = settings.payFrequency;
  collectDates();
  const label = updatePeriodText();
  if (label) settings.period = label;
  const suggested = suggestFrequency(settings.dateFrom, settings.dateTo);
  if (suggested && suggested !== prevFreq) {
    settings.payFrequency = suggested;
    addLog("info", "Pay frequency set to " + suggested + " from the date range.");
  }
  refreshYtd();
  invalidateCalc();
  scheduleSave();
}

function calculate() {
  collectDates();
  const emp = selectedEmployee();
  const errors = [];

  if (!emp) errors.push("Add an employee in the dashboard first.");
  if (emp && !(parseFloat(emp.rate) > 0)) errors.push((emp.name || "The employee") + " has no hourly rate - set it in the dashboard.");
  if (!$("hours").value.trim()) errors.push("Enter the working hours.");
  else if (PayrollTemplate.parseHours($("hours").value) == null) {
    errors.push("Hours could not be read (use 21.75, 21:45 or 21 hrs 45 mins).");
  }
  if (!isoParts(settings.dateFrom) || !isoParts(settings.dateTo)) errors.push("Pick the pay period dates (From / To).");
  else if (isoParts(settings.dateTo) < isoParts(settings.dateFrom)) errors.push("The end date is before the start date.");

  if (errors.length) {
    errors.forEach(e => addLog("error", e));
    invalidateCalc();
    return null;
  }

  const base = PayrollTemplate.computeEmployee({ rate: emp.rate, hours: $("hours").value });
  const ded = CanadaPayroll.calcEmployee({
    gross: base.gross,
    priorYtd: emp.ytd,
    historyYtd: historyYtd[String(emp.email || "").trim().toLowerCase()] || 0,
    frequency: settings.payFrequency,
    claimBpa: settings.claimBpa
  });
  const calc = Object.assign(base, ded);

  $("sGross").textContent = "$" + calc.gross.toFixed(2);
  $("sCpp").textContent = "$" + calc.cpp.toFixed(2);
  $("sEi").textContent = "$" + calc.ei.toFixed(2);
  $("sTax").textContent = "$" + calc.tax.toFixed(2);
  $("sNet").textContent = "$" + calc.net.toFixed(2);
  $("calcSub").textContent = (settings.payFrequency || "biweekly") + " \u00b7 2026 CRA \u00b7 Ontario" +
    (settings.claimBpa ? "" : " \u00b7 no TD1 claim");
  $("calcYtd").textContent = "Hours: " + calc.hours_hm + " \u00b7 period: " +
    (settings.period || "\u2014") + " \u00b7 prior YTD before this run: $" + calc.ytdBefore.toFixed(2);
  $("calcNote").hidden = false;
  $("btnRun").disabled = false;

  calculated = calc;
  addLog("success", "Calculated " + (emp.name || emp.email) + ": net $" + calc.net.toFixed(2) +
    " (gross $" + calc.gross.toFixed(2) + " \u2212 deductions $" + calc.deductions.toFixed(2) + ")");
  return calc;
}

function validateForRun() {
  const errors = [];
  const emp = selectedEmployee();
  const tpl = (settings.subjectTpl || "") + "\n" + (settings.bodyTpl || "");

  if (!emp) errors.push("Add an employee in the dashboard first.");
  if (!EMAIL_RX.test(settings.senderEmail.trim())) errors.push("Set the employer (sender) email in the dashboard.");
  if (!settings.company.trim()) errors.push("Set the company name in the dashboard.");
  if (!String(settings.subjectTpl || "").trim()) errors.push("The subject template is empty - edit it in the dashboard.");
  if (!String(settings.bodyTpl || "").trim()) errors.push("The body template is empty - edit it in the dashboard.");
  if (tpl.indexOf("{sender_name}") !== -1 && !settings.senderName.trim()) {
    errors.push("The template uses {sender_name} but the sign-off name is empty in the dashboard.");
  }
  if (emp && !EMAIL_RX.test(String(emp.email || "").trim())) {
    errors.push((emp.name || "Employee") + " needs a valid email in the dashboard.");
  }

  const probe = {};
  PayrollTemplate.PLACEHOLDERS.forEach(ph => { probe[ph] = "\u0001"; });
  const unknown = (PayrollTemplate.render(tpl, probe).match(/\{[a-z_]+\}/g) || []);
  if (unknown.length) {
    errors.push("Unknown placeholder(s): " + Array.from(new Set(unknown)).join(", "));
  }
  return errors;
}

function buildEmail(calc) {
  const emp = selectedEmployee();
  const vars = PayrollTemplate.varsFor(emp, settings, calc);
  const keyBase = (settings.dateFrom && settings.dateTo)
    ? settings.dateFrom + "|" + settings.dateTo
    : String(settings.period || "").trim().toLowerCase();
  return {
    to: String(emp.email || "").trim(),
    name: String(emp.name || "").trim(),
    subject: PayrollTemplate.render(settings.subjectTpl, vars),
    body: PayrollTemplate.render(settings.bodyTpl, vars),
    key: keyBase + "|" + String(emp.email || "").trim().toLowerCase(),
    gross: calc.gross,
    cpp: calc.cpp,
    ei: calc.ei,
    tax: calc.tax,
    net: calc.net,
    rate: calc.rate,
    hours: calc.hours,
    year: runYear()
  };
}

function setRunning(state) {
  running = state;
  $("btnRun").style.display = state ? "none" : "inline-block";
  $("btnStop").style.display = state ? "inline-block" : "none";
  $("btnCalculate").disabled = state;
  $("empSel").disabled = state;
}

function run() {
  if (running) return;
  collectDates();

  const calc = calculated || calculate();
  if (!calc) return;

  const errors = validateForRun();
  if (errors.length) {
    errors.forEach(e => addLog("error", e));
    addLog("warn", "Fix the errors above (they live in the dashboard), then retry.");
    return;
  }
  if (!port) {
    addLog("error", "Extension background not ready - close and reopen this window.");
    return;
  }

  Storage.saveSettings(settings);
  const email = buildEmail(calc);
  const mode = settings.mode === "send" ? "send" : "draft";
  setRunning(true);
  addLog("info", "Queued " + email.name + " in " + (mode === "send" ? "send" : "draft") + " mode.");
  port.postMessage({
    action: "sendPayroll",
    emails: [email],
    mode,
    speed: settings.speed,
    skipSent: settings.skipSent,
    senderEmail: settings.senderEmail.trim().toLowerCase(),
    period: settings.period || "",
    dateFrom: settings.dateFrom,
    dateTo: settings.dateTo
  });
}

function bindEvents() {
  $("btnDashboard").addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("empSel").addEventListener("change", fillEmployee);

  ["hours"].forEach(id => {
    $(id).addEventListener("input", invalidateCalc);
  });

  ["dateFrom", "dateTo"].forEach(id => {
    $(id).addEventListener("change", onDatesChanged);
  });

  $("sendMode").addEventListener("change", () => {
    settings.mode = $("sendMode").value;
    $("btnRun").textContent = settings.mode === "send" ? "Send email" : "Create draft email";
    scheduleSave();
  });

  $("btnCalculate").addEventListener("click", calculate);
  $("btnRun").addEventListener("click", run);

  $("btnStop").addEventListener("click", () => {
    if (port) port.postMessage({ action: "abortSend" });
    addLog("warn", "Stopping after the current email...");
  });
}

async function init() {
  if (EMBED && document.body) document.body.classList.add("embed");

  settings = await Storage.getSettings();
  roster = meaningfulEmployees(settings.employees);

  $("dateFrom").value = settings.dateFrom || "";
  $("dateTo").value = settings.dateTo || "";
  $("sendMode").value = settings.mode === "send" ? "send" : "draft";
  $("btnRun").textContent = settings.mode === "send" ? "Send email" : "Create draft email";

  if (!settings.period && settings.dateFrom && settings.dateTo) {
    settings.period = formatPeriod(settings.dateFrom, settings.dateTo);
  }
  updatePeriodText();

  renderRoster();
  bindEvents();
  connectPort();
  await refreshYtd();

  if (!roster.length) {
    addLog("warn", "No employees yet - click the gear icon to open the dashboard and add them.");
  } else if (!settings.senderEmail) {
    addLog("warn", "First time setup: open the dashboard (gear icon) to save employer details and the template.");
  } else {
    addLog("info", "Pick an employee, enter hours and dates, then Calculate.");
    if (EMAIL_RX.test(settings.senderEmail.trim()) && port) {
      addLog("info", "Checking the signed-in Gmail account...");
      port.postMessage({ action: "verifySender", expected: settings.senderEmail.trim().toLowerCase() });
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
