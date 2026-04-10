const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: Active Spells rows ────────────────────────────────────────────────
const A_OLD =
  '              return <div key={c.castId} style={{padding:"5px 12px",borderBottom:"1px solid #1a2a1a",display:"flex",alignItems:"center",gap:"8px"}}>\n' +
  '                <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{c.Level}</span>\n' +
  '                <span style={{fontSize:"12px",color:"#c9e8c9",flex:1}}>{c["Spell Name"]}</span>\n' +
  '                {c.totalRounds>0&&<div style={{width:"60px",height:"6px",background:"#0a0a12",borderRadius:"3px",overflow:"hidden"}}>\n' +
  '                  <div style={{width:Math.max(0,pct)+"%",height:"100%",background:barColor,borderRadius:"3px",transition:"width 0.3s"}} />\n' +
  '                </div>}\n' +
  '                <span style={{fontSize:"10px",color:pct>60?"#7db87d":pct>30?"#c0c040":"#c06060",fontFamily:"monospace",minWidth:"70px",textAlign:"right"}}>{label}</span>\n' +
  '                <button onClick={function(){dismissCast(c.castId);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>×</button>\n' +
  '              </div>;';

const A_NEW =
  '              var aName=c["Spell Name"];var aOpen=expandedSpell===aName;\n' +
  '              return <div key={c.castId} style={{borderBottom:"1px solid #1a2a1a",background:aOpen?"#0a120a":"transparent"}}>\n' +
  '                <div style={{padding:"5px 12px",display:"flex",alignItems:"center",gap:"8px"}}>\n' +
  '                  <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{c.Level}</span>\n' +
  '                  <span style={{fontSize:"12px",color:"#c9e8c9",flex:1}}>{aName}</span>\n' +
  '                  {c.totalRounds>0&&<div style={{width:"60px",height:"6px",background:"#0a0a12",borderRadius:"3px",overflow:"hidden"}}>\n' +
  '                    <div style={{width:Math.max(0,pct)+"%",height:"100%",background:barColor,borderRadius:"3px",transition:"width 0.3s"}} />\n' +
  '                  </div>}\n' +
  '                  <span style={{fontSize:"10px",color:pct>60?"#7db87d":pct>30?"#c0c040":"#c06060",fontFamily:"monospace",minWidth:"70px",textAlign:"right"}}>{label}</span>\n' +
  '                  <button onClick={function(){toggleSpellDesc(c);}} title="Show description" style={{background:"transparent",border:"none",color:aOpen?g:dim,cursor:"pointer",fontSize:"12px",padding:"0 4px",lineHeight:1}}>{aOpen?"\u25bc":"\u25b6"}</button>\n' +
  '                  <button onClick={function(){dismissCast(c.castId);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>\xd7</button>\n' +
  '                </div>\n' +
  '                {aOpen&&<div style={{padding:"4px 14px 8px 44px",fontSize:"11px",color:"#b8b4a8",lineHeight:"1.6",fontStyle:"italic"}}>\n' +
  '                  {spellDescLoading[aName]&&<span style={{color:dim,fontFamily:"monospace"}}>\u2026 loading</span>}\n' +
  '                  {!spellDescLoading[aName]&&spellDescs[aName]&&<span>{spellDescs[aName]}</span>}\n' +
  '                  {!spellDescLoading[aName]&&!spellDescs[aName]&&<span style={{color:dim,fontFamily:"monospace"}}>fetching\u2026</span>}\n' +
  '                </div>}\n' +
  '              </div>;';

if (!src.includes(A_OLD)) { console.log('ERR step1 active cast row not found'); process.exit(1); }
src = src.replace(A_OLD, A_NEW); ok++;
console.log('Step 1 done: active spells rows updated');

// ── Step 2: Prepared Spells rows ──────────────────────────────────────────────
const P_OLD =
  '              return <div key={i} style={{padding:"5px 12px",borderBottom:"1px solid "+(isCasting?"#2a3a1e":"#1e1e2e"),display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap",background:isCasting?"#0d1a0d":"transparent"}}>\n' +
  '                <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{s.Level}</span>\n' +
  '                <span style={{fontSize:"12px",color:g,flex:1}}>{s["Spell Name"]}{isBuff&&<span style={{fontSize:"9px",color:"#80c0e0",marginLeft:"4px"}}>buff{durLabel}</span>}</span>\n' +
  '                {isCasting\n' +
  '                  ?<div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"wrap"}}>\n' +
  '                    <button onClick={function(){castInstant(s);}} title="Resolve immediately, expend slot" style={{background:"#1a1a2a",color:"#c0a060",border:"1px solid #3a3a20",padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>\u26a1 Instant</button>\n' +
  '                    <span style={{color:dim,fontSize:"10px"}}>or</span>\n' +
  '                    <input type="number" min="1" value={castingSpell.rounds||""} placeholder="rds" onChange={function(e){setCastingSpell(function(p){return Object.assign({},p,{rounds:parseInt(e.target.value)||0});});}} style={{width:"38px",background:"#0a0a12",border:"1px solid #2a4a2a",borderRadius:"3px",color:"#7db87d",fontSize:"11px",textAlign:"center",padding:"2px 4px",fontFamily:"monospace"}} />\n' +
  '                    <button onClick={function(){castDuration(s,castingSpell.rounds);}} disabled={!castingSpell.rounds} title="Track duration" style={{background:castingSpell.rounds?"#1a2a1a":"#111",color:castingSpell.rounds?"#7db87d":"#444",border:"1px solid "+(castingSpell.rounds?"#2a4a2a":"#222"),padding:"2px 8px",borderRadius:"3px",cursor:castingSpell.rounds?"pointer":"not-allowed",fontSize:"11px",fontFamily:"monospace"}}>\u23f1 Track</button>\n' +
  '                    <button onClick={function(){setCastingSpell(null);}} style={{background:"transparent",color:dim,border:"none",cursor:"pointer",fontSize:"12px",padding:"0 2px"}}>\u2715</button>\n' +
  '                  </div>\n' +
  '                  :<button onClick={function(){initCast(s);}} style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>\u26a1 Cast</button>}\n' +
  '                {!isCasting&&<button onClick={function(){removeFromMemo(s.prepId);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>\xd7</button>}\n' +
  '              </div>;';

