(function () {
  "use strict";
  if (window.__payrollPanelInjected) return;
  window.__payrollPanelInjected = true;

  const PANEL_WIDTH = 480;

  const host = document.createElement("div");
  host.setAttribute("data-payroll-panel", "1");
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML =
    "<style>" +
    ":host { all: initial; }" +
    "*, *::before, *::after { box-sizing: border-box; }" +
    "button { font-family: \"Segoe UI\", Roboto, Arial, sans-serif; }" +
    ".wrap { position: fixed; top: 0; right: 0; height: 100%; width: 0; z-index: 2147483000; pointer-events: none; }" +
    ".tab { position: absolute; top: 50%; right: 0; transform: translateY(-50%); width: 40px; padding: 14px 0 12px; " +
    "display: flex; flex-direction: column; align-items: center; gap: 10px; border: 0; cursor: pointer; " +
    "pointer-events: auto; border-radius: 12px 0 0 12px; color: #fff; box-shadow: -4px 0 16px rgba(0,0,0,0.25); " +
    "background: linear-gradient(165deg, #22c55e 0%, #0f7a3d 100%); transition: right 0.28s ease, border-radius 0.28s ease, filter 0.15s; }" +
    ".tab:hover { filter: brightness(1.08); }" +
    ".tab:focus-visible { outline: 2px solid #fff; outline-offset: -4px; }" +
    ".tab.attention { animation: nudge 1.6s ease-in-out 3; }" +
    "@keyframes nudge { 0%, 100% { box-shadow: -4px 0 16px rgba(0,0,0,0.25); } " +
    "50% { box-shadow: -4px 0 16px rgba(0,0,0,0.25), 0 0 0 6px rgba(34,197,94,0.28); } }" +
    ".tab-ico { font-size: 15px; font-weight: 800; line-height: 1; }" +
    ".tab-label { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11.5px; font-weight: 700; " +
    "letter-spacing: 0.14em; text-transform: uppercase; line-height: 1; }" +
    ".panel { position: absolute; top: 0; right: 0; width: " + PANEL_WIDTH + "px; height: 100%; background: #fff; " +
    "display: flex; flex-direction: column; pointer-events: auto; border-left: 1px solid #d7dee7; " +
    "box-shadow: -12px 0 36px rgba(0,0,0,0.22); transform: translateX(100%); transition: transform 0.28s ease; }" +
    ".wrap.open .panel { transform: translateX(0); }" +
    ".wrap.open .tab { right: " + PANEL_WIDTH + "px; border-radius: 0 12px 12px 0; }" +
    ".head { flex: 0 0 44px; display: flex; align-items: center; justify-content: space-between; gap: 8px; " +
    "padding: 0 8px 0 12px; background: linear-gradient(95deg, #16a34a 0%, #0e6b38 100%); color: #fff; }" +
    ".head-left { display: flex; align-items: center; gap: 9px; }" +
    ".head-mark { width: 24px; height: 24px; border-radius: 7px; background: rgba(255,255,255,0.18); " +
    "display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; }" +
    ".head-title { font-family: \"Segoe UI\", Roboto, Arial, sans-serif; font-size: 13.5px; font-weight: 700; letter-spacing: 0.01em; }" +
    ".head-btn { width: 30px; height: 30px; border: 0; border-radius: 7px; background: rgba(255,255,255,0.16); " +
    "color: #fff; font-size: 17px; line-height: 1; cursor: pointer; }" +
    ".head-btn:hover { background: rgba(255,255,255,0.3); }" +
    "iframe { flex: 1; width: 100%; border: 0; background: #f1f4f9; }" +
    "</style>" +
    "<div class=\"wrap\" id=\"wrap\">" +
    "<button class=\"tab\" id=\"tab\" type=\"button\" aria-expanded=\"false\" aria-label=\"Open payroll calculator\" title=\"Open payroll calculator\">" +
    "<span class=\"tab-ico\">$</span><span class=\"tab-label\">Payroll</span>" +
    "</button>" +
    "<section class=\"panel\" id=\"panel\" aria-label=\"Payroll Calculator\">" +
    "<header class=\"head\">" +
    "<span class=\"head-left\"><span class=\"head-mark\">$</span><span class=\"head-title\">Payroll Calculator</span></span>" +
    "<button class=\"head-btn\" id=\"min\" type=\"button\" title=\"Minimize\" aria-label=\"Minimize payroll panel\">&ndash;</button>" +
    "</header>" +
    "<iframe id=\"frame\" src=\"\" title=\"Payroll Calculator\"></iframe>" +
    "</section>" +
    "</div>";

  const wrap = shadow.getElementById("wrap");
  const tab = shadow.getElementById("tab");
  const minBtn = shadow.getElementById("min");
  const frame = shadow.getElementById("frame");

  let built = false;
  let open = false;

  function setOpen(next) {
    open = !!next;
    wrap.classList.toggle("open", open);
    if (open) tab.classList.remove("attention");
    tab.setAttribute("aria-expanded", String(open));
    tab.setAttribute("aria-label", open ? "Close payroll calculator" : "Open payroll calculator");
    tab.title = open ? "Close payroll calculator" : "Open payroll calculator";
    if (open && !built) {
      built = true;
      frame.src = chrome.runtime.getURL("popup.html") + "?embed=1";
    }
    chrome.storage.local.set({ panelOpen: open });
  }

  tab.addEventListener("click", () => setOpen(!open));
  minBtn.addEventListener("click", () => setOpen(false));

  // Default: panel opens itself on Gmail so the toolbar icon is never needed.
  // Once the user closes it, their choice is remembered for next time.
  chrome.storage.local.get("panelOpen").then(r => {
    const stored = r ? r.panelOpen : undefined;
    if (stored === false) {
      tab.classList.add("attention");
      return;
    }
    if (stored === true) {
      setOpen(true);
      return;
    }
    setOpen(true);
  });

  (document.documentElement || document.body).appendChild(host);
})();
