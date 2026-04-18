// Seed canonical AD&D 2E tiered items into the player library.
// Usage: VITE_SUPABASE_URL=https://... VITE_SUPABASE_ANON_KEY=... node scripts/seed-library.js
//
// Or create character-forge/.env.local with those two vars and run:
//   node --env-file=.env.local scripts/seed-library.js

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key || url.includes('your-project')) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before running.');
  process.exit(1);
}

const supabase = createClient(url, key);

const B = {str:0,dex:0,con:0,int:0,wis:0,cha:0,ac:0,thac0:0,dmg:0,saves:0,hp:0,bonusDmgDice:0,bonusDmgDie:6,bonusDmgType:'',specialDmgMode:'bonus'};
const e = (overrides) => Object.assign({}, B, overrides);

const ITEMS = [
  {
    name: 'Bracers of Defense',
    type: 'Bracers/Gloves',
    source: 'DMG p.160',
    description: 'Usable only by classes that cannot wear armor (wizards, etc.). Sets base AC — does not stack with armor. Bonus = 10 minus the AC value of the bracers.',
    tiered: true,
    activeTier: 0,
    tiers: [
      { label: 'AC 8', effects: e({ac:2}) },
      { label: 'AC 7', effects: e({ac:3}) },
      { label: 'AC 6', effects: e({ac:4}) },
      { label: 'AC 5', effects: e({ac:5}) },
      { label: 'AC 4', effects: e({ac:6}) },
      { label: 'AC 3', effects: e({ac:7}) },
      { label: 'AC 2', effects: e({ac:8}) },
    ],
  },
  {
    name: 'Ring of Protection',
    type: 'Ring',
    source: 'DMG p.184',
    description: 'Improves AC and saving throws. Does not improve AC if magical armor is worn (saves bonus still applies). Multiple rings do not stack — only the strongest applies.',
    tiered: true,
    activeTier: 0,
    tiers: [
      { label: '+1',          effects: e({ac:1, saves:1}) },
      { label: '+2',          effects: e({ac:2, saves:2}) },
      { label: "+2 5' rad",   effects: e({ac:2, saves:2}) },
      { label: '+3',          effects: e({ac:3, saves:3}) },
      { label: "+3 5' rad",   effects: e({ac:3, saves:3}) },
      { label: '+4 (+2 sv)',  effects: e({ac:4, saves:2}) },
      { label: '+6 (+1 sv)',  effects: e({ac:6, saves:1}) },
    ],
  },
  {
    name: 'Cloak of Protection',
    type: 'Cloak/Robe',
    source: 'DMG p.161',
    description: 'Incompatible with most armor and other protection items. Improves AC and all saving throws.',
    tiered: true,
    activeTier: 0,
    tiers: [
      { label: '+1', effects: e({ac:1, saves:1}) },
      { label: '+2', effects: e({ac:2, saves:2}) },
      { label: '+3', effects: e({ac:3, saves:3}) },
      { label: '+4', effects: e({ac:4, saves:4}) },
      { label: '+5', effects: e({ac:5, saves:5}) },
    ],
  },
  {
    name: 'Gauntlets of Ogre Power',
    type: 'Bracers/Gloves',
    source: 'DMG p.165',
    description: 'Grants the wearer STR 18/00. Enter the bonus as the difference from your natural STR. Gives attack and damage bonuses equivalent to STR 18/00.',
    tiered: false,
    effects: e({str:4, thac0:3, dmg:6}),
  },
  {
    name: 'Girdle of Giant Strength',
    type: 'Belt',
    source: 'DMG p.166',
    description: 'Sets STR to giant-level. Set the str bonus as the difference from your natural STR.',
    tiered: true,
    activeTier: 0,
    tiers: [
      { label: 'Hill (19)',   effects: e({str:5, thac0:3, dmg:7}) },
      { label: 'Stone (20)',  effects: e({str:6, thac0:3, dmg:8}) },
      { label: 'Frost (21)',  effects: e({str:7, thac0:4, dmg:9}) },
      { label: 'Fire (22)',   effects: e({str:8, thac0:4, dmg:10}) },
      { label: 'Cloud (23)',  effects: e({str:9, thac0:5, dmg:11}) },
      { label: 'Storm (24)',  effects: e({str:10, thac0:6, dmg:12}) },
    ],
  },
  {
    name: 'Amulet of Natural Armor',
    type: 'Amulet/Necklace',
    source: 'DMG',
    description: 'Grants a natural armor bonus to AC. Does not stack with other natural armor bonuses.',
    tiered: true,
    activeTier: 0,
    tiers: [
      { label: '+1', effects: e({ac:1}) },
      { label: '+2', effects: e({ac:2}) },
      { label: '+3', effects: e({ac:3}) },
      { label: '+4', effects: e({ac:4}) },
      { label: '+5', effects: e({ac:5}) },
    ],
  },
];

function buildRow(item) {
  const effects = Object.assign({}, item.effects || {});
  if (item.tiered) {
    effects._tiered = true;
    effects._tiers = item.tiers || [];
    effects._activeTier = item.activeTier || 0;
  }
  return {
    name: item.name,
    type: item.type,
    description: item.description,
    source: item.source || '',
    effects,
    role: 'player',
  };
}

async function seed() {
  console.log(`Seeding ${ITEMS.length} items into player library…\n`);
  let ok = 0, fail = 0;
  for (const item of ITEMS) {
    const row = buildRow(item);
    const { error } = await supabase.from('gear_library').insert(row);
    if (error) {
      console.error(`  ✗ ${item.name}: ${error.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${item.name}`);
      ok++;
    }
  }
  console.log(`\nDone: ${ok} inserted, ${fail} failed.`);
}

seed();
