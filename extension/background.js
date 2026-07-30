// Orchestrates a demo run. On start: grab a tabCapture stream id for the
// active tab, hand it to the offscreen document (MediaRecorder cannot run in
// a service worker), then walk the flow segment by segment. A segment is one
// goto plus the steps after it — a full-page navigation wipes the content
// script, so the player is re-injected after every goto and the remaining
// steps are replayed in-page.

let session = null;        // { tabId, flow, segments, seg }
let pendingDownload = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = s => (s || 'demo').replace(/[^\w.-]+/g, '-');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'background') return;
  if (msg.type === 'start') {
    start(msg.flow).catch(e => fail('setup failed: ' + e.message));
  } else if (msg.type === 'stop') {
    // User pressed Stop: keep whatever was recorded so far.
    setStatus('stopped — saving partial take');
    stopRecording(true);
  } else if (msg.type === 'segment-done') {
    nextSegment().catch(e => fail(e.message));
  } else if (msg.type === 'flow-error') {
    fail(msg.error);
  } else if (msg.type === 'get-status') {
    sendResponse({ recording: !!session });
  }
  // keepalive messages need no handling; receiving them resets the worker's
  // idle timer so it survives long recordings.
});

async function start(flow) {
  if (session) throw new Error('a recording is already running');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('no active tab');
  if (!/^https?:/i.test(tab.url || '')) {
    throw new Error('open the app tab first (cannot record chrome:// pages)');
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'start-recording', streamId });
  if (!res?.ok) throw new Error(res?.error || 'recorder failed to start');

  session = { tabId: tab.id, flow, segments: splitSegments(flow.steps || []), seg: -1 };
  await setStatus('recording…');
  await nextSegment();
}

// [gotoA, s1, s2, gotoB, s3] -> [{goto:A, steps:[s1,s2]}, {goto:B, steps:[s3]}]
// A flow that starts without a goto plays its first segment on the current page.
function splitSegments(steps) {
  const segments = [];
  let cur = { goto: null, steps: [] };
  for (const s of steps) {
    if (s.action === 'goto') {
      if (cur.goto || cur.steps.length) segments.push(cur);
      cur = { goto: s, steps: [] };
    } else {
      cur.steps.push(s);
    }
  }
  segments.push(cur);
  return segments;
}

async function nextSegment() {
  if (!session) return;
  session.seg += 1;
  if (session.seg >= session.segments.length) return finishFlow();

  const seg = session.segments[session.seg];
  if (seg.goto) {
    const url = /^https?:/i.test(seg.goto.url)
      ? seg.goto.url
      : (session.flow.baseUrl || '') + seg.goto.url;
    await chrome.tabs.update(session.tabId, { url });
    await waitForLoad(session.tabId, 30000);
    await sleep(seg.goto.pauseMs ?? 600);
  }
  if (!session) return; // stopped while navigating
  await chrome.scripting.executeScript({ target: { tabId: session.tabId }, files: ['content.js'] });
  await chrome.tabs.sendMessage(session.tabId, {
    type: 'run-steps',
    steps: seg.steps,
    defaults: session.flow.defaults || {}
  });
  // Completion arrives as a 'segment-done' (or 'flow-error') runtime message.
}

function waitForLoad(tabId, timeout) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => finish(new Error('page did not finish loading in ' + timeout + 'ms')), timeout);
    function finish(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      err ? reject(err) : resolve();
    }
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') finish();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(t => { if (t.status === 'complete') finish(); }).catch(finish);
  });
}

async function finishFlow() {
  try { await chrome.tabs.sendMessage(session.tabId, { type: 'clear-overlay' }); } catch {}
  await sleep(800); // same closing beat as the Playwright player
  await setStatus('saving video…');
  await stopRecording(true);
}

// Fail-loud: the content script has already painted the error caption; here we
// surface it in the popup and discard the take, matching the Playwright
// player's "no half-finished take is saved".
async function fail(message) {
  console.error('Demo failed:', message);
  await setStatus('failed: ' + message + ' — take discarded');
  await stopRecording(false);
}

async function stopRecording(save) {
  const name = sanitize(session?.flow?.name);
  session = null;
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording', discard: !save });
  } catch {
    return closeOffscreen(); // offscreen already gone; nothing to save
  }
  if (save && res?.ok && res.url) {
    // The blob URL lives in the offscreen document, so keep that document
    // open until the download leaves the in_progress state.
    pendingDownload = await chrome.downloads.download({ url: res.url, filename: name + '.webm' });
    await setStatus('saved ' + name + '.webm (' + Math.round((res.bytes || 0) / 1024) + ' KB)');
  } else {
    if (save) await setStatus('failed: ' + (res?.error || 'nothing was recorded'));
    await closeOffscreen();
  }
}

chrome.downloads.onChanged.addListener(delta => {
  if (delta.id === pendingDownload && delta.state && delta.state.current !== 'in_progress') {
    pendingDownload = null;
    closeOffscreen();
  }
});

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record the active tab with MediaRecorder while a scripted demo plays.'
  });
}

async function closeOffscreen() {
  try { await chrome.offscreen.closeDocument(); } catch {}
}

function setStatus(status) {
  return chrome.storage.session.set({ status });
}
