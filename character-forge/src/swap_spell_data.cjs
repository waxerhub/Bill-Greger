const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');

// Find the embedded SPELL_DATA line and replace it with an import
// The line starts with "var SPELL_DATA = [" and ends with "];"
const startMarker = '\n// ======== EMBEDDED SPELL DATA ========\nvar SPELL_DATA = [';
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) { console.log('ERR: SPELL_DATA section not found'); process.exit(1); }

// Find the end of the array — look for "];" followed by a newline then a comment
// We know the next section starts with "\n\n// ======== CORE 2E TABLES"
const endMarker = ';\n\n// ======== CORE 2E TABLES';
const endIdx = src.indexOf(endMarker, startIdx);
if (endIdx === -1) { console.log('ERR: end of SPELL_DATA not found'); process.exit(1); }

const before = src.slice(0, startIdx);
const after = src.slice(endIdx + 1); // keep the \n before CORE 2E TABLES

const replacement = '\nimport { SPELL_DATA } from "./spellData.js";';

src = before + replacement + '\n' + after;

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('Done. Embedded SPELL_DATA replaced with import from spellData.js');
