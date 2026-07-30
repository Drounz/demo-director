// Deterministic demo player. Reads a flow spec (JSON) and executes it with a
// smooth animated cursor, captions, and highlights, recording the page to video.
//
//   node run-demo.js [flow.json]
//
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const flowPath = path.resolve(process.argv[2] || 'flow.json');
const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
const d = Object.assign(
  { moveMs: 900, typeDelay: 55, pauseMs: 700 },
  flow.defaults || {}
);
const viewport = flow.viewport || { width: 1280, height: 720 };
const outDir = path.resolve(flow.outDir || 'out');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: flow.headless ?? false });
  const ctxOpts = { viewport, recordVideo: { dir: outDir, size: viewport } };
  if (flow.storageState && fs.existsSync(path.resolve(flow.storageState))) {
    ctxOpts.storageState = path.resolve(flow.storageState);
  }
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  await page.addInitScript({ path: path.join(__dirname, 'cursor.js') });

  async function centerOf(sel) {
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const box = await loc.boundingBox();
    if (!box) throw new Error('Could not locate on screen: ' + sel);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, loc };
  }
  const moveTo = (x, y, ms) => page.evaluate(a => window.__demo.moveTo(a.x, a.y, a.ms), { x, y, ms });
  const pulse = (x, y) => page.evaluate(a => window.__demo.clickPulse(a.x, a.y), { x, y });
  const caption = t => page.evaluate(t => window.__demo.caption(t), t || '');

  for (const [i, s] of (flow.steps || []).entries()) {
    const label = `step ${i + 1} (${s.action}${s.selector ? ' ' + s.selector : ''})`;
    try {
      if (s.action === 'goto') {
        const url = /^https?:/.test(s.url) ? s.url : (flow.baseUrl || '') + s.url;
        // domcontentloaded, not networkidle: Supabase realtime keeps a socket open,
        // so networkidle can hang forever on your stack.
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(s.pauseMs ?? 600);
      } else if (s.action === 'caption') {
        await caption(s.text || '');
        await page.waitForTimeout(s.ms ?? 2000);
      } else if (s.action === 'click') {
        const { x, y } = await centerOf(s.selector);
        await moveTo(x, y, s.moveMs ?? d.moveMs);
        await pulse(x, y);
        await page.waitForTimeout(120);
        await page.mouse.click(x, y);
        await page.waitForTimeout(s.pauseMs ?? d.pauseMs);
      } else if (s.action === 'type') {
        const { x, y, loc } = await centerOf(s.selector);
        await moveTo(x, y, s.moveMs ?? d.moveMs);
        await pulse(x, y);
        await page.mouse.click(x, y);
        if (s.clear) await loc.fill('');
        await page.keyboard.type(s.text || '', { delay: s.typeDelay ?? d.typeDelay });
        await page.waitForTimeout(s.pauseMs ?? d.pauseMs);
      } else if (s.action === 'hover') {
        const { x, y } = await centerOf(s.selector);
        await moveTo(x, y, s.moveMs ?? d.moveMs);
        await page.mouse.move(x, y);
        await page.waitForTimeout(s.pauseMs ?? d.pauseMs);
      } else if (s.action === 'highlight') {
        const { x, y, loc } = await centerOf(s.selector);
        await moveTo(x, y, s.moveMs ?? d.moveMs);
        await loc.evaluate(el => el.classList.add('__demo_hl'));
        await page.waitForTimeout(s.ms ?? 1500);
        if (s.keep !== true) await loc.evaluate(el => el.classList.remove('__demo_hl'));
      } else if (s.action === 'scrollTo') {
        const { loc } = await centerOf(s.selector);
        await loc.scrollIntoViewIfNeeded();
        await page.waitForTimeout(s.pauseMs ?? d.pauseMs);
      } else if (s.action === 'wait') {
        if (s.selector) {
          await page.locator(s.selector).first().waitFor({ state: s.state || 'visible', timeout: s.timeout || 20000 });
        }
        if (s.ms) await page.waitForTimeout(s.ms);
      } else if (s.action === 'press') {
        await page.keyboard.press(s.key);
        await page.waitForTimeout(s.pauseMs ?? d.pauseMs);
      } else {
        console.warn('Unknown action, skipping:', s.action);
      }
    } catch (e) {
      console.error(`\n  Failed at ${label}: ${e.message}`);
      console.error('  No half-finished take is saved. Fix the selector or timing and re-run.\n');
      await context.close();
      await browser.close();
      process.exit(1);
    }
  }

  await caption('');
  await page.waitForTimeout(800);
  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const src = await video.path();
    const dest = path.join(outDir, (flow.name || 'demo') + '.webm');
    fs.copyFileSync(src, dest);
    const mp4 = dest.replace(/\.webm$/, '.mp4');
    console.log('\n  Recorded: ' + dest);
    console.log('  To mp4:   ffmpeg -i "' + dest + '" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "' + mp4 + '"\n');
  }
})();
