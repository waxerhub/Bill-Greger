const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: add suggestSpellsForCharacter to import ──────────────────────────
const I_OLD = 'import { streamSpellSearch, extractSpellNames, generateCharacter } from "./claudeAI.js";';
const I_NEW = 'import { streamSpellSearch, extractSpellNames, generateCharacter, suggestSpellsForCharacter } from "./claudeAI.js";';
if (!src.includes(I_OLD)) { console.log('ERR step1 import not found'); process.exit(1); }
src = src.replace(I_OLD, I_NEW); ok++;
console.log('Step 1 done: updated import');

// ── Step 2: add suggestLoading state after genLoading ────────────────────────
const S2_OLD = '  var _genLoading=useState(false),genLoading=_genLoading[0],setGenLoading=_genLoading[1];';
const S2_NEW =
  '  var _genLoading=useState(false),genLoading=_genLoading[0],setGenLoading=_genLoading[1];\n' +
  '  var _suggestLoading=useState(false),suggestLoading=_suggestLoading[0],setSuggestLoading=_suggestLoading[1];\n' +
  '  var _suggestDone=useState(false),suggestDone=_suggestDone[0],setSuggestDone=_suggestDone[1];';
if (!src.includes(S2_OLD)) { console.log('ERR step2 genLoading state not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: added suggestLoading state');

// ── Step 3: add doSuggestSpells function after applyGenerated ─────────────────
const S3_OLD = '    setTab("stats");\n  }\n\n  // Styles';
const S3_NEW =
  '    setTab("stats");\n  }\n' +
  '  async function doSuggestSpells(){\n' +
  '    if(!genResult||genResult.error||suggestLoading)return;\n' +
  '    if(!apiKey){setAiHighlight([]);setSuggestDone(false);return;}\n' +
  '    setSuggestLoading(true);setSuggestDone(false);setAiHighlight([]);\n' +
  '    try{\n' +
  '      // Determine caster group and max castable spell level\n' +
  '      var genCls=CLASSES[genResult.cls]||{};\n' +
  '      var genGroup=genCls.group||"";\n' +
  '      var genLvl=parseInt(genResult.level)||1;\n' +
  '      // Wizard: roughly ceil(level/2), Priest: similar progression, cap 9\n' +
  '      var maxSpLvl=Math.min(9,Math.ceil(genLvl/2));\n' +
  '      var relevant=SPELL_DATA.filter(function(s){\n' +
  '        if(genGroup==="Wizard"&&s.Sphere&&!s.School)return false;\n' +
  '        if(genGroup==="Priest"&&s.School&&!s.Sphere)return false;\n' +
  '        if(genGroup==="Warrior"||genGroup==="Rogue")return false;\n' +
  '        return parseInt(s.Level)<=maxSpLvl;\n' +
  '      });\n' +
  '      if(relevant.length===0){setSuggestDone(true);setSuggestLoading(false);return;}\n' +
  '      var charInfo={name:genResult.name,race:genResult.race,cls:genResult.cls,level:genResult.level,align:genResult.align};\n' +
  '      var names=await suggestSpellsForCharacter(charInfo,genPrompt,relevant,apiKey);\n' +
  '      setAiHighlight(names);\n' +
  '      setSuggestDone(true);\n' +
  '    }catch(e){setAiHighlight([{error:e.message}]);setSuggestDone(false);}\n' +
  '    setSuggestLoading(false);\n' +
  '  }\n\n  // Styles';
if (!src.includes(S3_OLD)) { console.log('ERR step3 applyGenerated end not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: added doSuggestSpells function');

// ── Step 4: add Suggest Spells button after Apply to Character button ─────────
const S4_OLD =
  '              <button onClick={function(){applyGenerated(genResult);}} style={{padding:"7px 22px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #3a6a3a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>\u2713 Apply to Character</button>\n' +
  '            </div>}';
const S4_NEW =
  '              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>\n' +
  '                <button onClick={function(){applyGenerated(genResult);}} style={{padding:"7px 22px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #3a6a3a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>\u2713 Apply to Character</button>\n' +
  '                {(genResult.cls==="Mage"||genResult.cls==="Illusionist"||genResult.cls==="Cleric"||genResult.cls==="Druid")&&\n' +
  '                  <button onClick={doSuggestSpells} disabled={suggestLoading} style={{padding:"7px 22px",background:suggestLoading?"#1a1a28":"#1a1a2e",color:suggestLoading?dim:"#80b0e0",border:"1px solid "+(suggestLoading?brd:"#2a3a6a"),borderRadius:"4px",cursor:suggestLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>{suggestLoading?"\u2026 Thinking":"\u2726 Suggest Spells"}</button>\n' +
  '                }\n' +
  '              </div>\n' +
  '              {suggestDone&&aiHighlight.length>0&&<div style={{marginTop:"8px",fontSize:"11px",color:"#80b0e0",fontFamily:"monospace"}}>\u2191 {aiHighlight.length} spells highlighted \u2014 switch to the Spells tab to browse them</div>}\n' +
  '              {suggestDone&&aiHighlight.length===0&&<div style={{marginTop:"8px",fontSize:"11px",color:dim,fontFamily:"monospace"}}>No castable spells found for this class/level</div>}\n' +
  '            </div>}';
if (!src.includes(S4_OLD)) { console.log('ERR step4 Apply button not found'); process.exit(1); }
src = src.replace(S4_OLD, S4_NEW); ok++;
console.log('Step 4 done: added Suggest Spells button');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
