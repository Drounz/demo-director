# Demo Director — Chrome extension

The browser-extension version of the Playwright demo player in the parent
folder. It plays the same flow schema in your real, already-logged-in Chrome
tab — no separate login step — and records the tab to a `.webm` file.

## Load it unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the "Demo Director" icon to your toolbar for quick access.

No build step: it's plain HTML/JS, loaded as-is.

## Record a demo

1. Open the tab you want to demo and navigate it to wherever your flow's first
   `goto` expects to land (you're already logged in, since this is your normal
   browser).
2. Click the Demo Director icon, paste your flow JSON into the textarea (see
   `flow.sample.json`), and click **Record**.
3. The popup closes; the tab starts recording and the flow plays out with the
   animated cursor, ripples, captions, and highlights.
4. When the flow finishes, the video downloads automatically as
   `<name>.webm`. You can also click **Stop** at any time to end early and keep
   whatever was recorded so far.

If a step fails — selector not found, or not visible within its timeout — the
page shows a red error caption naming the failed step, the recording stops,
and nothing is saved unless you'd already clicked Stop. Fix the flow and
re-run, same as the Playwright tool: no half-finished takes.

## Flow schema

Identical to the Playwright tool's `flow.json`, minus the fields that don't
apply to a browser extension (`storageState`, `headless`, `outDir` — this
player runs in your own tab and always downloads via `chrome.downloads`):

```json
{
  "name": "my-demo",
  "baseUrl": "https://your-app-address-here",
  "viewport": { "width": 1280, "height": 720 },
  "defaults": { "moveMs": 900, "typeDelay": 55, "pauseMs": 800 },
  "steps": []
}
```

Each step's `action` is one of:

- `goto` `{url}` — navigate to `baseUrl + url`, or an absolute URL
- `caption` `{text, ms}` — show the caption bar for `ms`
- `click` `{selector}` — smooth-move the cursor to the element's center, show
  a ripple, dispatch a real click
- `type` `{selector, text, clear?}` — move, click, optionally clear, type
  character by character
- `hover` `{selector}`
- `highlight` `{selector, ms, keep?}` — move, draw a ring for `ms`
  (`keep: true` leaves the ring on)
- `scrollTo` `{selector}`
- `wait` `{selector?, ms?, timeout?}` — wait for an element to be visible
  and/or a fixed delay
- `press` `{key}`

Any step may override `moveMs`, `pauseMs`, `typeDelay`. Defaults are
`moveMs: 900`, `typeDelay: 55`, `pauseMs: 800`.

### Selectors

- Anything without a prefix is a plain `document.querySelector`.
- `text=Some Label` matches by visible text (exact match preferred, falls back
  to substring, innermost element wins) — a convenience for apps without
  `data-testid`s.
- `role=button` (or `link`, `textbox`, `checkbox`, or any other ARIA role)
  matches the first visible element with that implicit or explicit role.
- Prefer `[data-testid='...']` when the app has them; they're the most stable
  option and the flow is portable between this extension and the Playwright
  tool either way.

## Important limitation: one `goto` per flow segment

**Only navigate with `goto` at the very start of a flow (or right after a
previous full-page load).** A full-page navigation destroys the injected
content script and its state — the cursor, the caption bar, everything.

Under the hood, the background script splits your flow at every `goto` into
segments, re-injects `content.js`, and replays the following steps after each
navigation completes. This works correctly for multiple `goto`s, but each one
causes a real page reload — the cursor overlay restarts at the screen's center
and any highlight/caption state from before is gone.

For a smooth single take, **prefer one initial `goto` and then drive the rest
of the flow with in-app clicks** (SPA navigation triggered by `click` steps),
exactly like you would with the Playwright tool. Save additional `goto` steps
for cases where a hard reload is actually part of what you want to show.

## Permissions

- `activeTab`, `tabs`, `scripting` — inject the player into your current tab
  and navigate it.
- `tabCapture` — capture the tab's video for recording.
- `offscreen` — MV3 service workers can't run `MediaRecorder`, so recording
  happens in a hidden offscreen document instead.
- `downloads` — save the finished video.
- `storage` — keep the flow JSON you pasted (`chrome.storage.local`) and the
  live run status (`chrome.storage.session`) across popup opens.
- `host_permissions: <all_urls>` — the flow can target any app you own.

## Notes

- The cursor is a rendered overlay (`position: fixed`, top `z-index`,
  `pointer-events: none`), animated with `requestAnimationFrame` and the same
  ease-in-out curve as the Playwright tool's `cursor.js` — not the OS cursor.
- Keep the recorded tab visible and focused while the flow plays.
- Recording captures video only (no tab audio).
- Convert to mp4 the same way as the Playwright tool:
  `ffmpeg -i my-demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart my-demo.mp4`
