const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: add fetchSpellDescription to import ───────────────────────────────
const I_OLD = 'import { streamSpellSearch, extractSpellNames, generateCharacter, suggestSpellsForCharacter } from "./claudeAI.js";';
const I_NEW = 'import { streamSpellSearch, extractSpellNames, generateCharacter, suggestSpellsForCharacter, fetchSpellDescription } from "./claudeAI.js";';
if (!src.includes(I_OLD)) { console.log('ERR step1 import not found'); process.exit(1); }
src = src.replace(I_OLD, I_NEW); ok++;
console.log('Step 1 done: updated import');

// ── Step 2: add spellDesc state after suggestDone ────────────────────────────
const S2_OLD = '  var _suggestDone=useState(false),suggestDone=_suggestDone[0],setSuggestDone=_suggestDone[1];';
const S2_NEW =
  '  var _suggestDone=useState(false),suggestDone=_suggestDone[0],setSuggestDone=_suggestDone[1];\n' +
  '  var _expandedSpell=useState(null),expandedSpell=_expandedSpell[0],setExpandedSpell=_expandedSpell[1];\n' +
  '  var _spellDescs=useState({}),spellDescs=_spellDescs[0],setSpellDescs=_spellDescs[1];\n' +
  '  var _spellDescLoading=useState({}),spellDescLoading=_spellDescLoading[0],setSpellDescLoading=_spellDescLoading[1];';
if (!src.includes(S2_OLD)) { console.log('ERR step2 suggestDone state not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: added spell description state');

// ── Step 3: add toggleSpellDesc function in AI helpers ───────────────────────
const S3_OLD = '  async function doSpellSearch(){';
const S3_NEW =
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
  '  }\n' +
  '  async function doSpellSearch(){';
if (!src.includes(S3_OLD)) { console.log('ERR step3 doSpellSearch not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: added toggleSpellDesc function');

// ── Step 4: replace spell row with expandable version ────────────────────────
const S4_OLD =
  '            {availableSpells.slice(0,150).map(function(s,i){var n=memoInstances(s);var sl=parseInt(s.Level),sa=adjSlots[sl-1]||0,su=memoCount(sl);var full=su>=sa;var cc=s.Category==="Combat"?"#e08080":s.Category==="Support"?"#80e080":"#8080e0";\n' +
  '              var isHighlighted=aiHighlight.length>0&&aiHighlight.indexOf(s["Spell Name"])>=0;\n' +
  '              return <div key={i} style={{padding:"6px 12px",borderBottom:"1px solid "+brd,display:"flex",alignItems:"center",gap:"10px",opacity:full&&!n?0.4:1,background:isHighlighted?"#1a1a0a":undefined,boxShadow:isHighlighted?"inset 0 0 0 1px #6a5a20":undefined}}>\n' +
  '                <button onClick={function(){addToMemo(s);}} disabled={full} style={{background:n>0?"#2a3a2a":"#1a1a28",color:n>0?"#7a7":dim,border:"1px solid "+(n>0?"#3a5a3a":brd),padding:"2px 8px",borderRadius:"3px",cursor:full?"not-allowed":"pointer",fontSize:"11px",fontFamily:"monospace",minWidth:"32px"}}>{n>0?"+"+n:"+"}</button>\n' +
  '                <span style={{fontSize:"11px",color:dim,fontFamily:"monospace",minWidth:"20px"}}>L{s.Level}</span>\n' +
  '                <span style={{fontSize:"12px",color:n>0?g:txt,flex:1}}>{s["Spell Name"]}</span>\n' +
  '                <span style={{fontSize:"9px",color:cc,fontFamily:"monospace"}}>{s.Category}</span>\n' +
  '                {s["Damage Dice"]&&<span style={{fontSize:"9px",color:"#e08080",fontFamily:"monospace"}}>{s["Damage Dice"]}</span>}\n' +
  '              </div>;\n' +
  '            })}';

const S4_NEW =
  '            {availableSpells.slice(0,150).map(function(s,i){\n' +
  '              var n=memoInstances(s);var sl=parseInt(s.Level),sa=adjSlots[sl-1]||0,su=memoCount(sl);var full=su>=sa;\n' +
  '              var cc=s.Category==="Combat"?"#e08080":s.Category==="Support"?"#80e080":"#8080e0";\n' +
  '              var isHighlighted=aiHighlight.length>0&&aiHighlight.indexOf(s["Spell Name"])>=0;\n' +
  '              var name=s["Spell Name"];\n' +
  '              var isOpen=expandedSpell===name;\n' +
  '              var desc=spellDescs[name];\n' +
  '              var loading=spellDescLoading[name];\n' +
  '              return <div key={i} style={{borderBottom:"1px solid "+brd,background:isHighlighted?"#1a1a0a":isOpen?"#111120":undefined,boxShadow:isHighlighted?"inset 0 0 0 1px #6a5a20":undefined,opacity:full&&!n?0.4:1}}>\n' +
  '                <div style={{padding:"6px 12px",display:"flex",alignItems:"center",gap:"10px"}}>\n' +
  '                  <button onClick={function(){addToMemo(s);}} disabled={full} style={{background:n>0?"#2a3a2a":"#1a1a28",color:n>0?"#7a7":dim,border:"1px solid "+(n>0?"#3a5a3a":brd),padding:"2px 8px",borderRadius:"3px",cursor:full?"not-allowed":"pointer",fontSize:"11px",fontFamily:"monospace",minWidth:"32px"}}>{n>0?"+"+n:"+"}</button>\n' +
  '                  <span style={{fontSize:"11px",color:dim,fontFamily:"monospace",minWidth:"20px"}}>L{s.Level}</span>\n' +
  '                  <span style={{fontSize:"12px",color:n>0?g:txt,flex:1}}>{name}</span>\n' +
  '                  <span style={{fontSize:"9px",color:cc,fontFamily:"monospace"}}>{s.Category}</span>\n' +
  '                  {s["Damage Dice"]&&<span style={{fontSize:"9px",color:"#e08080",fontFamily:"monospace"}}>{s["Damage Dice"]}</span>}\n' +
  '                  <button onClick={function(){toggleSpellDesc(s);}} title="Show description" style={{background:"transparent",border:"none",color:isOpen?g:dim,cursor:"pointer",fontSize:"12px",padding:"0 4px",lineHeight:1}}>{isOpen?"\u25bc":"\u25b6"}</button>\n' +
  '                </div>\n' +
  '                {isOpen&&<div style={{padding:"6px 14px 10px 58px",fontSize:"11px",color:"#b8b4a8",lineHeight:"1.6",fontStyle:"italic"}}>\n' +
  '                  {loading&&<span style={{color:dim,fontFamily:"monospace"}}>\u2026 loading</span>}\n' +
  '                  {!loading&&desc&&<span>{desc}</span>}\n' +
  '                  {!loading&&!desc&&<span style={{color:dim,fontFamily:"monospace"}}>fetching\u2026</span>}\n' +
  '                </div>}\n' +
  '              </div>;\n' +
  '            })}';

if (!src.includes(S4_OLD)) { console.log('ERR step4 spell row not found'); process.exit(1); }
src = src.replace(S4_OLD, S4_NEW); ok++;
console.log('Step 4 done: spell rows updated with expandable description');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
