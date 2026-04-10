var fs=require('fs');
var path=require('path');

var filePath=path.join(__dirname,'SpellEngine.jsx');
var content=fs.readFileSync(filePath,'utf8');
var original=content;

function replace(label,oldStr,newStr){
  var idx=content.indexOf(oldStr);
  if(idx<0){
    var ctx=oldStr.substring(0,80).replace(/\n/g,'\\n');
    throw new Error('REPLACEMENT NOT FOUND ['+label+']: ...'+ctx+'...');
  }
  var count=0,pos=0;
  while((pos=content.indexOf(oldStr,pos))>=0){count++;pos+=oldStr.length;}
  if(count>1) throw new Error('REPLACEMENT AMBIGUOUS ['+label+']: found '+count+' times');
  content=content.replace(oldStr,newStr);
  console.log('OK: '+label);
}

// ── 1. New state variables after _spct line ──
replace('state vars',
  'var _spct=useState(0),strPct=_spct[0],setStrPct=_spct[1];\n  var _spells=useState(SPELL_DATA),compSpells=_spells[0],setCompSpells=_spells[1];\n  var _memo=useState([]),memorized=_memo[0],setMemorized=_memo[1];\n  var _notes=useState(""),notes=_notes[0],setNotes=_notes[1];',
  'var _spct=useState(0),strPct=_spct[0],setStrPct=_spct[1];\n  var _casts=useState([]),activeCasts=_casts[0],setActiveCasts=_casts[1];\n  var _round=useState(1),combatRound=_round[0],setCombatRound=_round[1];\n  var _spells=useState(SPELL_DATA),compSpells=_spells[0],setCompSpells=_spells[1];\n  var _memo=useState([]),memorized=_memo[0],setMemorized=_memo[1];\n  var _notes=useState(""),notes=_notes[0],setNotes=_notes[1];'
);

// ── 2. SPELL_DURATIONS table after BUFF_SPELLS block ──
replace('SPELL_DURATIONS',
  '// ======== MAIN COMPONENT ========',
  '// Duration in rounds for known buff spells (function of caster level)\nvar SPELL_DURATIONS={\n  "Stone Strength":function(l){return l*10;},   // 1 turn/level\n  "Barkskin":      function(l){return 4+l;},    // 4 rds + 1/level\n  "Oxen Strength": function(l){return l;}       // 1 round/level\n};\n\n// ======== MAIN COMPONENT ========'
);

// ── 3. New functions after memoCount ──
replace('castSpell/dismissCast/nextRound/resetCombat',
  'function memoCount(lv){return memorized.filter(function(m){return m.Level==lv;}).length;}\n\n  // Spell filtering',
  'function memoCount(lv){return memorized.filter(function(m){return m.Level==lv;}).length;}\n  function castSpell(s){\n    var dur=SPELL_DURATIONS[s["Spell Name"]]?SPELL_DURATIONS[s["Spell Name"]](level):null;\n    var cast=Object.assign({},s,{castId:Date.now()+"_"+Math.random(),roundsLeft:dur,totalRounds:dur});\n    setActiveCasts(function(prev){return prev.concat([cast]);});\n    // Expend one copy from memorized\n    var idx=memorized.findIndex(function(m){return m["Spell Name"]===s["Spell Name"]&&m.Level===s.Level;});\n    if(idx>=0) setMemorized(function(prev){return prev.filter(function(_,i){return i!==idx;});});\n  }\n  function dismissCast(castId){\n    setActiveCasts(function(prev){return prev.filter(function(c){return c.castId!==castId;});});\n  }\n  function nextRound(){\n    setCombatRound(function(r){return r+1;});\n    setActiveCasts(function(prev){\n      return prev.map(function(c){\n        if(c.roundsLeft===null||c.roundsLeft===undefined) return c;\n        return Object.assign({},c,{roundsLeft:c.roundsLeft-1});\n      }).filter(function(c){return c.roundsLeft===null||c.roundsLeft===undefined||c.roundsLeft>0;});\n    });\n  }\n  function resetCombat(){\n    setCombatRound(1);\n    setActiveCasts([]);\n  }\n\n  // Spell filtering'
);

