importScripts("utils/storage.js");

let sendAbort = false;

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function log(port, type, message, extra) {
  const msg = Object.assign({ action: "payrollLog", type, message }, extra || {});
  try { if (port) port.postMessage(msg); } catch (e) { /* port disconnected */ }
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icons/icon-48.png", title, message });
}

async function getGmailTab() {
  const tabs = await chrome.tabs.query({ url: "https://mail.google.com/*" });
  if (tabs.length) return tabs[0];
  const all = await chrome.tabs.query({});
  return all.find(t => t.url && t.url.includes("mail.google.com")) || null;
}

async function isContentScriptReady(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return !!(r && r.ok);
  } catch (e) {
    return false;
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForReady(tabId, timeoutMs) {
  const step = 1000;
  for (let elapsed = 0; elapsed < timeoutMs; elapsed += step) {
    if (sendAbort) return false;
    if (await isContentScriptReady(tabId)) return true;
    await wait(step);
  }
  return false;
}

async function ensureGmailReady(port) {
  let tab = await getGmailTab();

  if (tab) {
    if (await isContentScriptReady(tab.id)) return tab.id;
    log(port, "info", "Gmail tab is not responding - refreshing it automatically...");
    try { await chrome.tabs.reload(tab.id); } catch (e) { /* tab may be gone */ }
    if (await waitForReady(tab.id, 30000)) {
      log(port, "success", "Gmail refreshed and ready.");
      return tab.id;
    }
    log(port, "warn", "Gmail is still not responding - reloading it once more...");
    try { await chrome.tabs.reload(tab.id); } catch (e) { /* ignore */ }
    if (await waitForReady(tab.id, 30000)) {
      log(port, "success", "Gmail refreshed and ready.");
      return tab.id;
    }
    return null;
  }

  log(port, "info", "No Gmail tab found - opening Gmail for you...");
  notify("Opening Gmail", "No Gmail tab was found, so one is being opened automatically.");
  let created;
  try {
    created = await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/" });
  } catch (e) {
    return null;
  }
  if (await waitForReady(created.id, 60000)) {
    log(port, "success", "Gmail opened and ready.");
    return created.id;
  }
  return null;
}

async function queryAccountEmail(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { action: "getAccountEmail" });
    return (r && r.email) || null;
  } catch (e) {
    return null;
  }
}

async function detectSender(expected) {
  if (!expected) return { ok: false, error: "Set the sender (employer) email first." };
  sendAbort = false;

  let tabId = await ensureGmailReady(null);
  if (!tabId) {
    return { ok: false, error: "Gmail could not be reached. Open mail.google.com in a tab and try again." };
  }

  let detected = await queryAccountEmail(tabId);

  if (!detected) {
    log(null, "info", "Gmail did not report the signed-in account - refreshing it automatically and retrying...");
    try { await chrome.tabs.reload(tabId); } catch (e) { /* ignore */ }
    if (!(await waitForReady(tabId, 30000))) {
      return { ok: false, error: "Gmail did not finish refreshing. Please try again in a moment." };
    }
    detected = await queryAccountEmail(tabId);
    if (!detected) {
      return { ok: false, error: "Could not detect the signed-in Gmail account, even after refreshing. Make sure the account avatar is visible in the top-right corner of Gmail." };
    }
  }

  const match = detected === String(expected).trim().toLowerCase();
  if (!match) {
    return {
      ok: false,
      detected,
      error: "Sender mismatch: Gmail is signed in as " + detected + " but the employer email is " + expected + "."
    };
  }
  return { ok: true, detected };
}