const P_NEW =
  '              var pName=s["Spell Name"];var pOpen=expandedSpell===pName;\n' +
  '              return <div key={i} style={{borderBottom:"1px solid "+(isCasting?"#2a3a1e":"#1e1e2e"),background:isCasting?"#0d1a0d":pOpen?"#0e0e1c":"transparent"}}>\n' +
  '                <div style={{padding:"5px 12px",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>\n' +
  '                  <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{s.Level}</span>\n' +
  '                  <span style={{fontSize:"12px",color:g,flex:1}}>{pName}{isBuff&&<span style={{fontSize:"9px",color:"#80c0e0",marginLeft:"4px"}}>buff{durLabel}</span>}</span>\n' +
  '                  {isCasting\n' +
  '                    ?<div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"wrap"}}>\n' +
  '                      <button onClick={function(){castInstant(s);}} title="Resolve immediately, expend slot" style={{background:"#1a1a2a",color:"#c0a060",border:"1px solid #3a3a20",padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>\u26a1 Instant</button>\n' +
  '                      <span style={{color:dim,fontSize:"10px"}}>or</span>\n' +
  '                      <input type="number" min="1" value={castingSpell.rounds||""} placeholder="rds" onChange={function(e){setCastingSpell(function(p){return Object.assign({},p,{rounds:parseInt(e.target.value)||0});});}} style={{width:"38px",background:"#0a0a12",border:"1px solid #2a4a2a",borderRadius:"3px",color:"#7db87d",fontSize:"11px",textAlign:"center",padding:"2px 4px",fontFamily:"monospace"}} />\n' +
  '                      <button onClick={function(){castDuration(s,castingSpell.rounds);}} disabled={!castingSpell.rounds} title="Track duration" style={{background:castingSpell.rounds?"#1a2a1a":"#111",color:castingSpell.rounds?"#7db87d":"#444",border:"1px solid "+(castingSpell.rounds?"#2a4a2a":"#222"),padding:"2px 8px",borderRadius:"3px",cursor:castingSpell.rounds?"pointer":"not-allowed",fontSize:"11px",fontFamily:"monospace"}}>\u23f1 Track</button>\n' +
  '                      <button onClick={function(){setCastingSpell(null);}} style={{background:"transparent",color:dim,border:"none",cursor:"pointer",fontSize:"12px",padding:"0 2px"}}>\u2715</button>\n' +
  '                    </div>\n' +
  '                    :<button onClick={function(){initCast(s);}} style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>\u26a1 Cast</button>}\n' +
  '                  <button onClick={function(){toggleSpellDesc(s);}} title="Show description" style={{background:"transparent",border:"none",color:pOpen?g:dim,cursor:"pointer",fontSize:"12px",padding:"0 4px",lineHeight:1}}>{pOpen?"\u25bc":"\u25b6"}</button>\n' +
  '                  {!isCasting&&<button onClick={function(){removeFromMemo(s.prepId);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>\xd7</button>}\n' +
  '                </div>\n' +
  '                {pOpen&&<div style={{padding:"4px 14px 8px 44px",fontSize:"11px",color:"#b8b4a8",lineHeight:"1.6",fontStyle:"italic"}}>\n' +
  '                  {spellDescLoading[pName]&&<span style={{color:dim,fontFamily:"monospace"}}>\u2026 loading</span>}\n' +
  '                  {!spellDescLoading[pName]&&spellDescs[pName]&&<span>{spellDescs[pName]}</span>}\n' +
  '                  {!spellDescLoading[pName]&&!spellDescs[pName]&&<span style={{color:dim,fontFamily:"monospace"}}>fetching\u2026</span>}\n' +
  '                </div>}\n' +
  '              </div>;';

if (!src.includes(P_OLD)) { console.log('ERR step2 prepared spell row not found'); process.exit(1); }
src = src.replace(P_OLD, P_NEW); ok++;
console.log('Step 2 done: prepared spells rows updated');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
