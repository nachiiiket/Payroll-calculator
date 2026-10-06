const PayrollTemplate = {
  DEFAULT_SUBJECT: "Payroll \u2013 {company} | {period}",

  DEFAULT_BODY: [
    "Hey {name},",
    "",
    "Hope you're doing well! Here are your payroll details for {period}:",
    "",
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    "Employee: {name}",
    "Company: {company}",
    "Payroll Period: {period}",
    "Hourly Rate: ${rate}/hr",
    "Hours: {hours} ({hours_hm})",
    "Gross Pay: ${gross}",
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    "",
    "Let me know if you need anything else!",
    "",
    "Thanks,",
    "{sender_name}"
  ].join("\n"),

  DEDUCTIONS_BLOCK: [
    "CPP: -${cpp}",
    "EI: -${ei}",
    "Income Tax (est.): -${tax}",
    "Total Deductions: -${deductions}",
    "Net Take-Home: ${net}"
  ].join("\n"),

  round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  },

  parseHours(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    let m;
    if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)$/))) return parseFloat(m[1]);
    if ((m = s.match(/^(\d+):(\d{1,2})$/))) return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
    if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return parseFloat(m[1]);
    if ((m = s.match(/^(\d+)\s*(?:hours?|hrs?|h)?\s*[\s,]*\s*(\d+)\s*(?:minutes?|mins?|m)?$/))) {
      return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
    }
    return null;
  },

  hoursHM(hours) {
    const total = Math.round(hours * 60);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return mm ? hh + " hrs " + mm + " mins" : hh + " hrs";
  },

  num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  },

  computeEmployee(emp) {
    const rate = this.num(emp.rate);
    const hours = this.parseHours(emp.hours);
    const gross = this.round2(rate * (hours == null ? 0 : hours));
    return {
      rate,
      hours: hours == null ? 0 : hours,
      hoursValid: hours != null,
      hours_hm: this.hoursHM(hours == null ? 0 : hours),
      gross,
      cpp: 0,
      ei: 0,
      tax: 0,
      deductions: 0,
      net: gross
    };
  },

  varsFor(emp, settings, calc) {
    const hrs = parseFloat(calc.hours.toFixed(2));
    return {
      name: (emp.name || "").trim(),
      email: (emp.email || "").trim(),
      company: (settings.company || "").trim(),
      period: (settings.period || "").trim(),
      sender_name: (settings.senderName || "").trim(),
      rate: calc.rate.toFixed(2),
      hours: hrs + " hrs",
      hours_raw: String(hrs),
      hours_hm: calc.hours_hm,
      gross: calc.gross.toFixed(2),
      cpp: calc.cpp.toFixed(2),
      ei: calc.ei.toFixed(2),
      tax: calc.tax.toFixed(2),
      deductions: calc.deductions.toFixed(2),
      net: calc.net.toFixed(2)
    };
  },

  render(str, vars) {
    return String(str || "").replace(/\{([a-z_]+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
    );
  },

  PLACEHOLDERS: [
    "name", "email", "company", "period", "rate", "hours", "hours_hm",
    "hours_raw", "gross", "cpp", "ei", "tax", "deductions", "net", "sender_name"
  ]
};

if (typeof module !== "undefined" && module.exports) module.exports = PayrollTemplate;