async function runPayroll(msg, port) {
  sendAbort = false;
  const emails = Array.isArray(msg.emails) ? msg.emails : [];
  const mode = msg.mode === "send" ? "send" : "draft";
  const speed = msg.speed != null ? Number(msg.speed) : 1000;
  const minDelay = speed === 0 ? 400 : speed;
  const maxDelay = speed === 0 ? 900 : speed * 2;

  if (!emails.length) {
    log(port, "warn", "No employees to process.");
    return;
  }

  const tabId = await ensureGmailReady(port);
  if (!tabId) {
    if (!sendAbort) {
      log(port, "error", "Gmail could not be prepared automatically. Open mail.google.com and try again.");
      notify("Payroll Stopped", "Gmail was unavailable, so the run was stopped.");
    }
    return;
  }

  log(port, "info", "Verifying sender account (" + (msg.senderEmail || "not set") + ")...");
  const verification = await detectSender(msg.senderEmail);
  if (!verification.ok) {
    log(port, "error", "Verification failed: " + verification.error);
    try {
      port.postMessage({ action: "verifyResult", ok: false, error: verification.error, detected: verification.detected, silent: true });
    } catch (e) { /* port disconnected */ }
    notify("Sender Verification Failed", verification.error);
    return;
  }
  log(port, "success", "Sender verified: " + verification.detected);
  try {
    port.postMessage({ action: "verifyResult", ok: true, detected: verification.detected, silent: true });
  } catch (e) { /* port disconnected */ }

  const history = await Storage.getHistory();
  const skipSent = msg.skipSent !== false;
  const verb = mode === "send" ? "Sending" : "Drafting";
  let done = 0;
  let skipped = 0;

  log(port, "info", verb + " " + emails.length + " payroll email(s)...");

  for (let i = 0; i < emails.length; i++) {
    if (sendAbort) {
      log(port, "warn", "Stopped by user after " + done + " of " + emails.length + ".");
      notify("Payroll Stopped", "Processed " + done + " of " + emails.length + " emails.");
      return;
    }

    const entry = emails[i];
    const label = entry.name ? entry.name + " (" + entry.to + ")" : entry.to;

    if (skipSent && Storage.historyHas(history, entry.key)) {
      skipped++;
      log(port, "info", "Skipped " + label + " - already processed for this period.");
      continue;
    }

    log(port, "progress", "[" + (i + 1) + "/" + emails.length + "] " + verb + " " + label + "...");

    let res;
    try {
      res = await chrome.tabs.sendMessage(tabId, {
        action: "fillGmailCompose",
        data: {
          to: entry.to,
          subject: entry.subject,
          body: entry.body,
          speed,
          autoSend: mode === "send",
          closeAfter: mode === "draft"
        }
      });
    } catch (e) {
      log(port, "error", "Gmail tab lost while processing " + label + ". Stopped.");
      notify("Payroll Interrupted", "The Gmail tab was closed. Remaining emails were not processed.");
      return;
    }

    if (res && res.ok) {
      done++;
      await Storage.addHistory({
        key: entry.key,
        to: entry.to,
        name: entry.name || "",
        period: msg.period || "",
        dateFrom: msg.dateFrom || "",
        dateTo: msg.dateTo || "",
        gross: Number(entry.gross) || 0,
        cpp: Number(entry.cpp) || 0,
        ei: Number(entry.ei) || 0,
        tax: Number(entry.tax) || 0,
        net: Number(entry.net) || 0,
        rate: Number(entry.rate) || 0,
        hours: Number(entry.hours) || 0,
        year: Number(entry.year) || new Date().getFullYear(),
        mode,
        at: new Date().toLocaleString()
      });
      log(port, "success", (mode === "send" ? "Sent to " : "Draft saved for ") + label);
    } else {
      log(port, "warn", "Failed for " + label + ": " + ((res && res.error) || "unknown error"));
    }

    if (i < emails.length - 1 && minDelay > 0) {
      await new Promise(r => setTimeout(r, rand(minDelay, maxDelay)));
    }
  }

  const summary = (mode === "send" ? "Sent " : "Drafted ") + done + " of " + emails.length + " email(s)" + (skipped ? ", skipped " + skipped + " already processed" : "") + ".";
  log(port, "done", summary);
  notify("Payroll Complete", summary);
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "popup" && port.name !== "dashboard") return;
  port.onMessage.addListener(async msg => {
    try {
      if (msg.action === "verifySender") {
        const result = await detectSender(msg.expected);
        try {
          port.postMessage(Object.assign({ action: "verifyResult" }, result));
        } catch (e) { /* port disconnected */ }
        return;
      }
      if (msg.action === "sendPayroll") {
        try {
          await runPayroll(msg, port);
        } finally {
          try { port.postMessage({ action: "payrollFinished" }); } catch (e) { /* port disconnected */ }
        }
        return;
      }
      if (msg.action === "abortSend") {
        sendAbort = true;
        return;
      }
    } catch (e) {
      console.error("payroll background error:", e);
      log(port, "error", "Unexpected error: " + (e && e.message));
    }
  });
});
