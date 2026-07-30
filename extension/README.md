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

## Generate a flow from the page (primary path)

Instead of authoring a flow JSON separately and pasting it in, the popup can
write one for you from the page you already have open:

1. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   and paste it into the **Gemini API key** field in the popup. It's saved to
   `chrome.storage.local` (this device only), so you only paste it once.
2. Open the tab you want to demo and get it to the screen where the flow
   starts (you're already logged in, since this is your normal browser).
3. Click the Demo Director icon, describe the flow in plain English in the
   **1 · Describe the flow** box (e.g. *"click the button that starts a new
   radar configuration, wait for it to load, then highlight the result"*), and
   click **Generate from this page**.
4. The extension reads every visible button, link, input, and heading on the
   current page — each with its real, confirmed-present selector (preferring
   `id`/`data-testid`/`aria-label`, falling back to a structural CSS path) —
   and sends that list plus your description to Gemini. Gemini matches your
   words to those real elements and returns a flow JSON; it is never allowed to
   invent a selector that isn't in the list Gemini was given. If it tries
   anyway, the popup strips that step rather than keep an unconfirmed
   selector, and tells you what it dropped.
5. A shot list appears so you can sanity-check the steps before recording. The
   full JSON is also in the **2 · Review & record** box below it — editable,
   in case you want to tweak a caption or timing by hand.

**Limitation:** the scan only sees what's on the page *right now*. If your
description mentions something that appears later (after a click, after
async processing), there's no real selector for it yet at generation time —
Gemini is instructed to fall back to a fixed-delay `wait` for those, which is
weaker than a selector-based wait. Regenerating after the awaited element is
actually visible (or hand-editing that one step) gives you the real selector.

## Record a demo

1. Once you have a flow — generated above, or pasted directly (see
   `flow.sample.json`) — click **Record**.
2. The popup closes; the tab starts recording and the flow plays out with the
   animated cursor, ripples, captions, and highlights.
3. When the flow finishes, the video downloads automatically as
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

- `activeTab`, `tabs`, `scripting` — inject the player (and the page-element
  scan) into your current tab, and navigate it.
- `tabCapture` — capture the tab's video for recording.
- `offscreen` — MV3 service workers can't run `MediaRecorder`, so recording
  happens in a hidden offscreen document instead.
- `downloads` — save the finished video.
- `storage` — keep the flow JSON (`chrome.storage.local`), your Gemini API key
  (`chrome.storage.local`, this device only), and the live run status
  (`chrome.storage.session`) across popup opens.
- `host_permissions: <all_urls>` — the flow can target any app you own, and it's
  also what lets the popup call the Gemini API directly without a CORS error.

## Notes

- The cursor is a rendered overlay (`position: fixed`, top `z-index`,
  `pointer-events: none`), animated with `requestAnimationFrame` and the same
  ease-in-out curve as the Playwright tool's `cursor.js` — not the OS cursor.
- Keep the recorded tab visible and focused while the flow plays.
- Recording captures video only (no tab audio).
- Convert to mp4 the same way as the Playwright tool:
  `ffmpeg -i my-demo.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart my-demo.mp4`
