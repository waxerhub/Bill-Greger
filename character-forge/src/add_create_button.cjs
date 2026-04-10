const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: add createFullCharacter function before styles ───────────────────
const S1_OLD = '    setSuggestLoading(false);\n  }\n\n  // Styles';
const S1_NEW =
  '    setSuggestLoading(false);\n  }\n' +
  '  function createFullCharacter(){\n' +
  '    if(!genResult||genResult.error)return;\n' +
  '    // Apply all character fields\n' +
  '    if(genResult.name)setCharName(genResult.name);\n' +
  '    if(genResult.race&&RACES[genResult.race])setRace(genResult.race);\n' +
  '    if(genResult.cls&&CLASSES[genResult.cls])changeClass(genResult.cls);\n' +
  '    if(genResult.level)setLevel(parseInt(genResult.level)||1);\n' +
  '    if(genResult.stats)setStats({Str:genResult.stats.Str||10,Dex:genResult.stats.Dex||10,Con:genResult.stats.Con||10,Int:genResult.stats.Int||10,Wis:genResult.stats.Wis||10,Cha:genResult.stats.Cha||10});\n' +
  '    if(genResult.strPct)setStrPct(parseInt(genResult.strPct)||0);\n' +
  '    if(genResult.align)setAlign(genResult.align);\n' +
  '    if(genResult.hp)setHP(parseInt(genResult.hp)||1);\n' +
  '    if(genResult.notes)setNotes(genResult.notes);\n' +
  '    // Apply suggested spells to memorized list\n' +
  '    if(aiHighlight.length>0){\n' +
  '      var matched=SPELL_DATA.filter(function(s){return aiHighlight.indexOf(s["Spell Name"])>=0;});\n' +
  '      var withIds=matched.map(function(s){return Object.assign({},s,{prepId:Date.now()+"_"+Math.random()});});\n' +
  '      setMemorized(withIds);\n' +
  '    }\n' +
  '    setActiveCasts([]);setCombatRound(1);\n' +
  '    setTab("stats");\n' +
  '  }\n\n  // Styles';
if (!src.includes(S1_OLD)) { console.log('ERR step1 anchor not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: added createFullCharacter function');

// ── Step 2: replace button row with Create + secondary buttons ───────────────
const S2_OLD =
  '              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>\n' +
  '                <button onClick={function(){applyGenerated(genResult);}} style={{padding:"7px 22px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #3a6a3a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>\u2713 Apply to Character</button>\n' +
  '                {(genResult.cls==="Mage"||genResult.cls==="Illusionist"||genResult.cls==="Cleric"||genResult.cls==="Druid")&&\n' +
  '                  <button onClick={doSuggestSpells} disabled={suggestLoading} style={{padding:"7px 22px",background:suggestLoading?"#1a1a28":"#1a1a2e",color:suggestLoading?dim:"#80b0e0",border:"1px solid "+(suggestLoading?brd:"#2a3a6a"),borderRadius:"4px",cursor:suggestLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>{suggestLoading?"\u2026 Thinking":"\u2726 Suggest Spells"}</button>\n' +
  '                }\n' +
  '              </div>\n' +
  '              {suggestDone&&aiHighlight.length>0&&<div style={{marginTop:"8px",fontSize:"11px",color:"#80b0e0",fontFamily:"monospace"}}>\u2191 {aiHighlight.length} spells highlighted \u2014 switch to the Spells tab to browse them</div>}\n' +
  '              {suggestDone&&aiHighlight.length===0&&<div style={{marginTop:"8px",fontSize:"11px",color:dim,fontFamily:"monospace"}}>No castable spells found for this class/level</div>}';

const S2_NEW =
  '              {/* Primary create action */}\n' +
  '              <button onClick={createFullCharacter} style={{width:"100%",padding:"10px",background:"#1e1a2e",color:g,border:"1px solid #3a2a5a",borderRadius:"6px",cursor:"pointer",fontFamily:"monospace",fontSize:"12px",letterSpacing:"2px",marginBottom:"10px",fontWeight:"bold"}}>\u2726 CREATE CHARACTER{aiHighlight.length>0?" + "+aiHighlight.length+" SPELLS":""}</button>\n' +
  '              {/* Secondary actions */}\n' +
  '              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>\n' +
  '                <button onClick={function(){applyGenerated(genResult);}} style={{padding:"5px 14px",background:"transparent",color:"#7db87d",border:"1px solid #3a6a3a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px",opacity:0.7}}>\u2713 Stats only</button>\n' +
  '                {(genResult.cls==="Mage"||genResult.cls==="Illusionist"||genResult.cls==="Cleric"||genResult.cls==="Druid")&&\n' +
  '                  <button onClick={doSuggestSpells} disabled={suggestLoading} style={{padding:"5px 14px",background:"transparent",color:suggestLoading?dim:"#80b0e0",border:"1px solid "+(suggestLoading?brd:"#2a3a6a"),borderRadius:"4px",cursor:suggestLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"10px",opacity:suggestLoading?0.5:0.8}}>{suggestLoading?"\u2026 Thinking":"\u2726 Suggest Spells"+(suggestDone?" \u2713":"")}</button>\n' +
  '                }\n' +
  '              </div>\n' +
  '              {suggestDone&&aiHighlight.length>0&&<div style={{marginTop:"8px",fontSize:"11px",color:"#80b0e0",fontFamily:"monospace"}}>{aiHighlight.length} spells queued \u2014 hit Create to apply them, or browse the Spells tab</div>}\n' +
  '              {suggestDone&&aiHighlight.length===0&&<div style={{marginTop:"8px",fontSize:"11px",color:dim,fontFamily:"monospace"}}>No castable spells found for this class/level</div>}';

if (!src.includes(S2_OLD)) { console.log('ERR step2 button row not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: replaced button row');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
