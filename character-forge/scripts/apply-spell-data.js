// Merge 6-agent priest spell enrichment into spellData.json
// Run: node character-forge/scripts/apply-spell-data.js

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '../public/spellData.json');

const spells = JSON.parse(readFileSync(dataPath, 'utf8'));

const FIELDS = ['Duration', 'Range', 'Casting Time', 'Area of Effect', 'Components', 'Saving Throw'];

// Load all 6 agent batch files
const enriched = {};  // lowercase name → enriched data
const buffMap  = {};  // canonical name → buff object

for (let i = 1; i <= 6; i++) {
  let batch;
  try {
    batch = JSON.parse(readFileSync(`/tmp/agent_batch${i}.json`, 'utf8'));
    console.log(`Batch ${i}: ${batch.length} entries`);
  } catch (e) {
    console.warn(`Batch ${i} not found or invalid: ${e.message}`);
    continue;
  }
  batch.forEach(entry => {
    const key = (entry.name || entry['Spell Name'] || '').toLowerCase().trim();
    if (!key) return;
    enriched[key] = entry;
    if (entry.buff && typeof entry.buff === 'object') {
      buffMap[entry.name || entry['Spell Name']] = entry.buff;
    }
  });
}

console.log(`\nTotal enriched spell entries: ${Object.keys(enriched).length}`);
console.log(`Spells with buff effects:     ${Object.keys(buffMap).length}`);

// Apply fields to spellData.json
let fieldMatches = 0;
let spellMatches = 0;

spells.forEach(spell => {
  const key = spell['Spell Name'].toLowerCase().trim();
  const data = enriched[key];
  if (!data) return;
  spellMatches++;
  FIELDS.forEach(f => {
    const val = data[f] || data[f.toLowerCase()];
    if (val && val !== '—' && val !== '' && val !== 'Unknown') {
      spell[f] = String(val).trim();
      fieldMatches++;
    }
  });
});

console.log(`\nSpell matches: ${spellMatches} / ${spells.length}`);
console.log(`Field values applied: ${fieldMatches}`);

// Save updated spellData.json
writeFileSync(dataPath, JSON.stringify(spells, null, 2));
console.log(`\nSaved ${dataPath}`);

// Print BUFF_SPELLS for SpellEngine.jsx
console.log('\n// ──────────────────────────────────────────────────────');
console.log('// NEW BUFF_SPELLS — replace existing object in SpellEngine.jsx');
console.log('// ──────────────────────────────────────────────────────');
console.log('var BUFF_SPELLS={');
Object.entries(buffMap).sort((a,b) => a[0].localeCompare(b[0])).forEach(([name, props]) => {
  console.log(`  ${JSON.stringify(name)}:${JSON.stringify(props)},`);
});
console.log('};');

// Distribution summary
const durCounts = {};
spells.forEach(s => {
  const d = s['Duration'] || '(none)';
  durCounts[d] = (durCounts[d] || 0) + 1;
});
const top = Object.entries(durCounts).sort((a,b) => b[1]-a[1]).slice(0, 15);
console.log('\n// Top Duration values:');
top.forEach(([k,v]) => console.log(`//   ${v.toString().padStart(4)}  ${k}`));
