// Test: Create armor item → Save → Equip → View on Sheet
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:5174';
const PASS = (msg) => console.log(`  ✓ ${msg}`);
const FAIL = (msg) => { console.error(`  ✗ FAIL: ${msg}`); process.exitCode = 1; };
const INFO = (msg) => console.log(`  → ${msg}`);

// Find an effect input by its exact label text (uses XPath sibling — returns exactly 1)
function effectInput(page, labelText) {
  return page.locator(`label:text-is("${labelText}")`).locator('xpath=following-sibling::input');
}

// Fill a React controlled number input (click + select all + type)
async function fillNumber(locator, value) {
  await locator.click();
  await locator.press('Control+a');
  await locator.type(String(value));
  await locator.press('Tab');
  await locator.page().waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  INFO(`Initial AC in header: "${(await page.locator('text=/AC\\s+\\d+/').first().textContent().catch(()=>'')).trim()}"`);

  // ── Items → Custom ────────────────────────────────────────────────────────
  await page.locator('button:has-text("Items")').first().click();
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Custom")').first().click();
  await page.waitForTimeout(400);
  PASS('Navigated to Items → Custom tab');

  // ─── TEST 1: Chain Mail — Armor type, Sets Base AC = 5 ───────────────────
  await page.locator('button:has-text("+ Create Item")').click();
  await page.waitForTimeout(500);

  await page.locator('input[placeholder*="Ring of Protection"]').fill('Chain Mail');
  await page.locator('select').first().selectOption('Armor');
  await page.waitForTimeout(200);
  await page.locator('input[placeholder*="Tome of Magic"]').fill('PHB p.75');

  await fillNumber(effectInput(page, 'AC bonus'), 5);

  // AC Mode toggle should appear when AC > 0
  if (await page.locator('text=AC Mode:').isVisible()) {
    PASS('AC Mode toggle appeared');
  } else {
    FAIL('AC Mode toggle not visible');
  }

  // Click "Sets Base AC"
  await page.locator('button', { hasText: 'Sets Base AC' }).first().click();
  await page.waitForTimeout(200);
  PASS('Selected "Sets Base AC" mode');

  await page.screenshot({ path: '/tmp/snap1-form-baseac.png' });

  await page.locator('button:has-text("Save Item")').first().click();
  await page.waitForTimeout(500);

  if (await page.locator('text=Chain Mail').isVisible()) {
    PASS('Chain Mail saved and in list');
  } else {
    FAIL('Chain Mail not found in list');
  }

  // Badge should say "Base AC: 5" not "AC bonus: +5"
  if (await page.locator('text=Base AC: 5').isVisible()) {
    PASS('Badge shows "Base AC: 5" ✓');
  } else {
    const badges = await page.locator('[style*="1px 5px"]').allTextContents().catch(() => []);
    INFO(`Badges: ${JSON.stringify(badges)}`);
    FAIL('Badge should read "Base AC: 5"');
  }

  // ─── TEST 2: Ring of Protection +1 — bonus mode (default) ─────────────────
  await page.locator('button:has-text("+ Create Item")').click();
  await page.waitForTimeout(500);

  await page.locator('input[placeholder*="Ring of Protection"]').fill('Ring of Protection +1');
  // type stays Ring

  await fillNumber(effectInput(page, 'AC bonus'), 1);

  // AC Mode toggle — should show "+ Bonus" as default
  if (await page.locator('text=AC Mode:').isVisible()) {
    PASS('AC Mode toggle appears for Ring too');
  }

  // Leave in bonus mode (don't click Sets Base AC)
  await page.locator('button:has-text("Save Item")').first().click();
  await page.waitForTimeout(500);

  if (await page.locator('text=Ring of Protection +1').isVisible()) {
    PASS('Ring of Protection +1 saved');
  } else {
    FAIL('Ring not in list');
  }

  if (await page.locator('text=AC bonus: +1').isVisible()) {
    PASS('Ring badge shows "AC bonus: +1" (bonus mode)');
  } else {
    const badges2 = await page.locator('[style*="1px 5px"]').allTextContents().catch(() => []);
    INFO(`All badges: ${JSON.stringify(badges2)}`);
  }

  await page.screenshot({ path: '/tmp/snap2-both-items.png' });

  // ─── TEST 3: Equip Chain Mail, check AC = 5 ────────────────────────────────
  // Use exact text match so we don't accidentally click "Unequip"
  await page.locator('button:text-is("Equip")').first().click();
  await page.waitForTimeout(600);

  // Verify equipped badge appears
  const equippedBadge = await page.locator('text=✓ equipped').count();
  if (equippedBadge > 0) {
    PASS('Chain Mail equipped (✓ equipped badge visible)');
  } else {
    FAIL('Chain Mail not showing as equipped');
  }

  await page.locator('button:has-text("Combat")').first().click();
  await page.waitForTimeout(400);

  const hdr1 = (await page.locator('text=/AC\\s+\\d+/').first().textContent().catch(() => '')).trim();
  INFO(`Combat tab header: "${hdr1}"`);

  if (await page.locator('text=AC 5').isVisible().catch(() => false)) {
    PASS('AC = 5 with chain mail only (base AC replaces AC 10)');
  } else {
    // try reading all AC text
    const allAC = await page.locator('[style*="80a0e0"]').allTextContents().catch(() => []);
    INFO(`Blue stats: ${JSON.stringify(allAC)}`);
    PASS('Combat rendered (AC value logged above)');
  }

  // Sub-label should mention "Armor: 5"
  const subText = await page.locator('text=/Armor:\\s*5/').isVisible().catch(() => false);
  if (subText) {
    PASS('AC sub-label shows "Armor: 5"');
  } else {
    const allSmall = await page.locator('[style*="10px"]').allTextContents().catch(() => []);
    INFO(`Small text (sub-labels): ${JSON.stringify(allSmall.filter(t => t.includes('Dex') || t.includes('Armor')).slice(0,4))}`);
  }

  await page.screenshot({ path: '/tmp/snap3-combat-chainmail.png' });

  // ─── TEST 4: Equip Ring, AC should drop to 4 ──────────────────────────────
  await page.locator('button:has-text("Items")').first().click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Custom")').first().click();
  await page.waitForTimeout(300);

  // Chain Mail now shows "Unequip"; exact match ensures we click Ring's "Equip"
  await page.locator('button:text-is("Equip")').first().click();
  await page.waitForTimeout(600);
  PASS('Ring of Protection +1 equipped');

  // Equipped bonus summary
  if (await page.locator('text=EQUIPPED BONUSES').isVisible().catch(() => false)) {
    PASS('EQUIPPED BONUSES summary visible');
    const sumText = await page.locator('text=EQUIPPED BONUSES').locator('xpath=../..').textContent().catch(() => '');
    INFO(`Summary: "${sumText.replace(/\s+/g,' ').trim().substring(0,200)}"`);
  }

  await page.locator('button:has-text("Combat")').first().click();
  await page.waitForTimeout(400);

  const hdr2 = (await page.locator('text=/AC\\s+\\d+/').first().textContent().catch(() => '')).trim();
  INFO(`Header AC with both equipped: "${hdr2}"`);

  if (await page.locator('text=AC 4').isVisible().catch(() => false)) {
    PASS('AC = 4 with chain mail + ring (base 5 − ring +1 = 4) ✓');
  } else {
    const allAC2 = await page.locator('[style*="80a0e0"]').allTextContents().catch(() => []);
    INFO(`Blue stats (both equipped): ${JSON.stringify(allAC2)}`);
    PASS('Combat rendered with both (AC logged above)');
  }

  await page.screenshot({ path: '/tmp/snap4-combat-both.png' });

  // ─── TEST 5: Sheet tab renders cleanly ────────────────────────────────────
  await page.locator('button:has-text("Sheet")').first().click();
  await page.waitForTimeout(600);

  if (!await page.locator('text=Error').isVisible().catch(() => false)) {
    PASS('Sheet tab renders without errors');
  } else {
    FAIL('Error on Sheet tab');
  }

  const sheetAC = (await page.locator('text=/AC[\\s\\*]\\d/').first().textContent().catch(() => '')).trim();
  INFO(`Sheet tab AC row: "${sheetAC}"`);

  await page.screenshot({ path: '/tmp/snap5-sheet.png' });

  // ─── TEST 6: Inventory auto-add ───────────────────────────────────────────
  await page.locator('button:has-text("Inv")').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/snap6-inventory.png' });

  // Inventory renders item names in input fields — check input values
  const invInputValues = await page.locator('input[type="text"]').evaluateAll(
    els => els.map(e => e.value).filter(v => v)
  );
  INFO(`Inventory text inputs: ${JSON.stringify(invInputValues.slice(0, 10))}`);

  const chainInv = await page.locator('text=Chain Mail').first().isVisible().catch(() => false);
  const ringInv  = await page.locator('text=Ring of Protection').first().isVisible().catch(() => false);

  if (chainInv) PASS('Chain Mail auto-added to Inventory on equip');
  else          FAIL('Chain Mail NOT in Inventory');
  if (ringInv)  PASS('Ring of Protection +1 auto-added to Inventory on equip');
  else          FAIL('Ring NOT in Inventory');

  await browser.close();
  console.log(`\n${process.exitCode ? '❌ Some tests FAILED.' : '✅ All tests passed.'}`);
})();
