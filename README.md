# Demo Director

Tell the AI a user flow, it writes a spec, and this plays it back on your real
app with a smooth cursor and captions, recording a clean video every time. No
live agent, so no misclicks or hesitation.

## Setup (once)

```bash
npm install
npx playwright install chromium
```

## 1. Capture your login (once per app)

```bash
node login.js https://your-prospector-url
```

A browser opens. Log in by hand, come back to the terminal, press Enter. It
saves `auth.json`. The player reuses that session so your app is already
logged in on every run.

## 2. Write the flow

Open `author-prompt.md`. Give Claude your flow in plain English plus the page
HTML, and it produces `flow.json`. Or edit the sample `flow.json` directly.
Set `baseUrl` to your app and replace the placeholder selectors.

## 3. Record

```bash
npm run demo
```

Watch it run. The video lands in `out/prospector-demo.webm`. Convert to mp4
for YouTube with the ffmpeg line the script prints.

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

- Selectors: prefer `[data-testid='...']`. Adding testids to the elements you
  demo is what makes playback unbreakable.
- The cursor is a rendered overlay on purpose. Playwright video does not
  capture the OS cursor, and a drawn one looks better anyway.
- `goto` waits for domcontentloaded, not networkidle, because Supabase realtime
  holds a socket open and networkidle would hang.
- If a step fails (wrong selector, element not ready), it stops and saves
  nothing, so you never ship a broken take. Fix and re-run.
- For 1080p output set `viewport` to 1920x1080 in `flow.json`.
- Layer Screen Studio or a voiceover on top afterward for extra polish.
```
