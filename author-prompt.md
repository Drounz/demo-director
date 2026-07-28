# How to author a flow with AI

This is the "tell the AI the flow" part. You do not write JSON by hand. You
give Claude two things and it writes `flow.json` for you.

## What to give Claude

1. The flow in plain English, eg:
   "Show a new lead being added (Acme Distribution Ltd, acme-dist.com), then
    enrichment running, then it getting graded a B, then the routing panel."

2. The real HTML of the relevant page(s) so it can pick correct selectors.
   In Chrome: right click the area, Inspect, right click the wrapping element,
   Copy, Copy outerHTML. Paste that in.

## The prompt

> You are writing a flow spec for my demo player. Output ONLY valid JSON
> matching this shape (no prose):
>
> Fields: name, baseUrl, storageState, headless, viewport {width,height},
> outDir, defaults {moveMs,typeDelay,pauseMs}, steps[].
>
> Each step has an "action" of one of: goto {url}, caption {text, ms},
> click {selector}, type {selector, text, clear?}, hover {selector},
> highlight {selector, ms, keep?}, scrollTo {selector}, wait {selector?, ms?,
> timeout?}, press {key}.
>
> Rules:
> - Prefer [data-testid='...'] selectors. If none exist in the HTML I gave you,
>   use a stable text= or role selector and add a "_note" telling me to add a
>   data-testid.
> - Put a short caption before each meaningful action so the video narrates
>   itself.
> - Pace it slowly: moveMs around 900, pauseMs around 800.
> - Use wait steps (with a selector) before anything that depends on async
>   enrichment or grading finishing, so playback never races ahead.
>
> Here is my flow: <paste plain-English flow>
> Here is the page HTML: <paste outerHTML>

Claude returns JSON. Save it as `flow.json` and run `npm run demo`.

## The one thing that makes this mistake-proof

Add `data-testid` attributes to the elements you demo, eg
`<button data-testid="new-lead">`. Then selectors never break when styling or
copy changes, and every take is identical. Fifteen minutes of adding testids
buys you a demo you can regenerate forever.
