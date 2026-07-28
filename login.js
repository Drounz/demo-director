// One-time auth capture. Opens a real browser, you log in by hand, then it
// saves the session to auth.json so the player runs already-logged-in.
//
//   node login.js https://your-prospector-url
//
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2];
  if (!url) { console.error('Usage: node login.js <app-url>'); process.exit(1); }
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(url);
  console.log('\n  Log in in the window that opened.');
  console.log('  Once the app is fully logged in, come back here and press Enter.');
  await new Promise(r => process.stdin.once('data', r));
  await ctx.storageState({ path: 'auth.json' });
  console.log('  Saved auth.json\n');
  await browser.close();
  process.exit(0);
})();
