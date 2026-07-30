# How to author a flow with AI

This is the "tell the AI the flow" part. You do not write JSON by hand. You
paste the brief below into Claude Code; it asks you for the app's URL, your
flow in plain English, and the real page HTML, then writes `flow.json` for you.

## Getting the page HTML

The brief asks you for outerHTML so the AI picks selectors that actually
exist. In Chrome: right click the area, Inspect, right click the wrapping
element, Copy, Copy outerHTML. Paste that in when asked.

## The brief (paste this into Claude Code)

```
I have a standalone Playwright demo recorder in ./demo-director (run-demo.js,
cursor.js, login.js, flow.json). It reads flow.json and plays a scripted click
flow with an animated cursor and captions, recording to out/. It is NOT tied to
any app. Do not modify run-demo.js or cursor.js. Do not touch any other repo.

I want you to write a new flow.json for an app I will describe.

First, ask me for:
  1. The app's URL (what I type in the browser to reach it). This goes in the
     baseUrl field.
  2. The flow I want to show, in plain English.
  3. The outerHTML of each page in that flow, which I will paste, so you can
     pick real selectors. (Do not guess selectors from memory.)

Then write flow.json using this schema:
  { name, baseUrl, storageState:"auth.json", headless:false,
    viewport:{width:1280,height:720}, outDir:"out",
    defaults:{moveMs:900, typeDelay:55, pauseMs:800}, steps:[] }
  Each step.action is one of: goto{url}, caption{text,ms}, click{selector},
  type{selector,text,clear?}, hover{selector}, highlight{selector,ms,keep?},
  scrollTo{selector}, wait{selector?,ms?,timeout?}, press{key}.

Rules:
  - Use selectors that actually exist in the HTML I paste (prefer text= or
    role or existing stable classes). Do not invent testids or assume elements.
  - Put a short caption before each meaningful step.
  - For anything that loads asynchronously, add a wait step on the target
    element BEFORE interacting with or highlighting it, so playback never races
    ahead.
  - goto should use waitUntil domcontentloaded behavior (the player already
    handles this), so do not worry about network timing.

Output only the finished flow.json and a one-line note of which selectors you
used for each step.
```

Claude returns `flow.json`. Save it over the sample, make sure `baseUrl` is the
same address you used with `login.js`, and run `npm run demo`.

## The one thing that makes this mistake-proof

If you control the app's code, add `data-testid` attributes to the elements you
demo, eg `<button data-testid="new-item">`, and tell the AI to prefer them.
Then selectors never break when styling or copy changes, and every take is
identical. Fifteen minutes of adding testids buys you a demo you can regenerate
forever.
