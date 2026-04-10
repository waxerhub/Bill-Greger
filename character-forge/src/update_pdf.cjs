const fs=require('fs');
let src=fs.readFileSync('exportPDF.js','utf8');

const OLD=
'function dexBonus(d) {\n' +
'  // PHB Dexterity Table I: Defensive Adjustment\n' +
'  if (d === 3) return 4; if (d === 4) return 3; if (d === 5) return 2; if (d === 6) return 1;\n' +
'  if (d <= 14) return 0;  // 7\u201314: no adjustment\n' +
'  if (d === 15) return -1; if (d === 16) return -2; if (d === 17) return -3; if (d === 18) return -4;\n' +
'  return -4;\n' +
'}';

const NEW=
'// PHB Table 2: DEXTERITY — Defensive Adjustment (positive = worse AC)\n' +
'function dexBonus(d) {\n' +
'  if (d <= 1) return 4;\n' +
'  if (d === 2) return 3;\n' +
'  if (d === 3) return 3;\n' +
'  if (d === 4) return 2;\n' +
'  if (d === 5) return 1;\n' +
'  if (d <= 14) return 0;\n' +
'  if (d === 15) return -1; if (d === 16) return -2; if (d === 17) return -3; if (d === 18) return -4;\n' +
'  if (d <= 20) return -4;\n' +
'  if (d <= 23) return -5;\n' +
'  return -6; // 24-25\n' +
'}';

if(!src.includes(OLD)){
  console.log('ERROR: old dexBonus not found');
  // Show what's actually there
  const idx=src.indexOf('function dexBonus');
  if(idx>=0) console.log('Found at index',idx,':\n'+src.substring(idx,idx+300));
  process.exit(1);
}
src=src.replace(OLD,NEW);
fs.writeFileSync('exportPDF.js',src,'utf8');
console.log('exportPDF.js updated successfully.');
