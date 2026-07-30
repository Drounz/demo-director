// Popup: paste or reload a flow, then Record / Stop. The flow text is kept in
// chrome.storage.local so it survives closing the popup; live run status comes
// from chrome.storage.session, which the background keeps updated.

const flowBox = document.getElementById('flow');
const statusEl = document.getElementById('status');

function showStatus(text) {
  statusEl.textContent = text || '';
  statusEl.classList.toggle('error', /^(error|failed|invalid)/i.test(text || ''));
}

(async () => {
  const { flowText } = await chrome.storage.local.get('flowText');
  if (flowText && !flowBox.value) flowBox.value = flowText;
  const { status } = await chrome.storage.session.get('status');
  showStatus(status || '');
})();

chrome.storage.session.onChanged.addListener(changes => {
  if (changes.status) showStatus(changes.status.newValue || '');
});

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
