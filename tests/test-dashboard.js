const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../extension/dashboard.js", "utf8");

// extract the pure helpers from the real dashboard source
function extract(name) {
  const re = new RegExp("function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n\\}", "m");
  const m = src.match(re);
  if (!m) throw new Error("cannot extract " + name);
  return m[0];
}
eval(extract("money"));
eval(extract("sumField"));
eval(extract("csvCell"));

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log((ok ? "PASS " : "FAIL ") + name + " | got=" + JSON.stringify(got) + " want=" + JSON.stringify(want));
}

check("money rounds", money(382.800001), "$382.80");
check("money handles junk", money("x"), "$0.00");
check("money negative", money(-5), "-$5.00");

const runs = [
  { gross: 382.8, cpp: 0, ei: 6.24, tax: 0 },
  { gross: 400, cpp: 5.95, ei: 6.52, tax: 12.34 },
  { gross: "417.20", cpp: 0, ei: 0, tax: 0 }
];
check("sumField gross", sumField(runs, "gross"), 1200);
check("sumField cpp", sumField(runs, "cpp"), 5.95);
check("sumField missing key", sumField(runs, "nope"), 0);

check("csv plain", csvCell("hello"), "hello");
check("csv quotes comma", csvCell("a,b"), '"a,b"');
check("csv quotes quote", csvCell('say "hi"'), '"say ""hi"""');
check("csv quotes newline", csvCell("a\nb"), '"a\nb"');
check("csv number", csvCell(42), "42");

// simulate a totals group aggregation like the dashboard does
const groups = {};
runs.forEach((h, i) => {
  const email = "e" + i + "@x.com";
  (groups[email] = groups[email] || []).push(h);
});
check("group count", Object.keys(groups).length, 3);

console.log("---- pass=" + pass + " fail=" + fail);
if (fail) process.exit(1);
