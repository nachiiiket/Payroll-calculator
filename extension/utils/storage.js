const DEFAULT_SETTINGS = {
  senderEmail: "",
  senderName: "",
  company: "",
  period: "",
  dateFrom: "",
  dateTo: "",
  payFrequency: "biweekly",
  claimBpa: true,
  employeeCount: 1,
  employees: [{ name: "", email: "", rate: "", hours: "", ytd: "" }],
  subjectTpl: "",
  bodyTpl: "",
  mode: "draft",
  speed: 1000,
  skipSent: true
};

const Storage = {
  async getSettings() {
    const r = await chrome.storage.local.get("payrollSettings");
    const s = r.payrollSettings || {};
    const merged = Object.assign({}, DEFAULT_SETTINGS, s);
    if (!Array.isArray(merged.employees) || !merged.employees.length) {
      merged.employees = DEFAULT_SETTINGS.employees.map(e => Object.assign({}, e));
    }
    merged.employeeCount = Math.max(1, Math.min(30, parseInt(merged.employeeCount, 10) || 1));
    merged.employees = merged.employees.map(e => {
      const emp = Object.assign({}, e);
      ["cpp", "ei", "tax"].forEach(old => { delete emp[old]; });
      if (typeof emp.ytd !== "string") emp.ytd = emp.ytd == null ? "" : String(emp.ytd);
      return emp;
    });
    if (["weekly", "biweekly", "semimonthly", "monthly"].indexOf(merged.payFrequency) === -1) {
      merged.payFrequency = "biweekly";
    }
    merged.claimBpa = merged.claimBpa !== false;
    return merged;
  },

  async saveSettings(settings) {
    await chrome.storage.local.set({ payrollSettings: settings });
  },

  async getHistory() {
    const r = await chrome.storage.local.get("payrollHistory");
    return r.payrollHistory || [];
  },

  historyHas(history, key) {
    return (history || []).some(h => h.key === key);
  },

  async addHistory(entry) {
    const list = await this.getHistory();
    if (!list.some(h => h.key === entry.key)) {
      list.push(entry);
      await chrome.storage.local.set({ payrollHistory: list.slice(-500) });
    }
  },

  async yearGrossByEmail(year) {
    const list = await this.getHistory();
    const map = {};
    list.forEach(h => {
      if (h.year !== year || !h.gross) return;
      const email = String(h.to || "").trim().toLowerCase();
      map[email] = this.round2((map[email] || 0) + Number(h.gross));
    });
    return map;
  },

  round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  },

  async clearHistory() {
    await chrome.storage.local.remove("payrollHistory");
  }
};
