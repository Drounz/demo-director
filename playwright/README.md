# Demo Director — Playwright player

The original terminal version. Higher-quality recording than the browser
extension, at the cost of one extra one-time step: logging in inside a
Playwright-controlled browser instead of reusing your normal Chrome session.
Use this when you want the best possible video quality; use `../extension/`
when you want zero setup and your normal already-logged-in browser.

## Setup (once)

```bash
npm install
npx playwright install chromium
```

## 1. Capture your login (once per app)

```bash
node login.js https://your-app-address-here
```

A browser opens on that address. Log in by hand, come back to the terminal,
press Enter. It saves `auth.json`. The player reuses that session so your app
is already logged in on every run. `auth.json` is gitignored — it holds your
logged-in session, so never commit it.

## 2. Write the flow

Either paste the brief in `author-prompt.md` into Claude Code (it can read the
app's real HTML and pick precise selectors, including `data-testid`s), or use
the shared `../flow-author.html` authoring page and add the fields this tool
needs that the lightweight page doesn't produce: `storageState`, `headless`,
`outDir` (see schema below). Set `baseUrl` to the same address you used with
`login.js`.

## 3. Record

```bash
npm run demo
```

Watch it run. The video lands in `out/<name>.webm`, named after the `name`
field in `flow.json`. Convert to mp4 for YouTube with the ffmpeg line the
script prints.

## Flow schema

```json
{
  "name": "my-demo",
  "baseUrl": "https://your-app-address-here",
  "storageState": "auth.json",
  "headless": false,
  "viewport": { "width": 1280, "height": 720 },
  "outDir": "out",
  "defaults": { "moveMs": 900, "typeDelay": 55, "pauseMs": 800 },
  "steps": []
}
```

`storageState`, `headless`, and `outDir` are specific to this tool — the
extension has no equivalent (it runs in your own tab and downloads via the
browser). Everything else is the schema shared with the extension.

Each step's `action` is one of:

- `goto` {url}
- `caption` {text, ms} shows a caption bar for ms
- `click` {selector}
- `type` {selector, text, clear?}
- `hover` {selector}
- `highlight` {selector, ms, keep?} draws a ring around an element
- `scrollTo` {selector}
- `wait` {selector?, ms?, timeout?} waits for an element or a delay
- `press` {key}

Any step can override pacing with `moveMs`, `pauseMs`, `typeDelay`. Defaults
are `moveMs: 900`, `typeDelay: 55`, `pauseMs: 800`.

## Notes

- Selectors: prefer `[data-testid='...']` if your app has them; otherwise use
  stable `text=` or role selectors taken from the app's real HTML. Never guess.
- Unlike the extension, `run-demo.js` drives a single long-lived Playwright
  script rather than a content script that gets destroyed on navigation, so
  multiple `goto` steps anywhere in the flow work fine here — `cursor.js` is
  re-injected automatically on every navigation via `page.addInitScript`. The
  "one goto at the start" guidance is a real constraint for the extension, not
  this tool; more than one `goto` here just costs you a hard cut in the video.
- The cursor is a rendered overlay on purpose. Playwright video does not
  capture the OS cursor, and a drawn one looks better anyway.
- `goto` waits for domcontentloaded, not networkidle, because apps that hold a
  realtime socket open (Supabase, websockets) never go network-idle.
- If a step fails (wrong selector, element not ready), it stops and saves
  nothing, so you never ship a broken take. Fix and re-run.
- For 1080p output set `viewport` to 1920x1080 in `flow.json`.
- Layer Screen Studio or a voiceover on top afterward for extra polish.
