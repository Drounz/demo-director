// Popup: two paths to a flow. Primary path (this file's new code): describe
// the flow in plain English, scan the real page for its actual interactive
// elements, and ask Gemini to match your words to those real elements only —
// so every generated selector is confirmed to exist at generation time.
// Fallback path (unchanged): paste a flow JSON directly (e.g. authored via
// flow-author.html before the target page was open). Either way, Record/Stop
// below play it exactly as before; that logic is untouched.

const flowBox = document.getElementById('flow');
const statusEl = document.getElementById('status');
const apiKeyEl = document.getElementById('apiKey');
const descriptionEl = document.getElementById('description');
const generateBtn = document.getElementById('generate');
const genStatusEl = document.getElementById('genStatus');
const shotListEl = document.getElementById('shotList');
const runLogEl = document.getElementById('runLog');

function showStatus(text) {
  statusEl.textContent = text || '';
  statusEl.classList.toggle('error', /^(error|failed|invalid)/i.test(text || ''));
}

function showGenStatus(text, kind) {
  genStatusEl.textContent = text || '';
  genStatusEl.className = kind || '';
}

// Renders what got typed by the person vs auto-filled vs skipped on each
// interactive type step, so it's reviewable after a recording — including
// runs where the popup was closed the whole time, since this reads from the
// persisted log rather than only live messages.
function renderRunLog(entries) {
  runLogEl.innerHTML = '';
  for (const e of entries || []) {
    const li = document.createElement('li');
    li.className = e.source;
    const label = e.source === 'user' ? 'you typed' : e.source === 'auto' ? 'auto-filled' : 'skipped';
    const valueText = e.source === 'skipped' ? '' : ': "' + e.value + '"';
    li.innerHTML = '<span class="src">step ' + (e.index + 1) + ' (' + label + ')</span>' + escapeHtml(valueText);
    runLogEl.appendChild(li);
  }
  runLogEl.hidden = !(entries || []).length;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

(async () => {
  const { flowText, geminiApiKey } = await chrome.storage.local.get(['flowText', 'geminiApiKey']);
  if (flowText && !flowBox.value) flowBox.value = flowText;
  if (geminiApiKey) apiKeyEl.value = geminiApiKey;
  const { status, runLog } = await chrome.storage.session.get(['status', 'runLog']);
  showStatus(status || '');
  renderRunLog(runLog);
})();

chrome.storage.session.onChanged.addListener(changes => {
  if (changes.status) showStatus(changes.status.newValue || '');
  if (changes.runLog) renderRunLog(changes.runLog.newValue);
});

apiKeyEl.addEventListener('change', () => {
  chrome.storage.local.set({ geminiApiKey: apiKeyEl.value.trim() });
});

// ---------------------------------------------------------------- page scan
// Runs inside the target page via chrome.scripting.executeScript's `func`,
// so it must be fully self-contained (no references to anything outside it).
function collectElements() {
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function escapeAttr(s) { return s.replace(/"/g, '\\"'); }
  function isUnique(sel) {
    try { return document.querySelectorAll(sel).length === 1; } catch { return false; }
  }
  function buildSelector(el) {
    if (el.id) {
      const sel = '#' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
      if (isUnique(sel)) return sel;
    }
    const testid = el.getAttribute('data-testid');
    if (testid) {
      const sel = `[data-testid="${escapeAttr(testid)}"]`;
      if (isUnique(sel)) return sel;
    }
    const aria = el.getAttribute('aria-label');
    if (aria) {
      const sel = `[aria-label="${escapeAttr(aria)}"]`;
      if (isUnique(sel)) return sel;
    }
    const name = el.getAttribute('name');
    if (name) {
      const sel = `${el.tagName.toLowerCase()}[name="${escapeAttr(name)}"]`;
      if (isUnique(sel)) return sel;
    }
    let node = el, parts = [];
    for (let i = 0; i < 6 && node && node.nodeType === 1 && node !== document.body; i++) {
      let tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
        if (siblings.length > 1) tag += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(tag);
      node = parent;
    }
    const path = parts.join(' > ');
    return isUnique(path) ? path : null;
  }
  function textOf(el) {
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t.slice(0, 150);
    return (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.value || '').slice(0, 150);
  }
  const KINDS = {
    button: "button, [role='button'], input[type='button'], input[type='submit']",
    link: "a[href], [role='link']",
    input: "input:not([type='hidden']):not([type='button']):not([type='submit']), textarea, [role='textbox'], [contenteditable='true']",
    heading: 'h1, h2, h3, h4, h5, h6'
  };
  const out = [];
  const seen = new Set();
  for (const [kind, sel] of Object.entries(KINDS)) {
    for (const el of document.querySelectorAll(sel)) {
      if (out.length >= 150) break;
      if (!isVisible(el)) continue;
      const selector = buildSelector(el);
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      out.push({ kind, tag: el.tagName.toLowerCase(), text: textOf(el), selector });
    }
  }
  return out;
}

// ------------------------------------------------------------- Gemini call
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const RULES = `Output ONLY a single JSON object, no prose, no markdown fences, matching this shape:
{ name, baseUrl, viewport?: {width,height}, defaults: {moveMs,typeDelay,pauseMs}, steps: [] }

Each step has an "action" of one of: caption {text, ms}, click {selector},
type {selector, text, clear?}, hover {selector}, highlight {selector, ms, keep?},
scrollTo {selector}, wait {selector?, ms?, timeout?}, press {key}.

You are given a JSON array called ELEMENTS: real interactive elements read
directly from the page right now, each as {kind, tag, text, selector}. This is
the ONLY source of selectors you may use.

Rules:
- Every "selector" value you output must be copied EXACTLY, character for
  character, from an element's "selector" field in ELEMENTS. Never invent,
  edit, guess, or use a text=/role= selector.
- Match the user's description to whichever ELEMENTS' "text" best fits what
  they described. If no element plausibly matches part of the description,
  leave that part out entirely rather than inventing a selector for it.
- Do NOT include a "goto" step — the user is already on the correct page.
- If the description says something appears later (after a click, after
  loading, after processing), it will not be in ELEMENTS yet, since those were
  captured before any action ran. For that step, use "wait" with only "ms" (a
  fixed delay, e.g. 3000-8000ms depending on what's described) instead of a
  selector — there is no real selector to confirm for it yet.
- Put a short caption before each meaningful action so the recording narrates
  itself.
- Pace it slowly: moveMs around 900, pauseMs around 800, typeDelay around 55.`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

const ALLOWED_ACTIONS = new Set(['caption', 'click', 'type', 'hover', 'highlight', 'scrollTo', 'wait', 'press']);

// Defense in depth: even though the prompt instructs Gemini to only copy
// selectors from ELEMENTS, this strips any step whose selector isn't actually
// in that set, so a model slip-up can never reintroduce a guessed selector.
function enforceRealSelectors(flow, knownSelectors) {
  const dropped = [];
  flow.steps = (flow.steps || []).filter((s, i) => {
    if (s.action === 'goto') { dropped.push(`step ${i + 1}: goto (not supported here)`); return false; }
    if (!ALLOWED_ACTIONS.has(s.action)) { dropped.push(`step ${i + 1}: unknown action "${s.action}"`); return false; }
    if (s.selector && !knownSelectors.has(s.selector)) {
      dropped.push(`step ${i + 1}: selector not found on page, dropped ("${s.selector}")`);
      return false;
    }
    return true;
  });
  return dropped;
}

function renderShotList(flow) {
  shotListEl.innerHTML = '';
  for (const s of flow.steps || []) {
    const li = document.createElement('li');
    li.textContent = s.action === 'caption' ? `"${s.text}"`
      : s.selector ? `${s.action} → ${s.selector}`
      : s.action === 'wait' ? `wait ${s.ms || s.timeout || ''}ms`
      : s.action === 'press' ? `press "${s.key}"`
      : s.action;
    shotListEl.appendChild(li);
  }
  shotListEl.hidden = (flow.steps || []).length === 0;
}

generateBtn.addEventListener('click', async () => {
  const apiKey = apiKeyEl.value.trim();
  const description = descriptionEl.value.trim();
  if (!apiKey) { showGenStatus('Enter your Gemini API key first.', 'error'); return; }
  if (!description) { showGenStatus('Describe the flow first.', 'error'); return; }

  generateBtn.disabled = true;
  showGenStatus('Reading the page…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || '')) {
      throw new Error('open the target app tab first (cannot scan chrome:// pages)');
    }

    const [{ result: elements }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectElements
    });
    if (!elements || !elements.length) {
      throw new Error('found no visible buttons, links, inputs, or headings on this page');
    }

    showGenStatus(`Found ${elements.length} elements. Asking Gemini…`);
    const userPrompt = `App name: my-demo\nBase URL: ${tab.url}\n\nHere is the flow:\n${description}\n\nELEMENTS:\n${JSON.stringify(elements)}`;

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: RULES }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 }
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const raw = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');

    let flow;
    try {
      flow = JSON.parse(extractJson(raw));
    } catch {
      throw new Error('Gemini reply was not valid JSON');
    }

    flow.name = flow.name || 'my-demo';
    flow.baseUrl = tab.url;
    flow.defaults = Object.assign({ moveMs: 900, typeDelay: 55, pauseMs: 800 }, flow.defaults || {});

    const knownSelectors = new Set(elements.map(e => e.selector));
    const dropped = enforceRealSelectors(flow, knownSelectors);

    flowBox.value = JSON.stringify(flow, null, 2);
    await chrome.storage.local.set({ flowText: flowBox.value });
    renderShotList(flow);

    if (!flow.steps.length) {
      showGenStatus('Generated, but no usable steps came back — try rephrasing.', 'error');
    } else if (dropped.length) {
      showGenStatus(`Generated ${flow.steps.length} steps. Dropped ${dropped.length} unusable: ${dropped.join('; ')}`, 'error');
    } else {
      showGenStatus(`Generated ${flow.steps.length} steps, all from real elements on this page. Review below, then Record.`, 'ok');
    }
  } catch (e) {
    showGenStatus('Failed: ' + e.message, 'error');
  } finally {
    generateBtn.disabled = false;
  }
});

// ------------------------------------------------------- Record / Stop (unchanged)
document.getElementById('record').addEventListener('click', async () => {
  let flow;
  try {
    flow = JSON.parse(flowBox.value);
  } catch (e) {
    showStatus('Invalid JSON: ' + e.message);
    return;
  }
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
    showStatus('Invalid flow: "steps" must be a non-empty array.');
    return;
  }
  await chrome.storage.local.set({ flowText: flowBox.value });
  showStatus('Starting…');
  chrome.runtime.sendMessage({ target: 'background', type: 'start', flow });
  // Close so the popup is out of the way; recording is on the tab, not the popup.
  setTimeout(() => window.close(), 350);
});

document.getElementById('stop').addEventListener('click', () => {
  chrome.runtime.sendMessage({ target: 'background', type: 'stop' });
});
