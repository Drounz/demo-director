// Offscreen recorder. MV3 service workers cannot use MediaRecorder or
// getUserMedia, so the background hands the tabCapture stream id to this
// document, which records the tab and hands back a blob URL on stop.
// It also pings the background every 20s so the service worker is not
// idle-killed in the middle of a long take.

let recorder = null;
let stream = null;
let chunks = [];
let keepalive = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'start-recording') {
    startRecording(msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'stop-recording') {
    stopRecording(msg.discard).then(sendResponse);
    return true;
  }
});

async function startRecording(streamId) {
  if (recorder) throw new Error('already recording');
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.start(1000);
  keepalive = setInterval(() => {
    chrome.runtime.sendMessage({ target: 'background', type: 'keepalive' }).catch(() => {});
  }, 20000);
}

async function stopRecording(discard) {
  clearInterval(keepalive);
  keepalive = null;
  if (!recorder) return { ok: false, error: 'not recording' };

  await new Promise(resolve => {
    if (recorder.state === 'inactive') return resolve();
    recorder.onstop = resolve;
    recorder.stop();
  });
  stream.getTracks().forEach(t => t.stop());
  recorder = null;
  stream = null;

  const blob = new Blob(chunks, { type: 'video/webm' });
  chunks = [];
  if (discard || blob.size === 0) {
    return { ok: true, discarded: true };
  }
  // The URL stays valid while this document is open; the background closes it
  // once the download completes.
  return { ok: true, url: URL.createObjectURL(blob), bytes: blob.size };
}
