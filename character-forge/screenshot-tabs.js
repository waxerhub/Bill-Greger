import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TABS = [
  { label: 'INV',   file: 'docs/07-inv.png' },
  { label: 'ITEMS', file: 'docs/08-items.png' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Dismiss any modal that might be open on load
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  for (const { label, file } of TABS) {
    // Find and click the tab button matching the label text
    const tab = page.locator('button', { hasText: label }).first();
    await tab.click();
    await page.waitForTimeout(800);

    const outPath = path.join(__dirname, file);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Saved: ${file}`);
  }

  await browser.close();
})();
