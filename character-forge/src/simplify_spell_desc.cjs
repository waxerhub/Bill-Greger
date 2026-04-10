const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// Fields already shown in the spell row — don't repeat them in the dropdown
// Everything else from the XLSX gets displayed
const ROW_FIELDS = ['Spell Name','Level','Category','Sphere','School','Damage Dice','_type'];

// ── Step 1: remove fetchSpellDescription from import ─────────────────────────
const I_OLD = 'import { streamSpellSearch, extractSpellNames, generateCharacter, suggestSpellsForCharacter, fetchSpellDescription } from "./claudeAI.js";';
const I_NEW = 'import { streamSpellSearch, extractSpellNames, generateCharacter, suggestSpellsForCharacter } from "./claudeAI.js";';
if (!src.includes(I_OLD)) { console.log('ERR step1 import not found'); process.exit(1); }
src = src.replace(I_OLD, I_NEW); ok++;
console.log('Step 1 done: removed fetchSpellDescription import');

// ── Step 2: remove spellDescs and spellDescLoading state ─────────────────────
const S2_OLD =
  '  var _expandedSpell=useState(null),expandedSpell=_expandedSpell[0],setExpandedSpell=_expandedSpell[1];\n' +
  '  var _spellDescs=useState({}),spellDescs=_spellDescs[0],setSpellDescs=_spellDescs[1];\n' +
  '  var _spellDescLoading=useState({}),spellDescLoading=_spellDescLoading[0],setSpellDescLoading=_spellDescLoading[1];';
const S2_NEW =
  '  var _expandedSpell=useState(null),expandedSpell=_expandedSpell[0],setExpandedSpell=_expandedSpell[1];';
