import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  // Remove playwright-specific navigator flags
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  console.log('Loading All_Priest_Spells…');
  let response;
  try {
    response = await page.goto('https://adnd2e.fandom.com/wiki/All_Priest_Spells', {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    console.log('HTTP status:', response?.status());
  } catch (e) {
    console.log('Navigation error:', e.message);
  }

  // Wait generously for Cloudflare JS challenge to complete
  await page.waitForTimeout(8000);

  // Screenshot for inspection
  await page.screenshot({ path: '/tmp/wiki_screenshot.png' });
  console.log('Screenshot saved to /tmp/wiki_screenshot.png');

  // Get page info
  const title = await page.title().catch(() => '(error)');
  const url   = page.url();
  console.log('Final URL:', url);
  console.log('Page title:', title);

  // Try to get some text
  const bodyText = await page.evaluate(() => {
    const body = document.body;
    return body ? body.innerText.slice(0, 500) : '(no body)';
  }).catch(() => '(error)');
  console.log('Body preview:\n', bodyText);

  // Count tables
  const tableCount = await page.evaluate(() => document.querySelectorAll('table').length).catch(() => 0);
  console.log('Tables on page:', tableCount);

  await browser.close();
})();
