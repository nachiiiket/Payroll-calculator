const CanadaPayroll = {
  YEAR: 2026,
  PROVINCE: "ON",
  PERIODS: { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 },

  CPP: { rate: 0.0595, ympe: 74600, exemption: 3500, cpp2Rate: 0.04, yampe: 85000 },
  EI: { rate: 0.0163, maxInsurable: 68900 },

  FED: {
    creditRate: 0.14,
    bpa: 16452,
    brackets: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]]
  },

  ON: {
    creditRate: 0.0505,
    bpa: 12989,
    brackets: [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [Infinity, 0.1316]],
    surtaxBase1: 5818,
    surtaxBase2: 7446,
    surtaxRate1: 0.2,
    surtaxRate2: 0.16,
    lowIncomeFrom: 18930,
    lowIncomeAmount: 300
  },

  round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  },

  num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  },

  bracketTax(income, brackets) {
    let tax = 0;
    let prev = 0;
    for (let i = 0; i < brackets.length; i++) {
      const cap = brackets[i][0];
      const rate = brackets[i][1];
      if (income <= prev) break;
      tax += (Math.min(income, cap) - prev) * rate;
      prev = cap;
      if (income <= cap) break;
    }
    return tax;
  },

  federalTax(annual, claimBpa) {
    let tax = this.bracketTax(annual, this.FED.brackets);
    if (claimBpa) tax -= this.FED.bpa * this.FED.creditRate;
    return Math.max(0, tax);
  },

  ontarioHealthPremium(annual) {
    const i = annual;
    if (i <= 20000) return 0;
    if (i <= 36000) return Math.min(300, 0.06 * (i - 20000));
    if (i <= 48000) return Math.min(450, 300 + 0.06 * (i - 36000));
    if (i <= 72000) return Math.min(600, 450 + 0.25 * (i - 48000));
    if (i <= 200000) return Math.min(750, 600 + 0.25 * (i - 72000));
    return Math.min(900, 750 + 0.25 * (i - 200000));
  },

  ontarioTax(annual, claimBpa) {
    let tax = this.bracketTax(annual, this.ON.brackets);
    if (claimBpa) tax -= this.ON.bpa * this.ON.creditRate;
    tax = Math.max(0, tax);

    const reduction = Math.max(
      0,
      this.ON.lowIncomeAmount - this.ON.creditRate * Math.max(0, annual - this.ON.lowIncomeFrom)
    );
    tax = Math.max(0, tax - reduction);

    const base = tax;
    if (base > this.ON.surtaxBase1) tax += this.ON.surtaxRate1 * (base - this.ON.surtaxBase1);
    if (base > this.ON.surtaxBase2) tax += this.ON.surtaxRate2 * (base - this.ON.surtaxBase2);

    tax += this.ontarioHealthPremium(annual);
    return Math.max(0, tax);
  },

  cppOn(earnings) {
    const base = Math.max(0, Math.min(earnings, this.CPP.ympe) - this.CPP.exemption) * this.CPP.rate;
    const cpp2 = Math.max(0, Math.min(earnings, this.CPP.yampe) - this.CPP.ympe) * this.CPP.cpp2Rate;
    return this.round2(base + cpp2);
  },

  eiOn(earnings) {
    return this.round2(Math.min(earnings, this.EI.maxInsurable) * this.EI.rate);
  },

  calcEmployee(opts) {
    opts = opts || {};
    const gross = Math.max(0, this.num(opts.gross));
    const periods = this.PERIODS[opts.frequency] || 26;
    const claimBpa = opts.claimBpa !== false;
    const ytdBefore = Math.max(0, this.num(opts.priorYtd)) + Math.max(0, this.num(opts.historyYtd));

    const cpp = this.round2(this.cppOn(ytdBefore + gross) - this.cppOn(ytdBefore));
    const ei = this.round2(this.eiOn(ytdBefore + gross) - this.eiOn(ytdBefore));

    const annual = gross * periods;
    const fed = this.round2(this.federalTax(annual, claimBpa) / periods);
    const prov = this.round2(this.ontarioTax(annual, claimBpa) / periods);
    const tax = this.round2(fed + prov);
    const deductions = this.round2(cpp + ei + tax);
    const net = this.round2(gross - deductions);

    return {
      gross,
      cpp,
      ei,
      fed,
      prov,
      tax,
      deductions,
      net,
      periods,
      ytdBefore,
      ytdAfter: this.round2(ytdBefore + gross)
    };
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = CanadaPayroll;