if (!src.includes(S2_OLD)) { console.log('ERR step2 state not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: removed unused state');

// ── Step 3: replace toggleSpellDesc (async API) with simple toggle ────────────
const S3_OLD =
  '  async function toggleSpellDesc(s){\n' +
  '    var name=s["Spell Name"];\n' +
  '    if(expandedSpell===name){setExpandedSpell(null);return;}\n' +
  '    setExpandedSpell(name);\n' +
  '    if(spellDescs[name]||spellDescLoading[name])return;\n' +
  '    if(!apiKey){setSpellDescs(function(p){return Object.assign({},p,{[name]:"Set VITE_ANTHROPIC_API_KEY in .env to see descriptions."});});return;}\n' +
  '    setSpellDescLoading(function(p){return Object.assign({},p,{[name]:true});});\n' +
  '    try{\n' +
  '      var desc=await fetchSpellDescription(s,apiKey);\n' +
  '      setSpellDescs(function(p){return Object.assign({},p,{[name]:desc});});\n' +
  '    }catch(e){\n' +
  '      setSpellDescs(function(p){return Object.assign({},p,{[name]:"Error: "+e.message});});\n' +
  '    }\n' +
  '    setSpellDescLoading(function(p){return Object.assign({},p,{[name]:false});});\n' +
  '  }';
const S3_NEW =
  '  function toggleSpellDesc(s){\n' +
  '    var name=s["Spell Name"];\n' +
  '    setExpandedSpell(function(prev){return prev===name?null:name;});\n' +
  '  }\n' +
  '  var HIDDEN_FIELDS=new Set(["Spell Name","Level","Category","Sphere","School","Damage Dice","_type"]);\n' +
  '  function spellExtraFields(s){\n' +
  '    return Object.keys(s).filter(function(k){return !HIDDEN_FIELDS.has(k)&&s[k]!==""&&s[k]!==null&&s[k]!==undefined;});\n' +
  '  }';
if (!src.includes(S3_OLD)) { console.log('ERR step3 toggleSpellDesc not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: simplified toggleSpellDesc');

// ── Step 4: update expanded panels — shared helper content ───────────────────
// The description panel content used to reference spellDescs/spellDescLoading.
// Replace all three occurrences with direct field display.

// Shared panel body (same logic for all three lists):
const OLD_PANEL_LOADING =
  '                  {spellDescLoading[aName]&&<span style={{color:dim,fontFamily:"monospace"}}>\u2026 loading</span>}\n' +
  '                  {!spellDescLoading[aName]&&spellDescs[aName]&&<span>{spellDescs[aName]}</span>}\n' +
  '                  {!spellDescLoading[aName]&&!spellDescs[aName]&&<span style={{color:dim,fontFamily:"monospace"}}>fetching\u2026</span>}';
const NEW_PANEL_ACTIVE =
  '                  {(function(){var ef=spellExtraFields(c);\n' +
  '                    if(ef.length===0)return <span style={{color:dim,fontFamily:"monospace"}}>No additional data \u2014 upload a richer XLSX to see spell details</span>;\n' +
  '                    return ef.map(function(k){return <div key={k} style={{marginBottom:"2px"}}><span style={{color:dim,fontFamily:"monospace",marginRight:"6px"}}>{k}:</span><span style={{fontStyle:"normal",color:txt}}>{String(c[k])}</span></div>;});\n' +
  '                  })()}';

if (!src.includes(OLD_PANEL_LOADING)) { console.log('ERR step4 active panel not found'); process.exit(1); }
src = src.replace(OLD_PANEL_LOADING, NEW_PANEL_ACTIVE); ok++;
console.log('Step 4 done: active spells panel updated');

const OLD_PANEL_PREP =
  '                  {spellDescLoading[pName]&&<span style={{color:dim,fontFamily:"monospace"}}>\u2026 loading</span>}\n' +
  '                  {!spellDescLoading[pName]&&spellDescs[pName]&&<span>{spellDescs[pName]}</span>}\n' +
  '                  {!spellDescLoading[pName]&&!spellDescs[pName]&&<span style={{color:dim,fontFamily:"monospace"}}>fetching\u2026</span>}';
const NEW_PANEL_PREP =
  '                  {(function(){var ef=spellExtraFields(s);\n' +
  '                    if(ef.length===0)return <span style={{color:dim,fontFamily:"monospace"}}>No additional data \u2014 upload a richer XLSX to see spell details</span>;\n' +
  '                    return ef.map(function(k){return <div key={k} style={{marginBottom:"2px"}}><span style={{color:dim,fontFamily:"monospace",marginRight:"6px"}}>{k}:</span><span style={{fontStyle:"normal",color:txt}}>{String(s[k])}</span></div>;});\n' +
  '                  })()}';

if (!src.includes(OLD_PANEL_PREP)) { console.log('ERR step5 prepared panel not found'); process.exit(1); }
src = src.replace(OLD_PANEL_PREP, NEW_PANEL_PREP); ok++;
console.log('Step 5 done: prepared spells panel updated');

const OLD_PANEL_COMP =
  '                  {loading&&<span style={{color:dim,fontFamily:"monospace"}}>\u2026 loading</span>}\n' +
  '                  {!loading&&desc&&<span>{desc}</span>}\n' +
  '                  {!loading&&!desc&&<span style={{color:dim,fontFamily:"monospace"}}>fetching\u2026</span>}';
const NEW_PANEL_COMP =
  '                  {(function(){var ef=spellExtraFields(s);\n' +
  '                    if(ef.length===0)return <span style={{color:dim,fontFamily:"monospace"}}>No additional data \u2014 upload a richer XLSX to see spell details</span>;\n' +
  '                    return ef.map(function(k){return <div key={k} style={{marginBottom:"2px"}}><span style={{color:dim,fontFamily:"monospace",marginRight:"6px"}}>{k}:</span><span style={{fontStyle:"normal",color:txt}}>{String(s[k])}</span></div>;});\n' +
  '                  })()}';

if (!src.includes(OLD_PANEL_COMP)) { console.log('ERR step6 compendium panel not found'); process.exit(1); }
src = src.replace(OLD_PANEL_COMP, NEW_PANEL_COMP); ok++;
console.log('Step 6 done: compendium panel updated');

// ── Step 7: also remove unused local vars in compendium row ──────────────────
const S7_OLD =
  '              var isOpen=expandedSpell===name;\n' +
  '              var desc=spellDescs[name];\n' +
  '              var loading=spellDescLoading[name];';
const S7_NEW =
  '              var isOpen=expandedSpell===name;';
if (!src.includes(S7_OLD)) { console.log('ERR step7 desc vars not found'); process.exit(1); }
src = src.replace(S7_OLD, S7_NEW); ok++;
console.log('Step 7 done: removed unused local vars');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
