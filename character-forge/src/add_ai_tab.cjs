const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: add import ────────────────────────────────────────────────────────
const I_OLD = 'import { exportCharacterSheet } from "./exportPDF.js";';
const I_NEW = 'import { exportCharacterSheet } from "./exportPDF.js";\nimport { streamSpellSearch, extractSpellNames, generateCharacter } from "./claudeAI.js";';
if (!src.includes(I_OLD)) { console.log('ERR step1 import not found'); process.exit(1); }
src = src.replace(I_OLD, I_NEW); ok++;
console.log('Step 1 done: added claudeAI import');

// ── Step 2: add AI state variables ───────────────────────────────────────────
const S2_OLD = '  var _notes=useState(""),notes=_notes[0],setNotes=_notes[1];\n  var _sfilt=useState(""),spellFilter=_sfilt[0],setSpellFilter=_sfilt[1];';
const S2_NEW =
  '  var _notes=useState(""),notes=_notes[0],setNotes=_notes[1];\n' +
  '  // AI state\n' +
  '  var _aiQuery=useState(""),aiQuery=_aiQuery[0],setAiQuery=_aiQuery[1];\n' +
  '  var _aiResult=useState(""),aiResult=_aiResult[0],setAiResult=_aiResult[1];\n' +
  '  var _aiLoading=useState(false),aiLoading=_aiLoading[0],setAiLoading=_aiLoading[1];\n' +
  '  var _aiMode=useState("spells"),aiMode=_aiMode[0],setAiMode=_aiMode[1];\n' +
  '  var _aiHighlight=useState([]),aiHighlight=_aiHighlight[0],setAiHighlight=_aiHighlight[1];\n' +
  '  var _genPrompt=useState(""),genPrompt=_genPrompt[0],setGenPrompt=_genPrompt[1];\n' +
  '  var _genResult=useState(null),genResult=_genResult[0],setGenResult=_genResult[1];\n' +
  '  var _genLoading=useState(false),genLoading=_genLoading[0],setGenLoading=_genLoading[1];\n' +
  '  var _sfilt=useState(""),spellFilter=_sfilt[0],setSpellFilter=_sfilt[1];';
