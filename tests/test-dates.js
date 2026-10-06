const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../extension/popup.js", "utf8");

// extract the real MONTHS constant and date helper functions from popup.js
const months = src.match(/const MONTHS = \[[^\]]+\];/);
const start = src.indexOf("function isoParts");
const end = src.indexOf("function runYear");
if (!months || start < 0 || end < 0) { console.log("FAIL: could not locate helpers"); process.exit(1); }
eval(months[0].replace(/^const /, "var ")); // var leaks to enclosing scope in sloppy mode
eval(src.slice(start, end));

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log((ok ? "PASS " : "FAIL ") + name + " | got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}

check("same month/yr (matches payroll-conv.txt style)", formatPeriod("2026-09-05", "2026-09-18"), "September 5\u201318, 2026");
check("same year, cross month", formatPeriod("2026-09-28", "2026-10-11"), "September 28 \u2013 October 11, 2026");
check("cross year", formatPeriod("2025-12-29", "2026-01-11"), "December 29, 2025 \u2013 January 11, 2026");
check("invalid dates -> empty", formatPeriod("", "2026-09-18"), "");
check("reversed dates -> empty", formatPeriod("2026-09-20", "2026-09-18"), "");

check("7 days -> weekly", suggestFrequency("2026-09-01", "2026-09-07"), "weekly");
check("14 days -> biweekly", suggestFrequency("2026-09-05", "2026-09-18"), "biweekly");
check("15 days -> semimonthly", suggestFrequency("2026-09-15", "2026-09-29"), "semimonthly");
check("16 days -> semimonthly", suggestFrequency("2026-08-16", "2026-08-31"), "semimonthly");
check("28 days -> monthly", suggestFrequency("2026-09-01", "2026-09-28"), "monthly");
check("31 days -> monthly", suggestFrequency("2026-08-01", "2026-08-31"), "monthly");
check("odd span -> null (keep manual)", suggestFrequency("2026-09-01", "2026-09-10"), null);

check("isoParts parses", isoParts("2026-09-05") instanceof Date, true);
check("isoParts rejects junk", isoParts("Sep 5"), null);

// history key format used by buildEmails
const keyBase = "2026-09-05|2026-09-18";
check("history key shape", keyBase + "|" + "beth@email.com", "2026-09-05|2026-09-18|beth@email.com");

console.log("---- pass=" + pass + " fail=" + fail);
if (fail) process.exit(1);
