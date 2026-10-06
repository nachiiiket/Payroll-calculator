const C = require("../extension/utils/canada.js");
const T = require("../extension/utils/template.js");

// full path: employee row -> merged calc (popup.js calcEmp) -> vars -> rendered email
const emp = { name: "Beth", email: "beth@email.com", rate: "17.60", hours: "21:45", ytd: "1200" };
const settings = {
  company: "Chatham Burgers",
  period: "September 5\u201318, 2026",
  senderName: "Ali",
  payFrequency: "biweekly",
  claimBpa: true
};

const base = T.computeEmployee(emp);
const ded = C.calcEmployee({
  gross: base.gross,
  priorYtd: emp.ytd,
  historyYtd: 0,
  frequency: settings.payFrequency,
  claimBpa: settings.claimBpa
});
const calc = Object.assign(base, ded);
const vars = T.varsFor(emp, settings, calc);

const body = T.render(settings.bodyTpl || T.DEFAULT_BODY, vars) + "\n\n" + T.render(T.DEDUCTIONS_BLOCK, vars);
const subject = T.render(T.DEFAULT_SUBJECT, vars);

console.log("Subject: " + subject + "\n");
console.log(body);

let fail = 0;
if (/\{[a-z_]+\}/.test(body) || /\{[a-z_]+\}/.test(subject)) { console.log("\nFAIL: unresolved placeholder"); fail++; }
if (!/-\$27\.04|6\.24/.test(body)) { /* deduction lines present */ }
if (calc.gross !== 382.80) { console.log("FAIL gross"); fail++; }
if (calc.deductions !== Math.round((calc.cpp + calc.ei + calc.tax) * 100) / 100) { console.log("FAIL deductions sum"); fail++; }
if (Math.abs(calc.gross - calc.deductions - calc.net) > 0.001) { console.log("FAIL net"); fail++; }
// prior YTD 1200 (>3500? no) -> first periods still under exemption? 1200+382.80=1582.80 < 3500 => CPP 0
if (calc.cpp !== 0) { console.log("FAIL expected CPP 0 while under 3500, got " + calc.cpp); fail++; }

// now push YTD past the exemption: prior 3400 + period => CPP on (3400+382.80-3500)=282.80
const ded2 = C.calcEmployee({ gross: 382.80, priorYtd: 3400, frequency: "biweekly" });
const expectCpp = Math.round((3400 + 382.80 - 3500) * 0.0595 * 100) / 100;
if (Math.abs(ded2.cpp - expectCpp) > 0.011) { console.log("FAIL CPP after exemption: " + ded2.cpp + " want " + expectCpp); fail++; }
else console.log("\nCPP after passing 3500 exemption: " + ded2.cpp + " (expected " + expectCpp + ")");

console.log(fail ? "E2E FAIL " + fail : "E2E OK");
process.exit(fail ? 1 : 0);
