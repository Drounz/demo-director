// Demo Director player. Injected by the background before each flow segment.
// The overlay (fake cursor, click ripple, caption bar, highlight ring) matches
// the Playwright tool's cursor.js — same ids, styles and easing — and the step
// engine mirrors run-demo.js semantics, but everything runs in-page.
(() => {
  if (window.__demoPlayerLoaded) return;
  window.__demoPlayerLoaded = true;

  // ---------------------------------------------------------------- overlay
  const state = { x: window.innerWidth / 2, y: window.innerHeight / 2, ready: false };

  function ensure() {
    if (state.ready && document.getElementById('__demo_cursor')) return;
    const root = document.body || document.documentElement;

    if (!document.getElementById('__demo_style')) {
      const st = document.createElement('style');
      st.id = '__demo_style';
      st.textContent = `
        #__demo_cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;will-change:left,top}
        #__demo_cursor svg{display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
        #__demo_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;border-radius:50%;border:2px solid rgba(59,130,246,.95);left:-999px;top:-999px}
        #__demo_ripple.go{animation:__demoR .5s ease-out}
        @keyframes __demoR{0%{opacity:.9;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.6)}}
        #__demo_caption{position:fixed;left:50%;bottom:7%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;max-width:78%;background:rgba(17,24,39,.92);color:#fff;font:500 18px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 20px;border-radius:12px;opacity:0;transition:opacity .3s ease;box-shadow:0 10px 34px rgba(0,0,0,.4)}
        #__demo_caption.show{opacity:1}
        #__demo_caption.error{background:rgba(153,27,27,.95)}
        .__demo_hl{outline:3px solid rgba(59,130,246,.95)!important;outline-offset:2px;border-radius:6px}
      `;
      (document.head || root).appendChild(st);
    }

    if (!document.getElementById('__demo_cursor')) {
      const cur = document.createElement('div');
      cur.id = '__demo_cursor';
      cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" stroke="#000" stroke-width="1.2"><path d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z"/></svg>';
      root.appendChild(cur);
    }
    if (!document.getElementById('__demo_ripple')) {
      const rip = document.createElement('div'); rip.id = '__demo_ripple'; root.appendChild(rip);
    }
    if (!document.getElementById('__demo_caption')) {
      const cap = document.createElement('div'); cap.id = '__demo_caption'; root.appendChild(cap);
    }
    state.ready = true;
    place(state.x, state.y);
  }

  function place(x, y) {
    const c = document.getElementById('__demo_cursor');
    if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; }
    state.x = x; state.y = y;
  }

  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function moveCursor(x, y, ms) {
    ensure();
    return new Promise(res => {
      const sx = state.x, sy = state.y, dur = Math.max(ms || 800, 1), t0 = performance.now();
      function step(now) {
        const p = Math.min((now - t0) / dur, 1), e = ease(p);
        place(sx + (x - sx) * e, sy + (y - sy) * e);
        if (p < 1) requestAnimationFrame(step); else res();
      }
      requestAnimationFrame(step);
    });
  }

  function clickPulse(x, y) {
    ensure();
    const rip = document.getElementById('__demo_ripple');
    rip.style.left = x + 'px'; rip.style.top = y + 'px';
    rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go');
  }

  function caption(text, isError) {
    ensure();
    const cap = document.getElementById('__demo_caption');
    cap.classList.toggle('error', !!isError);
    if (!text) { cap.classList.remove('show'); return; }
    cap.textContent = text; cap.classList.add('show');
  }

  // ------------------------------------------------------- selector engine
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();

  function isVisible(el) {
    if (!(el instanceof Element) || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  // Playwright-style text=: prefer an exact (case-insensitive) match on the
  // element's normalized text, fall back to substring, and of the matches keep
  // the innermost so "text=Save" finds the button, not the whole page.
  function findByText(wanted) {
    const want = norm(wanted).toLowerCase();
    if (!want) return null;
    const all = Array.from(document.body.querySelectorAll('*')).filter(isVisible);
    const textOf = el => norm(el.textContent).toLowerCase();
    let cands = all.filter(el => textOf(el) === want);
    if (!cands.length) cands = all.filter(el => textOf(el).includes(want));
    cands = cands.filter(el => !cands.some(o => o !== el && el.contains(o)));
    return cands[0] || null;
  }

  // role= convenience: common implicit roles plus a generic [role='...'] match.
  const ROLE_SELECTORS = {
    button: "button,[role='button'],input[type='button'],input[type='submit']",
    link: "a[href],[role='link']",
    textbox: "input:not([type]),input[type='text'],input[type='email'],input[type='search'],input[type='url'],input[type='tel'],input[type='password'],textarea,[role='textbox'],[contenteditable='true']",
    checkbox: "input[type='checkbox'],[role='checkbox']"
  };
  function findByRole(role) {
    const sel = ROLE_SELECTORS[role] || `[role='${role}']`;
    return Array.from(document.querySelectorAll(sel)).find(isVisible) || null;
  }

  function resolve(selector) {
    if (selector.startsWith('text=')) return findByText(selector.slice(5));
    if (selector.startsWith('role=')) return findByRole(selector.slice(5).trim());
    return document.querySelector(selector);
  }

  async function waitFor(selector, timeout = 15000) {
    const deadline = performance.now() + timeout;
    for (;;) {
      const el = resolve(selector);
      if (el && isVisible(el)) return el;
      if (performance.now() > deadline) {
        throw new Error('not found or not visible within ' + timeout + 'ms: ' + selector);
      }
      await sleep(100);
    }
  }

  async function centerOf(selector, timeout) {
    const el = await waitFor(selector, timeout);
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    await sleep(150);
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) throw new Error('could not locate on screen: ' + selector);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, el };
  }

  // ----------------------------------------------------- synthetic input
  // The overlay is pointer-events:none, so elementFromPoint sees the page.
  function realClick(x, y, el) {
    const target = document.elementFromPoint(x, y) || el;
    const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 };
    target.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1, isPrimary: true }));
    target.dispatchEvent(new MouseEvent('mousedown', base));
    if (typeof target.focus === 'function') target.focus();
    target.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, isPrimary: true }));
    target.dispatchEvent(new MouseEvent('mouseup', base));
    target.dispatchEvent(new MouseEvent('click', base));
    return target;
  }

  function hoverAt(x, y, el) {
    const target = document.elementFromPoint(x, y) || el;
    const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };
    target.dispatchEvent(new PointerEvent('pointerover', base));
    target.dispatchEvent(new MouseEvent('mouseover', base));
    target.dispatchEvent(new MouseEvent('mouseenter', { ...base, bubbles: false }));
    target.dispatchEvent(new MouseEvent('mousemove', base));
  }

  // Set values through the native setter so frameworks that shadow .value
  // (React et al) see the change, then fire an input event per character.
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }

  async function typeInto(el, text, delay, clear) {
    el.focus();
    const editable = el.isContentEditable;
    const isField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    if (clear) {
      if (isField) {
        setNativeValue(el, '');
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      } else if (editable) {
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
      }
    }
    for (const ch of text || '') {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      if (isField) {
        setNativeValue(el, el.value + ch);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      } else if (editable) {
        document.execCommand('insertText', false, ch);
      }
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      await sleep(delay);
    }
    if (isField) el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pressKey(key) {
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }

  // ----------------------------------------------------------- step engine
  let running = false;

  // "Not catching up" fix: a fixed delay after a click can't know whether a
  // slow-rendering app has actually finished responding. Watch the DOM
  // instead — resolve once there's been no mutation for `quietMs`, but never
  // wait past `capMs` total, so a page with constant background chatter
  // (spinners, ads, polling) can't hang playback forever.
  function waitForQuiet(quietMs = 300, capMs = 4000) {
    return new Promise(resolve => {
      let settleTimer = null;
      const hardCap = setTimeout(finish, capMs);
      const observer = new MutationObserver(() => {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(finish, quietMs);
      });
      function finish() {
        clearTimeout(settleTimer);
        clearTimeout(hardCap);
        observer.disconnect();
        resolve();
      }
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
      settleTimer = setTimeout(finish, quietMs);
    });
  }

  // Beyond the DOM-settle wait, always give the viewer a fixed beat to
  // register what just happened, even on a page that rendered instantly.
  const POST_CLICK_SETTLE_MS = 500;

  async function exec(s, d) {
    if (s.action === 'caption') {
      caption(s.text || '');
      await sleep(s.ms ?? 2000);
    } else if (s.action === 'click') {
      const { x, y, el } = await centerOf(s.selector);
      await moveCursor(x, y, s.moveMs ?? d.moveMs);
      clickPulse(x, y);
      await sleep(120);
      realClick(x, y, el);
      await waitForQuiet();
      await sleep(POST_CLICK_SETTLE_MS);
      await sleep(s.pauseMs ?? d.pauseMs);
    } else if (s.action === 'type') {
      const { x, y, el } = await centerOf(s.selector);
      await moveCursor(x, y, s.moveMs ?? d.moveMs);
      clickPulse(x, y);
      realClick(x, y, el);
      await typeInto(el, s.text, s.typeDelay ?? d.typeDelay, !!s.clear);
      await waitForQuiet();
      await sleep(POST_CLICK_SETTLE_MS);
      await sleep(s.pauseMs ?? d.pauseMs);
    } else if (s.action === 'hover') {
      const { x, y, el } = await centerOf(s.selector);
      await moveCursor(x, y, s.moveMs ?? d.moveMs);
      hoverAt(x, y, el);
      await sleep(s.pauseMs ?? d.pauseMs);
    } else if (s.action === 'highlight') {
      const { x, y, el } = await centerOf(s.selector);
      await moveCursor(x, y, s.moveMs ?? d.moveMs);
      el.classList.add('__demo_hl');
      await sleep(s.ms ?? 1500);
      if (s.keep !== true) el.classList.remove('__demo_hl');
    } else if (s.action === 'scrollTo') {
      const el = await waitFor(s.selector);
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      await sleep(s.pauseMs ?? d.pauseMs);
    } else if (s.action === 'wait') {
      if (s.selector) await waitFor(s.selector, s.timeout || 20000);
      if (s.ms) await sleep(s.ms);
    } else if (s.action === 'press') {
      pressKey(s.key);
      await sleep(s.pauseMs ?? d.pauseMs);
    } else if (s.action === 'goto') {
      // The background splits flows at goto steps and navigates itself; one
      // reaching the page means the segmenting broke — fail loud.
      throw new Error('goto must be handled by the background, not in-page');
    } else {
      console.warn('Demo Director: unknown action, skipping:', s.action);
    }
  }

  // startIndex lets the background resume a segment after re-injecting this
  // script post-navigation, instead of always restarting a segment from 0.
  async function run(steps, defaults, startIndex) {
    if (running) return;
    running = true;
    ensure();
    const d = Object.assign({ moveMs: 1300, typeDelay: 55, pauseMs: 1200 }, defaults || {});
    let label = '';
    try {
      for (let i = startIndex || 0; i < (steps || []).length; i++) {
        const s = steps[i];
        label = 'step ' + (i + 1) + ' (' + s.action + (s.selector ? ' ' + s.selector : '') + ')';
        await exec(s, d);
        // Fire-and-forget: if this step's click caused a full navigation, the
        // page (and this call) is about to be torn down anyway, so a failed
        // send here is expected and not an error worth surfacing.
        chrome.runtime.sendMessage({ target: 'background', type: 'step-progress', index: i }).catch(() => {});
      }
      chrome.runtime.sendMessage({ target: 'background', type: 'segment-done' });
    } catch (e) {
      caption('Demo failed at ' + label + ': ' + e.message, true);
      chrome.runtime.sendMessage({ target: 'background', type: 'flow-error', error: label + ': ' + e.message });
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'run-steps') run(msg.steps, msg.defaults, msg.startIndex);
    else if (msg?.type === 'clear-overlay') caption('');
  });
})();
