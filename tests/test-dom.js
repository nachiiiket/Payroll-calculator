const fs = require("fs");
const ext = __dirname + "/../extension/";
let fail = 0;

function checkPage(page, script, requiredScripts) {
  const html = fs.readFileSync(ext + page, "utf8");
  const js = fs.readFileSync(ext + script, "utf8");

  const ids = new Set();
  for (const m of js.matchAll(/\$\("([A-Za-z0-9_]+)"\)/g)) ids.add(m[1]);
  for (const m of js.matchAll(/getElementById\("([A-Za-z0-9_]+)"\)/g)) ids.add(m[1]);

  const missing = [...ids].filter(id => !html.includes('id="' + id + '"'));
  console.log(page + ": " + ids.size + " ids referenced, missing: " + (missing.length ? missing.join(", ") : "none"));
  if (missing.length) fail++;

  const htmlIds = [...html.matchAll(/id="([A-Za-z0-9_]+)"/g)].map(m => m[1]);
  const unused = htmlIds.filter(id => !ids.has(id));
  console.log("  unused html ids: " + (unused.join(", ") || "none"));

  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const orderOk = requiredScripts.every((s, i) => scripts[i] === s);
  console.log("  script order: " + scripts.join(" -> ") + (orderOk ? " [ok]" : " [WRONG]"));
  if (!orderOk) fail++;
  return html;
}

checkPage("popup.html", "popup.js", ["utils/canada.js", "utils/storage.js", "utils/template.js", "popup.js"]);
checkPage("dashboard.html", "dashboard.js", ["utils/canada.js", "utils/storage.js", "utils/template.js", "dashboard.js"]);

const panel = fs.readFileSync(ext + "panel.js", "utf8");
const panelOk = panel.includes('popup.html") + "?embed=1');
console.log("panel embed url: " + (panelOk ? "ok" : "MISSING"));
if (!panelOk) fail++;

const manifest = JSON.parse(fs.readFileSync(ext + "manifest.json", "utf8"));
const optOk = manifest.options_ui && manifest.options_ui.page === "dashboard.html";
console.log("manifest options_ui -> dashboard: " + (optOk ? "ok" : "MISSING"));
if (!optOk) fail++;
const scripts = manifest.content_scripts.map(c => c.js.join(",")).join(" | ");
console.log("manifest content scripts: " + scripts);
if (!manifest.content_scripts.some(c => c.js.includes("panel.js"))) fail++;

const popupJs = fs.readFileSync(ext + "popup.js", "utf8");
const dashJs = fs.readFileSync(ext + "dashboard.js", "utf8");
const popupEditsTpl = /\$\("(subjectTpl|bodyTpl|senderEmail|company)"\)/.test(popupJs);
console.log("popup does not edit setup fields: " + (!popupEditsTpl ? "ok" : "FAIL"));
if (popupEditsTpl) fail++;
console.log("dashboard exports CSV: " + (dashJs.includes("text/csv") ? "ok" : "FAIL"));
if (!dashJs.includes("text/csv")) fail++;

if (fail) { console.log("FAILURES: " + fail); process.exit(1); }
console.log("ALL OK");
