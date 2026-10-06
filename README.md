# Payroll Calculator

A Chrome extension (Manifest V3) that calculates employee payroll using 2026 CRA / Ontario rules and drafts or sends the pay email straight through your Gmail account — no copy-pasting, no spreadsheets.

## Features

- **Slim run window** - pick an employee, enter working hours, choose From / To dates, see the hourly rate, hit **Calculate**, then **Create draft email** (or send).
- **Live breakdown** - gross pay, CPP, EI, income tax and net pay shown as stat tiles before anything is emailed.
- **Dashboard** (options page) - one-time setup for employer details and the email template, an employee roster (name, email, hourly rate, prior YTD), and a payroll history table with per-employee/total views and CSV export.
- **Works inside Gmail** - a `$ PAYROLL` tab on the Gmail page opens a side panel, so no toolbar clicking.
- **Sender verification** - checks that the signed-in Gmail account matches your configured employer email; mismatches show a red banner, and a stale Gmail tab is refreshed automatically.
- **2026 payroll engine** - CPP/CPP2, EI, federal and Ontario brackets, Ontario surtax and health premium, calculated with the cumulative YTD method.

## Install (load unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder of this repo
4. Open [mail.google.com](https://mail.google.com) - the `$ PAYROLL` panel tab appears on the right edge

## First-time setup

1. Click the gear icon in the run window to open the dashboard
2. **Setup tab** - employer (sender) email, sign-off name, company name, send speed, email template
3. **Employees tab** - add each employee: name, email, hourly rate, prior year-to-date gross (leave `0` if none)
4. Back in the run window: select the employee, enter hours (`21.75`, `21:45` or `21 hrs 45 mins`), pick the pay period dates, **Calculate**, then **Create draft email**
5. The draft appears in Gmail's draft list - review it and send, or use send mode for automatic sending

Pay frequency is auto-suggested from the date range (7 days = weekly, 14 = biweekly, 15-16 = semimonthly, 28-31 = monthly).

## Payroll rules (2026 tax year, Ontario)

| Item | Rate |
|---|---|
| CPP | 5.95% on \$3,500 - \$74,600 (max \$4,230.45) |
| CPP2 | 4% on \$74,600 - \$85,000 (max \$416) |
| EI | 1.63% on \$68,900 (max \$1,123.07) |
| Federal | 14% / 20.5% / 26% / 29% / 33% above \$58,523 / \$117,045 / \$181,440 / \$258,482; basic personal amount \$16,452 |
| Ontario | 5.05% / 9.15% / 11.16% / 12.16% / 13.16% above \$53,891 / \$107,785 / \$150,000 / \$220,000; basic personal amount \$12,989 |
| Ontario surtax | 20% over \$5,818 + 16% over \$7,446 (on tax before surtax) |
| Ontario health premium | added to provincial tax deduction |
| Low-income reduction | \$300, clawed back at 5.05% above \$18,930 |

Deductions for a pay run use the **cumulative method**: CPP/EI are the difference between the annualized amounts at (prior YTD + this gross) and prior YTD, and income tax is the annualized tax divided by the periods in the year. Prior YTD combines the roster value you enter with gross already recorded in the history.

Estimates only - verify against the official CRA payroll deductions tables before running payroll for real.

## Email template

Editable in the dashboard. Placeholders you can use:

`{name}` `{email}` `{company}` `{period}` `{rate}` `{hours}` `{hours_hm}` `{hours_raw}` `{gross}` `{cpp}` `{ei}` `{tax}` `{deductions}` `{net}` `{sender_name}`

- Insert any placeholder with the chips above the body editor, or insert the full deductions block with **Insert deductions block**
- `{sender_name}` must be filled in if the template uses it (validated before sending)

## Tests

Run from the repo root (Node.js required):

```
node tests/test-canada.js    # payroll engine (32 checks)
node tests/test-dates.js     # period formatting / frequency (15 checks)
node tests/test-dashboard.js # dashboard helpers (12 checks)
node tests/test-dom.js       # page/manifest wiring
node tests/test-e2e.js       # full email render
```

## Repository layout

```
extension/          Chrome extension (load this folder)
  manifest.json
  popup.html/js     slim run window
  dashboard.html/js dashboard (setup / employees / history)
  panel.js          in-Gmail side panel
  gmail-compose.js  Gmail compose DOM automation
  background.js     orchestration, sender verification, history
  styles.css        theme incl. dark mode
  utils/canada.js   2026 CRA/Ontario payroll engine
  utils/storage.js  settings / roster / history storage
  utils/template.js email template rendering
  icons/            16/32/48/128 extension icons
tests/              test suites (not shipped)
```

## Privacy

Everything runs locally in your browser. The only host permission is `mail.google.com`, used to open Gmail and fill drafts as you. No payroll data is sent to any server.

## License

Private / personal project unless stated otherwise.