if (!src.includes(S2_OLD)) { console.log('ERR step2 notes state not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: added AI state variables');

// ── Step 3: add AI functions before styles ────────────────────────────────────
const S3_OLD = '  // Styles\n  var g="#c9a84c"';
const AI_FUNCS =
  '  // ── AI helpers ──────────────────────────────────────────────────────────\n' +
  '  var apiKey=import.meta.env.VITE_ANTHROPIC_API_KEY||"";\n' +
  '  function renderBold(text){\n' +
  '    if(!text)return null;\n' +
  '    var parts=text.split(/(\\*\\*[^*]+\\*\\*)/g);\n' +
  '    return parts.map(function(p,i){\n' +
  '      if(p.length>4&&p.startsWith("**")&&p.endsWith("**"))return <strong key={i} style={{color:"#e0c080"}}>{p.slice(2,-2)}</strong>;\n' +
  '      return <span key={i}>{p}</span>;\n' +
  '    });\n' +
  '  }\n' +
  '  async function doSpellSearch(){\n' +
  '    if(!aiQuery.trim()||aiLoading)return;\n' +
  '    if(!apiKey){setAiResult("\\u26a0 Set VITE_ANTHROPIC_API_KEY in your .env file");return;}\n' +
  '    setAiLoading(true);setAiResult("");setAiHighlight([]);\n' +
  '    try{\n' +
  '      await streamSpellSearch(aiQuery,SPELL_DATA,apiKey,\n' +
  '        function(chunk){setAiResult(function(p){return p+chunk;});},\n' +
  '        function(full){setAiHighlight(extractSpellNames(full));setAiLoading(false);}\n' +
  '      );\n' +
  '    }catch(e){setAiResult("Error: "+e.message);setAiLoading(false);}\n' +
  '  }\n' +
  '  async function doGenChar(){\n' +
  '    if(!genPrompt.trim()||genLoading)return;\n' +
  '    if(!apiKey){setGenResult({error:"Set VITE_ANTHROPIC_API_KEY in your .env file"});return;}\n' +
  '    setGenLoading(true);setGenResult(null);\n' +
  '    try{var r=await generateCharacter(genPrompt,apiKey);setGenResult(r);}catch(e){setGenResult({error:e.message});}\n' +
  '    setGenLoading(false);\n' +
  '  }\n' +
  '  function applyGenerated(r){\n' +
  '    if(!r||r.error)return;\n' +
  '    if(r.name)setCharName(r.name);\n' +
  '    if(r.race&&RACES[r.race])setRace(r.race);\n' +
  '    if(r.cls&&CLASSES[r.cls])changeClass(r.cls);\n' +
  '    if(r.level)setLevel(parseInt(r.level)||1);\n' +
  '    if(r.stats)setStats({Str:r.stats.Str||10,Dex:r.stats.Dex||10,Con:r.stats.Con||10,Int:r.stats.Int||10,Wis:r.stats.Wis||10,Cha:r.stats.Cha||10});\n' +
  '    if(r.strPct)setStrPct(parseInt(r.strPct)||0);\n' +
  '    if(r.align)setAlign(r.align);\n' +
  '    if(r.hp)setHP(parseInt(r.hp)||1);\n' +
  '    if(r.notes)setNotes(r.notes);\n' +
  '    setTab("stats");\n' +
  '  }\n\n' +
  '  // Styles\n  var g="#c9a84c"';
if (!src.includes(S3_OLD)) { console.log('ERR step3 styles marker not found'); process.exit(1); }
src = src.replace(S3_OLD, AI_FUNCS); ok++;
console.log('Step 3 done: added AI helper functions');

// ── Step 4: add ✦ AI to tabs array ───────────────────────────────────────────
const S4_OLD = 'var tabs=["stats","combat","spells","\\u2726 CP","sheet","notes"];';
const S4_NEW = 'var tabs=["stats","combat","spells","\\u2726 CP","sheet","notes","\\u2726 AI"];';
if (!src.includes(S4_OLD)) {
  // Try with the actual unicode char
  const alt_old = 'var tabs=["stats","combat","spells","\u2726 CP","sheet","notes"];';
  const alt_new = 'var tabs=["stats","combat","spells","\u2726 CP","sheet","notes","\u2726 AI"];';
  if (!src.includes(alt_old)) { console.log('ERR step4 tabs not found'); process.exit(1); }
  src = src.replace(alt_old, alt_new);
} else {
  src = src.replace(S4_OLD, S4_NEW);
}
ok++;
console.log('Step 4 done: added AI tab to navigation');

// ── Step 5: highlight spells in compendium ────────────────────────────────────
const S5_OLD = 'return <div key={i} style={{padding:"6px 12px",borderBottom:"1px solid "+brd,display:"flex",alignItems:"center",gap:"10px",opacity:full&&!n?0.4:1}}>';
const S5_NEW = 'var isHighlighted=aiHighlight.length>0&&aiHighlight.indexOf(s["Spell Name"])>=0;\n' +
  '              return <div key={i} style={{padding:"6px 12px",borderBottom:"1px solid "+brd,display:"flex",alignItems:"center",gap:"10px",opacity:full&&!n?0.4:1,background:isHighlighted?"#1a1a0a":undefined,boxShadow:isHighlighted?"inset 0 0 0 1px #6a5a20":undefined}}>';
if (!src.includes(S5_OLD)) { console.log('ERR step5 spell row not found'); process.exit(1); }
src = src.replace(S5_OLD, S5_NEW); ok++;
console.log('Step 5 done: spell highlight added to compendium');

// ── Step 6: add AI tab JSX ────────────────────────────────────────────────────
const S6_OLD = '        </div>}\n\n      </div>\n    </div>\n  );\n}';
const AI_TAB =
  '        </div>}\n\n' +
  '        {/* \u2550\u2550\u2550 AI TAB \u2550\u2550\u2550 */}\n' +
  '        {tab==="AI"&&<div>\n' +
  '          <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>\n' +
  '            {["spells","gen"].map(function(m){\n' +
  '              var label=m==="spells"?"\u2726 Spell Search":"\u2726 Character Generator";\n' +
  '              return <button key={m} onClick={function(){setAiMode(m);setAiResult("");setAiHighlight([]);setGenResult(null);}} style={{padding:"6px 16px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",letterSpacing:"1px",background:aiMode===m?"#1a1a30":"transparent",color:aiMode===m?g:dim,border:aiMode===m?"1px solid #2a2a4a":"1px solid transparent"}}>{label}</button>;\n' +
  '            })}\n' +
  '          </div>\n' +
  '          {aiMode==="spells"&&<div>\n' +
  '            <Lbl dim={dim}>DESCRIBE THE SPELLS YOU NEED</Lbl>\n' +
  '            <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>\n' +
  '              <input value={aiQuery} onChange={function(e){setAiQuery(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")doSpellSearch();}} placeholder="e.g. healing over time, charm a humanoid, conjure fire, teleport…" style={Object.assign({},is(brd,txt),{flex:1})} />\n' +
  '              <button onClick={doSpellSearch} disabled={aiLoading} style={{padding:"6px 18px",background:aiLoading?"#1a1a28":"#1a2a1a",color:aiLoading?dim:"#7db87d",border:"1px solid "+(aiLoading?brd:"#3a6a3a"),borderRadius:"4px",cursor:aiLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px"}}>{aiLoading?"\u2026":"Search"}</button>\n' +
  '            </div>\n' +
  '            {aiResult&&<div style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"14px",fontSize:"12px",lineHeight:"1.8",whiteSpace:"pre-wrap",color:txt,maxHeight:"50vh",overflowY:"auto"}}>{renderBold(aiResult)}</div>}\n' +
  '            {aiHighlight.length>0&&<div style={{marginTop:"8px",fontSize:"11px",color:"#7db87d",fontFamily:"monospace"}}>\u2191 {aiHighlight.length} spell{aiHighlight.length!==1?"s":""} highlighted in compendium \u2014 switch to the Spells tab to see them</div>}\n' +
  '          </div>}\n' +
  '          {aiMode==="gen"&&<div>\n' +
  '            <Lbl dim={dim}>DESCRIBE YOUR CHARACTER CONCEPT</Lbl>\n' +
  '            <textarea value={genPrompt} onChange={function(e){setGenPrompt(e.target.value);}} placeholder="e.g. A grizzled dwarven fighter who lost his clan and wanders as a mercenary. Strong, tough, suspicious of magic\u2026" style={{width:"100%",minHeight:"120px",padding:"10px",background:surf,border:"1px solid "+brd,borderRadius:"6px",color:txt,fontSize:"13px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical",lineHeight:"1.6",marginBottom:"10px"}} />\n' +
  '            <button onClick={doGenChar} disabled={genLoading} style={{padding:"7px 22px",background:genLoading?"#1a1a28":"#1e1a2e",color:genLoading?dim:g,border:"1px solid "+(genLoading?brd:"#3a2a5a"),borderRadius:"4px",cursor:genLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>{genLoading?"Generating\u2026":"Generate Character"}</button>\n' +
  '            {genResult&&!genResult.error&&<div style={{marginTop:"14px",background:surf,border:"1px solid "+brd,borderRadius:"8px",padding:"16px"}}>\n' +
  '              <div style={{color:g,fontWeight:"bold",fontSize:"15px",marginBottom:"10px",fontVariant:"small-caps",letterSpacing:"2px"}}>{genResult.name||"Character"}</div>\n' +
  '              <div style={{fontSize:"12px",marginBottom:"10px"}}>\n' +
  '                <Row l="Race" v={genResult.race} l2="Class" v2={genResult.cls} />\n' +
  '                <Row l="Level" v={genResult.level} l2="Alignment" v2={genResult.align} />\n' +
  '                <Row l="HP" v={genResult.hp} l2="STR" v2={genResult.stats&&(genResult.stats.Str+(genResult.strPct>0?" (18/"+genResult.strPct+"%)":""))} />\n' +
  '                <Row l="DEX/CON" v={genResult.stats&&genResult.stats.Dex+"/"+genResult.stats.Con} l2="INT/WIS/CHA" v2={genResult.stats&&genResult.stats.Int+"/"+genResult.stats.Wis+"/"+genResult.stats.Cha} />\n' +
  '              </div>\n' +
  '              {genResult.notes&&<div style={{color:"#bbb",fontSize:"12px",lineHeight:"1.7",marginBottom:"12px",fontStyle:"italic"}}>{genResult.notes}</div>}\n' +
  '              <button onClick={function(){applyGenerated(genResult);}} style={{padding:"7px 22px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #3a6a3a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>\u2713 Apply to Character</button>\n' +
  '            </div>}\n' +
  '            {genResult&&genResult.error&&<div style={{marginTop:"12px",color:"#e08080",fontSize:"12px",fontFamily:"monospace",padding:"10px",background:"#1a0a0a",border:"1px solid #4a2020",borderRadius:"4px"}}>\u26a0 {genResult.error}</div>}\n' +
  '          </div>}\n' +
  '        </div>}\n\n' +
  '      </div>\n    </div>\n  );\n}';

if (!src.includes(S6_OLD)) { console.log('ERR step6 notes tab end not found'); process.exit(1); }
src = src.replace(S6_OLD, AI_TAB); ok++;
console.log('Step 6 done: AI tab JSX added');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
