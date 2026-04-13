import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Click the Sign In button (contains emoji + text)
  const signInBtn = page.locator('button').filter({ hasText: /Sign In/ }).first();
  await signInBtn.waitFor({ timeout: 10000 });
  await signInBtn.click();
  await page.waitForTimeout(800);

  const outPath = path.join(__dirname, 'docs/09-account.png');
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('Saved: docs/09-account.png');

  await browser.close();
})();
