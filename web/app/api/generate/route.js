// Public, no-auth generation endpoint: turns a plain-English description into
// a flow JSON using a server-side Anthropic key, so visitors never need one of
// their own. Best-effort per-instance rate limit only (no external store) —
// see web/README.md for what that does and doesn't cover.
export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-5';
const MAX_DESCRIPTION_CHARS = 4000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;

const ALLOWED_ACTIONS = new Set(['caption', 'click', 'type', 'hover', 'highlight', 'scrollTo', 'wait', 'press']);

const RULES = `Output ONLY a single JSON object, no prose, no markdown fences, matching this shape:
{ name, baseUrl, viewport?: {width,height}, defaults: {moveMs,typeDelay,pauseMs}, steps: [] }

Each step has an "action" of one of: caption {text, ms}, click {selector},
type {selector, text, clear?}, hover {selector}, highlight {selector, ms, keep?},
scrollTo {selector}, wait {selector?, ms?, timeout?}, press {key}.

Rules:
- Do NOT include a "goto" step. This flow plays inside a tab the visitor has
  already opened and navigated themselves — assume they are already on the
  right starting page.
- Selectors must be "text=<visible label>" (match by visible text) or
  "role=<button|link|textbox|checkbox>". Never invent a data-testid or a CSS
  class — you were not given the app's HTML, so only use wording the
  description actually mentions.
- Put a short caption before each meaningful action so the recording narrates
  itself.
- Pace it slowly: moveMs around 900, pauseMs around 800, typeDelay around 55
  (these are the defaults; only override per-step if the description implies
  a different pace).
- Add a "wait" step (with a selector and a generous timeout, e.g.
  20000-30000ms) immediately before interacting with or highlighting anything
  the description says loads, processes, or appears asynchronously — so
  playback never races ahead of the real app.`;

// Module-scope map: survives across requests only within the same warm
// serverless instance. Multiple cold instances each get their own bucket, so
// this raises the bar for casual abuse but is not a real per-visitor limit —
// see web/README.md.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function validate(flow) {
  const problems = [];
  if (!Array.isArray(flow.steps) || !flow.steps.length) problems.push('"steps" is missing or empty');
  (flow.steps || []).forEach((s, i) => {
    if (!ALLOWED_ACTIONS.has(s.action)) problems.push(`step ${i + 1}: unsupported action "${s.action}"`);
  });
  return problems;
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return Response.json({ error: 'Too many requests from this address. Wait a minute and try again.' }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'Server is not configured yet: ANTHROPIC_API_KEY is missing.' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = (body.name || 'my-demo').toString().slice(0, 80);
  const baseUrl = (body.baseUrl || '').toString().slice(0, 300);
  const description = (body.description || '').toString().slice(0, MAX_DESCRIPTION_CHARS);
  if (!description.trim()) {
    return Response.json({ error: 'Describe the flow first.' }, { status: 400 });
  }

  const userPrompt = `App name: ${name}\nBase URL (informational only, do not emit a goto step): ${baseUrl || '(not given)'}\n\nHere is the flow:\n${description}`;

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: RULES,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (e) {
    return Response.json({ error: 'Could not reach the generation model: ' + e.message }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return Response.json({ error: `Generation model returned ${res.status}: ${detail.slice(0, 300)}` }, { status: 502 });
  }

  const data = await res.json();
  const raw = (data.content || []).map(b => b.text || '').join('');
  const jsonText = extractJson(raw);

  let flow;
  try {
    flow = JSON.parse(jsonText);
  } catch {
    return Response.json({ error: 'Model reply was not valid JSON.', raw }, { status: 502 });
  }

  flow.name = name;
  flow.baseUrl = baseUrl || flow.baseUrl || '';
  flow.defaults = Object.assign({ moveMs: 900, typeDelay: 55, pauseMs: 800 }, flow.defaults || {});
  delete flow.storageState;
  delete flow.headless;
  delete flow.outDir;
  flow.steps = (flow.steps || []).filter(s => s.action !== 'goto');

  const problems = validate(flow);
  return Response.json({ flow, problems });
}