// ── 4. Change buff forEach from memorized to activeCasts ──
replace('buff forEach',
  'memorized.forEach(function(m){\n    var sp=BUFF_SPELLS[m["Spell Name"]];\n    if(sp){\n      activeBuffs.push(m["Spell Name"]);\n      if(sp.strBonus)  buffStr+=sp.strBonus;\n      if(sp.strLvlBonus) buffStrLvl+=level; // Oxen Strength: +1 STR per caster level\n      if(sp.acBonus)   buffAC+=sp.acBonus;\n      if(sp.saveBonus) buffSave+=sp.saveBonus;\n    }\n  });',
  'activeCasts.forEach(function(m){\n    var sp=BUFF_SPELLS[m["Spell Name"]];\n    if(sp){\n      activeBuffs.push(m["Spell Name"]);\n      if(sp.strBonus)  buffStr+=sp.strBonus;\n      if(sp.strLvlBonus) buffStrLvl+=level; // Oxen Strength: +1 STR per caster level\n      if(sp.acBonus)   buffAC+=sp.acBonus;\n      if(sp.saveBonus) buffSave+=sp.saveBonus;\n    }\n  });'
);

// ── 5. Reset handler ──
replace('reset handler',
  'setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setStrPct(0);setMemorized([]);setNotes("");',
  'setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setStrPct(0);setMemorized([]);setActiveCasts([]);setCombatRound(1);setNotes("");'
);

// ── 6. Inject new JSX into Spells tab (after toolbar div, before filter bar) ──
// The toolbar div ends with the file input, then immediately the filter div starts
replace('spells tab JSX injection',
  '          <div style={{display:"flex",gap:"8px",marginBottom:"12px",flexWrap:"wrap",alignItems:"center"}}>\n            <input value={spellFilter}',
  '          {/* \u2500\u2500 Round Counter \u2500\u2500 */}\n          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px",padding:"6px 12px",background:"#0e0e1e",border:"1px solid #2a2a4a",borderRadius:"6px"}}>\n            <span style={{fontSize:"11px",color:dim,fontFamily:"monospace"}}>COMBAT ROUND</span>\n            <span style={{fontSize:"18px",color:"#e0c080",fontWeight:"bold",fontFamily:"monospace",minWidth:"32px",textAlign:"center"}}>{combatRound}</span>\n            <button onClick={nextRound} style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",padding:"3px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>\u23ed Next Round</button>\n            <button onClick={resetCombat} style={{background:"#1a1a1a",color:dim,border:"1px solid #333",padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>\u21ba Reset</button>\n          </div>\n\n          {/* \u2500\u2500 Active Casts \u2500\u2500 */}\n          {activeCasts.length>0&&<div style={{marginBottom:"10px",border:"1px solid #2a3a2a",borderRadius:"6px",overflow:"hidden"}}>\n            <div style={{background:"#0d1a0d",padding:"5px 12px",fontSize:"10px",color:"#7db87d",fontFamily:"monospace",letterSpacing:"1px"}}>ACTIVE SPELLS</div>\n            {activeCasts.map(function(c){\n              var pct=c.totalRounds>0?Math.round((c.roundsLeft/c.totalRounds)*100):100;\n              var barColor=pct>60?"#3a7a3a":pct>30?"#7a7a20":"#7a2020";\n              var label=c.roundsLeft===null||c.roundsLeft===undefined?"\u221e ongoing":(c.roundsLeft+" rd"+(c.roundsLeft!==1?"s":"")+" / "+c.totalRounds);\n              return <div key={c.castId} style={{padding:"5px 12px",borderBottom:"1px solid #1a2a1a",display:"flex",alignItems:"center",gap:"8px"}}>\n                <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{c.Level}</span>\n                <span style={{fontSize:"12px",color:"#c9e8c9",flex:1}}>{c["Spell Name"]}</span>\n                {c.totalRounds>0&&<div style={{width:"60px",height:"6px",background:"#0a0a12",borderRadius:"3px",overflow:"hidden"}}>\n                  <div style={{width:Math.max(0,pct)+"%",height:"100%",background:barColor,borderRadius:"3px",transition:"width 0.3s"}} />\n                </div>}\n                <span style={{fontSize:"10px",color:pct>60?"#7db87d":pct>30?"#c0c040":"#c06060",fontFamily:"monospace",minWidth:"70px",textAlign:"right"}}>{label}</span>\n                <button onClick={function(){dismissCast(c.castId);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>\xd7</button>\n              </div>;\n            })}\n          </div>}\n\n          {/* \u2500\u2500 Prepared Spells \u2500\u2500 */}\n          {memorized.length>0&&<div style={{marginBottom:"10px",border:"1px solid #2a2a3a",borderRadius:"6px",overflow:"hidden"}}>\n            <div style={{background:"#0d0d1a",padding:"5px 12px",fontSize:"10px",color:g,fontFamily:"monospace",letterSpacing:"1px",display:"flex",justifyContent:"space-between"}}>\n              <span>PREPARED</span>\n              <span style={{color:dim}}>{memorized.length} spell{memorized.length!==1?"s":""}</span>\n            </div>\n            {memorized.slice().sort(function(a,b){return a.Level-b.Level;}).map(function(s,i){\n              var isBuff=!!BUFF_SPELLS[s["Spell Name"]];\n              var durFn=SPELL_DURATIONS[s["Spell Name"]];\n              var durLabel=durFn?(" \xb7 "+durFn(level)+" rds"):"";\n              return <div key={i} style={{padding:"5px 12px",borderBottom:"1px solid #1e1e2e",display:"flex",alignItems:"center",gap:"8px"}}>\n                <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{s.Level}</span>\n                <span style={{fontSize:"12px",color:g,flex:1}}>{s["Spell Name"]}{isBuff&&<span style={{fontSize:"9px",color:"#80c0e0",marginLeft:"4px"}}>buff{durLabel}</span>}</span>\n                <button onClick={function(){castSpell(s);}} style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>\u26a1 Cast</button>\n                <button onClick={function(){toggleMemo(s);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>\xd7</button>\n              </div>;\n            })}\n          </div>}\n\n          <div style={{display:"flex",gap:"8px",marginBottom:"12px",flexWrap:"wrap",alignItems:"center"}}>\n            <input value={spellFilter}'
);

