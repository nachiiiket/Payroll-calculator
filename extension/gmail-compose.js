(function() {
  'use strict';

  const SELECTORS = {
    toField: 'input[aria-label="To recipients"], input[aria-label^="To recipients"], input.agP, input[name*="to"], div[aria-label="To recipients"][contenteditable="true"], div[role="textbox"][aria-label^="To recipients"]',
    subjectField: 'input[name="subjectbox"], input.aoT, input[aria-label="Subject"]',
    bodyField: 'div[aria-label="Message Body"][role="textbox"], div.Am.editable[aria-label*="Message"], div.editable[role="textbox"]',
    sendBtn: 'div.T-I-atl[role="button"], div[aria-label*="Send"][role="button"]',
    composeBtn: '.aic .z0 div, div[gh="cm"], div[role="button"][act="9"], div.T-I.T-I-KE.L3'
  };

  const CLOSE_SELECTORS = [
    'div[role="button"][aria-label="Close"]',
    'div[role="button"][aria-label^="Close"]',
    'div[role="button"][title="Close"]',
    'img[title="Close"]',
    'img[aria-label="Close"]'
  ];

  const EMAIL_RX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function isVisible(el) {
    return !!(el && el.isConnected && el.getClientRects().length);
  }

  function getComposeDialogs() {
    const nodes = document.querySelectorAll('div[role="dialog"], .aDl[role="dialog"], div[role="application"]');
    return Array.from(nodes).filter(d => d.querySelector(SELECTORS.subjectField));
  }

  function getComposeDialog() {
    const list = getComposeDialogs();
    return list.length ? list[list.length - 1] : null;
  }

  async function waitForClose(dialog, timeoutMs) {
    const step = 250;
    const tries = Math.ceil(timeoutMs / step);
    for (let i = 0; i < tries; i++) {
      if (!isVisible(dialog)) return true;
      await wait(step);
    }
    return !isVisible(dialog);
  }

  function openCompose() {
    const btn = document.querySelector(SELECTORS.composeBtn);
    if (btn) { btn.click(); return true; }
    return false;
  }

  function setNativeValue(el, value) {
    if ('value' in el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.focus();
      const ok = document.execCommand && document.execCommand('insertText', false, value);
      if (!ok) {
        el.textContent = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  async function closeDialog(dialog) {
    for (const sel of CLOSE_SELECTORS) {
      const btn = Array.from(dialog.querySelectorAll(sel)).find(b => !/discard/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || ''));
      if (btn && isVisible(btn)) {
        btn.click();
        break;
      }
    }
    if (await waitForClose(dialog, 3000)) return true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    return waitForClose(dialog, 2000);
  }

  async function fillCompose(opts) {
    const speed = opts.speed != null ? Number(opts.speed) : 1000;

    const before = getComposeDialogs();
    let dialog = null;
    if (openCompose()) {
      for (let i = 0; i < 20; i++) {
        const fresh = getComposeDialogs().find(d => before.indexOf(d) === -1);
        if (fresh) { dialog = fresh; break; }
        await wait(300);
      }
    }
    if (!dialog) dialog = getComposeDialog();
    if (!dialog) return { ok: false, error: 'Compose window could not be opened.' };
    if (!isVisible(dialog)) return { ok: false, error: 'Compose window is not visible.' };

    const toField = dialog.querySelector(SELECTORS.toField);
    if (toField && opts.to) {
      setNativeValue(toField, opts.to);
      await wait(speed);
    }

    const subjectField = dialog.querySelector(SELECTORS.subjectField);
    if (subjectField && opts.subject != null) {
      setNativeValue(subjectField, opts.subject);
      await wait(speed);
    }

    const bodyField = dialog.querySelector(SELECTORS.bodyField);
    if (bodyField && opts.body != null) {
      bodyField.focus();
      const html = String(opts.body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      bodyField.innerHTML = html;
      bodyField.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(speed);
    }

    if (opts.autoSend) {
      const sendBtn = dialog.querySelector(SELECTORS.sendBtn) || document.querySelector(SELECTORS.sendBtn);
      if (!sendBtn) return { ok: false, error: 'Send button not found.' };
      sendBtn.click();
      const closed = await waitForClose(dialog, 8000);
      return closed ? { ok: true } : { ok: false, error: 'Send was clicked but the window stayed open.' };
    }

    if (opts.closeAfter) {
      await wait(Math.max(2000, speed));
      const closed = await closeDialog(dialog);
      return closed ? { ok: true } : { ok: false, error: 'Draft filled but the window could not be closed.' };
    }

    return { ok: true };
  }

  function detectAccountEmail() {
    const chip = document.querySelector('[aria-label*="Google Account"], [aria-label*="Google account"]');
    if (chip) {
      const m = (chip.getAttribute('aria-label') || '').match(EMAIL_RX);
      if (m) return m[0].toLowerCase();
    }

    for (const a of document.querySelectorAll('a[href*="email="]')) {
      try {
        const e = new URL(a.href).searchParams.get('email');
        if (e && e.indexOf('@') !== -1) return e.toLowerCase();
      } catch (err) { /* ignore invalid url */ }
    }

    const signOut = document.querySelector('a[href*="SignOutOptions"]');
    if (signOut) {
      const scope = signOut.closest('[role="banner"], header, .gb_Ea, .gb_D') || signOut.parentElement;
      if (scope) {
        const labelled = scope.querySelector('[aria-label]');
        const m = labelled && (labelled.getAttribute('aria-label') || '').match(EMAIL_RX);
        if (m) return m[0].toLowerCase();
        const imgLink = scope.querySelector('a[href*="myaccount.google.com"]');
        const m2 = imgLink && (imgLink.getAttribute('href') || '').match(EMAIL_RX);
        if (m2) return m2[0].toLowerCase();
      }
    }

    const img = document.querySelector('img.gbii, img.gb_Va, img[aria-label*="@"]');
    if (img) {
      const link = img.closest('a');
      const m = link && (link.getAttribute('href') || '').match(EMAIL_RX);
      if (m) return m[0].toLowerCase();
      const m2 = (img.getAttribute('aria-label') || '').match(EMAIL_RX);
      if (m2) return m2[0].toLowerCase();
    }

    const dataEmail = document.querySelector('[data-email]');
    if (dataEmail) {
      const e = dataEmail.getAttribute('data-email');
      if (e && e.indexOf('@') !== -1) return e.toLowerCase();
    }

    return null;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'fillGmailCompose') {
      fillCompose(msg.data || {}).then(res => sendResponse(res || { ok: false }));
      return true;
    }
    if (msg.action === 'getAccountEmail') {
      const email = detectAccountEmail();
      sendResponse({ ok: !!email, email });
      return false;
    }
    if (msg.action === 'ping') {
      sendResponse({ ok: true });
      return false;
    }
  });
})();
