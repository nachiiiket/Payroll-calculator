const C = require("../extension/utils/canada.js");
const T = require("../extension/utils/template.js");
let pass = 0, fail = 0;
function eq(name, got, want, tol) {
  tol = tol || 0.011;
  const ok = Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log((ok ? "PASS " : "FAIL ") + name + " got=" + got + " want=" + want);
}

// 1. Beth example from payroll-conv.txt: 21.75h x 17.60
const base = T.computeEmployee({ rate: "17.60", hours: "21.75" });
eq("gross Beth", base.gross, 382.80);
const beth = C.calcEmployee({ gross: base.gross, frequency: "biweekly" });
eq("Beth EI (payroll-conv.txt says 6.24)", beth.ei, 6.24);
eq("Beth CPP (under 3500 exemption = 0)", beth.cpp, 0);
eq("Beth fed tax = 0", beth.fed, 0);
eq("Beth prov tax = 0", beth.prov, 0);
eq("Beth net", beth.net, 376.56);
eq("net identity", beth.gross - beth.deductions, beth.net);

// 2. hours parsers
eq("hours 21:45", T.parseHours("21:45"), 21.75);
eq("hours 21 hrs 45 mins", T.parseHours("21 hrs 45 mins"), 21.75);
eq("hours 21h45", T.parseHours("21h45"), 21.75);
eq("hours 21.75", T.parseHours("21.75"), 21.75);

// 3. CRA ceilings hit exactly
eq("CPP max at YMPE 74600", C.cppOn(74600), 4230.45);
eq("CPP+CPP2 max at YAMPE 85000", C.cppOn(85000), 4646.45);
eq("EI max at 68900", C.eiOn(68900), 1123.07);
eq("EI capped past 68900", C.eiOn(90000), 1123.07);

// 4. incremental (period) deductions near ceilings
eq("CPP crossing YMPE in a period", C.cppOn(74680) - C.cppOn(74580), 4.39);
eq("EI 0 after ceiling", C.eiOn(69000) - C.eiOn(68950), 0);
// 74400->74900: 200 at 5.95% (base) + 300 at 4% (CPP2 zone) = 23.90
eq("CPP incremental crossing into CPP2", C.cppOn(74900) - C.cppOn(74400), 200 * 0.0595 + 300 * 0.04);

// 5. annualized federal at 100k (bracket 8193.22 + 41466*0.205 = 16696.05; BPA 16452*0.14)
const mid = C.calcEmployee({ gross: 100000 / 26, frequency: "biweekly" });
eq("100k annual federal / 26", mid.fed, (16696.05 - 2303.28) / 26, 0.05);
// Ontario at 100k: 2721 + 46109*0.0915 = 6940.07 - BPA 12989*0.0505=655.94 -> 6284.13; +20% surtax over 5818 = 93.23; + health 750 => 7127.36
eq("100k annual Ontario / 26", mid.prov, 7127.36 / 26, 0.05);

// 6. Ontario health premium schedule
eq("health <=20k = 0", C.ontarioHealthPremium(15000), 0);
eq("health 30k = 6% of 10000", C.ontarioHealthPremium(30000), 300);
eq("health 50k capped at 600 in that bracket", C.ontarioHealthPremium(50000), 600);
eq("health bracket continuity at 48k", C.ontarioHealthPremium(48000), 450);
eq("health bracket continuity at 72k", C.ontarioHealthPremium(72000), 600);
eq("health 100k capped 750", C.ontarioHealthPremium(100000), 750);
eq("health 250k capped 900", C.ontarioHealthPremium(250000), 900);

// 7. BPA claim toggle changes tax
const claim = C.calcEmployee({ gross: 6000, frequency: "biweekly", claimBpa: true });
const noClaim = C.calcEmployee({ gross: 6000, frequency: "biweekly", claimBpa: false });
console.log("  BPA saves/period: fed=" + (noClaim.fed - claim.fed).toFixed(2) + " prov=" + (noClaim.prov - claim.prov).toFixed(2));
noClaim.tax > claim.tax ? pass++ : (fail++, console.log("FAIL BPA direction"));

// 8. periods
eq("monthly periods", C.calcEmployee({ gross: 1000, frequency: "monthly" }).periods, 12);
eq("unknown freq falls back biweekly", C.calcEmployee({ gross: 1000, frequency: "weird" }).periods, 26);

// 9. template render round trip
const vars = T.varsFor({ name: "Beth", email: "b@x.com" }, { company: "Chatham Burgers", period: "Sep 5-18", senderName: "Ali" }, Object.assign(base, beth));
const out = T.render("Hi {name} gross ${gross} net ${net}", vars);
console.log("  rendered:", out);
(out === "Hi Beth gross $" + base.gross.toFixed(2) + " net $" + beth.net.toFixed(2))
  ? pass++ : (fail++, console.log("FAIL render, got: " + out));

// 10. deductions block placeholders are all known
const probe = {};
T.PLACEHOLDERS.forEach(ph => { probe[ph] = "1"; });
const blockLeft = T.render(T.DEDUCTIONS_BLOCK, probe).match(/\{[a-z_]+\}/g);
blockLeft ? (fail++, console.log("FAIL deductions block unknown: " + blockLeft)) : pass++;

console.log("---- pass=" + pass + " fail=" + fail);
if (fail) process.exit(1);