// ── 7a. Sheet tab: active buffs banner - change memorized.filter to activeCasts.filter ──
replace('sheet tab activeBuffs filter',
  '{memorized.filter(function(m){return BUFF_SPELLS[m["Spell Name"]];}).map(function(m,i){var sp=BUFF_SPELLS[m["Spell Name"]];',
  '{activeCasts.filter(function(m){return BUFF_SPELLS[m["Spell Name"]];}).map(function(m,i){var sp=BUFF_SPELLS[m["Spell Name"]];'
);

// ── 7b. Sheet tab: MEMORIZED SPELLS section replacement ──
replace('sheet tab memorized spells section',
  '{memorized.length>0&&<div style={{marginBottom:"12px"}}>\n            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>MEMORIZED SPELLS</div>\n            {memorized.sort(function(a,b){return a.Level-b.Level;}).map(function(s,i){\n              return <div key={i} style={{color:"#bbb"}}>L{s.Level} \u2014 {s["Spell Name"]}</div>;\n            })}\n          </div>}',
  '{(memorized.length>0||activeCasts.length>0)&&<div style={{marginBottom:"12px"}}>\n            {activeCasts.length>0&&<div style={{marginBottom:"6px"}}>\n              <div style={{color:"#7db87d",fontWeight:"bold",marginBottom:"4px",fontSize:"11px"}}>ACTIVE SPELLS (Round {combatRound})</div>\n              {activeCasts.map(function(c,i){\n                var label=c.roundsLeft===null||c.roundsLeft===undefined?"\u221e":(c.roundsLeft+" rd"+(c.roundsLeft!==1?"s":""));\n                return <div key={i} style={{color:"#9cc89c",fontSize:"11px",marginBottom:"2px"}}>L{c.Level} {c["Spell Name"]} <span style={{color:"#c0c040",fontFamily:"monospace"}}>[{label}]</span></div>;\n              })}\n            </div>}\n            {memorized.length>0&&<div>\n              <div style={{color:g,fontWeight:"bold",marginBottom:"4px",fontSize:"11px"}}>PREPARED SPELLS</div>\n              {memorized.slice().sort(function(a,b){return a.Level-b.Level;}).map(function(s,i){\n                return <div key={i} style={{color:"#bbb",fontSize:"11px"}}>L{s.Level} \u2014 {s["Spell Name"]}</div>;\n              })}\n            </div>}\n          </div>}'
);

if(content===original) throw new Error('No changes were made!');
fs.writeFileSync(filePath,content,'utf8');
console.log('\nAll replacements applied. File written.');
console.log('Size delta:',(content.length-original.length),'chars');
