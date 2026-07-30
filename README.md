# Demo Director

Tell the AI a user flow, it writes a spec, and this plays it back on your real
app with a smooth cursor and captions, recording a clean video every time. No
live agent, so no misclicks or hesitation.

The tool is app-agnostic. It is not tied to any one product — you point it at
whatever app you want to demo.

## The key idea: the URL appears in exactly two places

Every time you demo an app, you set its address in exactly two spots. That is
the only thing that ties the tool to a specific app.

1. The login command, so it opens the right site for you to sign in:
   `node login.js https://your-app-address-here`
2. The `baseUrl` field in `flow.json`, so the recorded run opens the same site.

Both should be the exact address you type in your browser to reach the app —
a deployed URL or `http://localhost:3000` if you run it locally. To demo a
different app next week, swap both to that app's address and author a new flow.

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

Open `author-prompt.md` and paste the brief there into Claude Code. It will ask
you for the app's URL, the flow in plain English, and the page HTML, then write
`flow.json` for you. Or edit the sample `flow.json` directly: set `baseUrl` to
the same address you used with `login.js` and replace the placeholder
selectors.

## 3. Record

```bash
npm run demo
```

Watch it run. The video lands in `out/<name>.webm`, named after the `name`
field in `flow.json` (the sample's `my-demo` gives `out/my-demo.webm`). Convert
to mp4 for YouTube with the ffmpeg line the script prints.

## Actions you can use in a flow

- `goto` {url}
- `caption` {text, ms} shows a caption bar for ms
- `click` {selector}
- `type` {selector, text, clear?}
- `hover` {selector}
- `highlight` {selector, ms, keep?} draws a ring around an element
- `scrollTo` {selector}
- `wait` {selector?, ms?, timeout?} waits for an element or a delay
- `press` {key}

Any step can override pacing with `moveMs`, `pauseMs`, `typeDelay`.

## Notes

- Selectors: prefer `[data-testid='...']` if your app has them; otherwise use
  stable `text=` or role selectors taken from the app's real HTML. Never guess.
- Anything that loads asynchronously needs a `wait` step on the target element
  before you interact with or highlight it, so playback never races ahead.
- The cursor is a rendered overlay on purpose. Playwright video does not
  capture the OS cursor, and a drawn one looks better anyway.
- `goto` waits for domcontentloaded, not networkidle, because apps that hold a
  realtime socket open (Supabase, websockets) never go network-idle.
- If a step fails (wrong selector, element not ready), it stops and saves
  nothing, so you never ship a broken take. Fix and re-run.
- For 1080p output set `viewport` to 1920x1080 in `flow.json`.
- Layer Screen Studio or a voiceover on top afterward for extra polish.
