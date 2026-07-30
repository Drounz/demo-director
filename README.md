# Demo Director

A standalone, local, app-agnostic toolkit for recording clean screen demos of
any web app: describe a flow in plain English, get a script back, and play it
with a smooth animated cursor and captions — no misclicks, no hesitation, the
same take every time. It isn't tied to any one app; point it at whatever
you're demoing this week.

## The three parts

| Part | What it is | When to use it |
|---|---|---|
| [`extension/`](extension/) | A Chrome (MV3) extension that runs in your real, already-logged-in browser and records the tab | **Main path.** Zero setup beyond loading it unpacked — you're already logged in. |
| [`flow-author.html`](flow-author.html) | A single-file web page: type a demo in plain English, get a flow JSON back | Writing flows for the extension, without touching your app's HTML. |
| [`playwright/`](playwright/) | The original terminal + Playwright player | **Advanced / optional.** Higher recording quality, but needs a separate one-time login capture. |

All three speak the same flow JSON, so a flow you write once works with either
player (see [Flow schema](#flow-schema) below for the small differences).

## Quickstart (main path)

1. Open `flow-author.html` in a browser (double-click it, or `open flow-author.html`).
2. Under **1 · Generation method**, either paste an API key for Claude/Gemini/xAI
   to generate in-page, or pick "Copy a prompt instead" to hand the brief to
   Claude Code or claude.ai yourself.
3. Fill in the app's name and base URL, describe the flow in plain English
   (mention button labels and field names as they actually appear on screen),
   and click **Generate flow JSON** (or **Copy prompt instead**, then paste the
   reply's JSON into the Result box).
4. Copy the resulting JSON.
5. Load the extension unpacked: `chrome://extensions` → Developer mode →
   **Load unpacked** → select `extension/`.
6. Navigate your browser tab to the app (you're already logged in), click the
   Demo Director icon, paste the JSON, and click **Record**.
7. The flow plays out with the cursor, ripples, captions, and highlights, and
   a `.webm` downloads automatically when it finishes.

See [`extension/README.md`](extension/README.md) for full detail on the
extension, including the important navigation limitation below.

## Advanced: the Playwright player

`playwright/` is the original version: a terminal script that drives a
dedicated Playwright browser instead of your normal Chrome tab. It renders at
higher, more consistent quality (no compositing with your OS/other tabs) but
needs a one-time login capture (`node login.js <url>`) since it isn't your
everyday logged-in session. Use it when video quality matters more than
zero-setup convenience. Full instructions: [`playwright/README.md`](playwright/README.md).

## Flow schema

Shared by all three parts:

```json
{
  "name": "my-demo",
  "baseUrl": "https://your-app-address-here",
  "viewport": { "width": 1280, "height": 720 },
  "defaults": { "moveMs": 900, "typeDelay": 55, "pauseMs": 800 },
  "steps": []
}
```

The Playwright player adds three fields the extension has no equivalent for
(`storageState`, `headless`, `outDir` — see
[`playwright/README.md`](playwright/README.md#flow-schema)), since it drives a
separate browser and writes its own video file instead of running in your tab
and downloading through Chrome.

Each step's `action` is one of:

- `goto` {url} — navigate to `baseUrl + url`, or an absolute URL. **Only ever
  the first step of a flow** (see the navigation limitation below).
- `caption` {text, ms} — show a caption bar for `ms`
- `click` {selector} — smooth-move the cursor to the element's center, ripple,
  real click
- `type` {selector, text, clear?} — move, click, optionally clear, type
  character by character
- `hover` {selector}
- `highlight` {selector, ms, keep?} — move, draw a ring for `ms`
  (`keep: true` leaves it on)
- `scrollTo` {selector}
- `wait` {selector?, ms?, timeout?} — wait for an element to be visible and/or
  a fixed delay. Always put one before interacting with or highlighting
  anything that loads asynchronously, so playback never races ahead.
- `press` {key}

Any step may override `moveMs`, `pauseMs`, `typeDelay`. Defaults:
`moveMs: 900`, `typeDelay: 55`, `pauseMs: 800`.

### Selectors

- `[data-testid='...']` if your app has them — most stable, portable between
  both players.
- `text=Some Label` — matches by visible text (exact preferred, falls back to
  substring). What `flow-author.html`'s lightweight mode writes, since it never
  sees your app's HTML.
- `role=button` (or `link`, `textbox`, `checkbox`, ...) — matches the first
  visible element with that role.
- Plain CSS also works with either player (`document.querySelector` /
  Playwright locator syntax).

### Navigation limitation: one `goto`, at the start

**Only the extension actually enforces this — but treat it as a rule for both
players, since it's what `flow-author.html` writes.** A full-page navigation
reloads the tab, and the extension's content script (the cursor, captions,
highlight state) is destroyed and has to be re-injected — the background
script handles that automatically, but each `goto` mid-flow still costs a hard
cut in the recording. The Playwright player doesn't have the same destructive
reload (its cursor overlay re-injects itself via `page.addInitScript` on every
navigation and the script's own state persists across it), so multiple `goto`s
technically work there — but for a flow that's portable between both players,
stick to one `goto` at the start and drive everything after it with in-app
(SPA) clicks.

## .gitignore

`node_modules/`, `auth.json`, and `out/` (the Playwright player's recording
output) are all ignored at the repo root. The extension has no repo-local
output folder — its videos download straight to your browser's normal
Downloads folder via `chrome.downloads`, so there's nothing extra to ignore
for it.

## Repo layout

```
demo-director/
├── README.md              this file
├── flow-author.html       plain English → flow JSON, no build step
├── extension/              Chrome MV3 extension (main path)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── background.js
│   ├── offscreen.html / offscreen.js
│   ├── content.js
│   ├── flow.sample.json
│   └── README.md
└── playwright/             terminal player (advanced / optional)
    ├── run-demo.js
    ├── cursor.js
    ├── login.js
    ├── flow.json
    ├── author-prompt.md
    ├── package.json
    └── README.md
```
