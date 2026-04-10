const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: Update DiceRollerModal — add assignments + swap + dropdown labels ──
const S1_OLD =
  'function DiceRollerModal({method,allRolls,onApply,onReroll,onClose}){\n' +
  '  var _ph=useState("idle"),phase=_ph[0],setPhase=_ph[1];\n' +
  '  useEffect(function(){\n' +
  '    var t1=setTimeout(function(){setPhase("rolling");},60);\n' +
  '    var t2=setTimeout(function(){setPhase("settled");},1600);\n' +
  '    return function(){clearTimeout(t1);clearTimeout(t2);};\n' +
  '  },[]);\n' +
  '  var g="#c9a84c",surf="#111118",brd="#1e1e2e",dim="#666050",txt="#ccc8b8";\n' +
  '  var sNames=["Str","Dex","Con","Int","Wis","Cha"];\n' +
  '  var mLabel={"3d6":"3d6 Straight","3d6r1":"3d6 Reroll 1s","4d6":"4d6 Drop Lowest"}[method]||method;\n' +
  '  var settled=phase==="settled";';
const S1_NEW =
  'function DiceRollerModal({method,allRolls,onApply,onReroll,onClose}){\n' +
  '  var _ph=useState("idle"),phase=_ph[0],setPhase=_ph[1];\n' +
  '  var _asn=useState(["Str","Dex","Con","Int","Wis","Cha"]),assignments=_asn[0],setAssignments=_asn[1];\n' +
  '  useEffect(function(){\n' +
  '    var t1=setTimeout(function(){setPhase("rolling");},60);\n' +
  '    var t2=setTimeout(function(){setPhase("settled");},1600);\n' +
  '    return function(){clearTimeout(t1);clearTimeout(t2);};\n' +
  '  },[]);\n' +
  '  function swapAssign(idx,newStat){\n' +
  '    setAssignments(function(prev){\n' +
  '      var next=prev.slice();\n' +
  '      var oldStat=next[idx];\n' +
  '      if(oldStat===newStat)return prev;\n' +
  '      var otherIdx=next.indexOf(newStat);\n' +
  '      next[idx]=newStat;\n' +
  '      if(otherIdx>=0)next[otherIdx]=oldStat;\n' +
  '      return next;\n' +
  '    });\n' +
  '  }\n' +
  '  var g="#c9a84c",surf="#111118",brd="#1e1e2e",dim="#666050",txt="#ccc8b8";\n' +
  '  var sNames=["Str","Dex","Con","Int","Wis","Cha"];\n' +
  '  var mLabel={"3d6":"3d6 Straight","3d6r1":"3d6 Reroll 1s","4d6":"4d6 Drop Lowest"}[method]||method;\n' +
  '  var settled=phase==="settled";';
if (!src.includes(S1_OLD)) { console.log('ERR step1: modal header not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: assignment state + swap helper added');

// ── Step 2: Replace row labels with assignment dropdowns ─────────────────────
const S2_OLD =
  '        {sNames.map(function(stat,si){\n' +
  '          var rolls=allRolls[si]||[];\n' +
  '          var isDrop=method==="4d6";\n' +
  '          var minV=isDrop?Math.min.apply(null,rolls):null;\n' +
  '          var minI=isDrop?rolls.indexOf(minV):-1;\n' +
  '          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);\n' +
  '          var dBase=si*100;\n' +
  '          return <div key={stat} style={{background:"#0a0a12",border:"1px solid "+brd,\n' +
  '            borderRadius:"8px",padding:"10px"}}>\n' +
  '            <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",\n' +
  '              letterSpacing:"1px",marginBottom:"8px"}}>{stat}</div>';
const S2_NEW =
  '        {allRolls.map(function(rolls,si){\n' +
  '          var isDrop=method==="4d6";\n' +
  '          var minV=isDrop?Math.min.apply(null,rolls):null;\n' +
  '          var minI=isDrop?rolls.indexOf(minV):-1;\n' +
  '          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);\n' +
  '          var dBase=si*100;\n' +
  '          var assigned=assignments[si]||sNames[si];\n' +
  '          return <div key={si} style={{background:"#0a0a12",border:"1px solid "+brd,\n' +
  '            borderRadius:"8px",padding:"10px"}}>\n' +
  '            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",gap:"6px"}}>\n' +
  '              <div style={{fontSize:"9px",color:dim,fontFamily:"monospace",letterSpacing:"1px"}}>ROLL {si+1}</div>\n' +
  '              <select value={assigned} onChange={function(e){swapAssign(si,e.target.value);}}\n' +
  '                disabled={!settled}\n' +
  '                style={{background:"#0a0a12",border:"1px solid "+brd,color:settled?g:dim,\n' +
  '                  fontFamily:"monospace",fontSize:"11px",fontWeight:"bold",letterSpacing:"1px",\n' +
  '                  padding:"3px 6px",borderRadius:"4px",outline:"none",cursor:settled?"pointer":"default",\n' +
  '                  textTransform:"uppercase"}}>\n' +
  '                {sNames.map(function(s){return <option key={s} value={s}>{s}</option>;})}\n' +
  '              </select>\n' +
  '            </div>';
if (!src.includes(S2_OLD)) { console.log('ERR step2: row label block not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: row labels replaced with dropdowns');

// ── Step 3: Update bottom summary bar to show assignment-based totals ────────
const S3_OLD =
  '      {settled&&<div style={{marginTop:"12px",padding:"8px 12px",background:"#0a0a12",\n' +
  '        border:"1px solid "+brd,borderRadius:"6px",\n' +
  '        display:"flex",gap:"16px",flexWrap:"wrap",justifyContent:"center"}}>\n' +
  '        {sNames.map(function(stat,si){\n' +
  '          var rolls=allRolls[si]||[];\n' +
  '          var isDrop=method==="4d6";\n' +
  '          var minI=isDrop?rolls.indexOf(Math.min.apply(null,rolls)):-1;\n' +
  '          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);\n' +
  '          return <div key={stat} style={{textAlign:"center",minWidth:"40px"}}>\n' +
  '            <div style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>{stat}</div>\n' +
  '            <div style={{fontSize:"18px",fontWeight:"bold",color:g,fontFamily:"Georgia,serif"}}>{total}</div>\n' +
  '          </div>;\n' +
  '        })}\n' +
  '      </div>}';
const S3_NEW =
  '      {settled&&<div style={{marginTop:"12px",padding:"8px 12px",background:"#0a0a12",\n' +
  '        border:"1px solid "+brd,borderRadius:"6px",\n' +
  '        display:"flex",gap:"16px",flexWrap:"wrap",justifyContent:"center"}}>\n' +
  '        {sNames.map(function(stat){\n' +
  '          var si=assignments.indexOf(stat);\n' +
  '          var rolls=si>=0?(allRolls[si]||[]):[];\n' +
  '          var isDrop=method==="4d6";\n' +
  '          var minI=isDrop?rolls.indexOf(Math.min.apply(null,rolls)):-1;\n' +
  '          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);\n' +
  '          return <div key={stat} style={{textAlign:"center",minWidth:"40px"}}>\n' +
  '            <div style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>{stat}</div>\n' +
  '            <div style={{fontSize:"18px",fontWeight:"bold",color:g,fontFamily:"Georgia,serif"}}>{total}</div>\n' +
  '          </div>;\n' +
  '        })}\n' +
  '      </div>}';
if (!src.includes(S3_OLD)) { console.log('ERR step3: summary bar not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: summary bar uses assignments');

// ── Step 4: Pass assignments to onApply ──────────────────────────────────────
const S4_OLD =
  '        <button onClick={onApply} disabled={!settled}';
const S4_NEW =
  '        <button onClick={function(){onApply(assignments);}} disabled={!settled}';
if (!src.includes(S4_OLD)) { console.log('ERR step4: apply button not found'); process.exit(1); }
src = src.replace(S4_OLD, S4_NEW); ok++;
console.log('Step 4 done: onApply receives assignments');

// ── Step 5: Update applyRollResults in parent to use assignments ─────────────
const S5_OLD =
  '  function applyRollResults(){\n' +
  '    var n={};\n' +
  '    ["Str","Dex","Con","Int","Wis","Cha"].forEach(function(stat,si){\n' +
  '      var rolls=rollResults[si]||[];\n' +
  '      if(rollModalMethod==="4d6"){\n' +
  '        var minV=Math.min.apply(null,rolls);\n' +
  '        var minI=rolls.indexOf(minV);\n' +
  '        n[stat]=rolls.reduce(function(s,v,i){return s+(i===minI?0:v);},0);\n' +
  '      } else {\n' +
  '        n[stat]=rolls.reduce(function(s,v){return s+v;},0);\n' +
  '      }\n' +
  '    });\n' +
  '    setStats(n);\n' +
  '    setRollModalOpen(false);\n' +
  '    setIsRolling(false);\n' +
  '  }';
const S5_NEW =
  '  function applyRollResults(assignments){\n' +
  '    var asn=assignments||["Str","Dex","Con","Int","Wis","Cha"];\n' +
  '    var n={};\n' +
  '    rollResults.forEach(function(rolls,si){\n' +
  '      var stat=asn[si];\n' +
  '      if(!stat)return;\n' +
  '      var total;\n' +
  '      if(rollModalMethod==="4d6"){\n' +
  '        var minV=Math.min.apply(null,rolls);\n' +
  '        var minI=rolls.indexOf(minV);\n' +
  '        total=rolls.reduce(function(s,v,i){return s+(i===minI?0:v);},0);\n' +
  '      } else {\n' +
  '        total=rolls.reduce(function(s,v){return s+v;},0);\n' +
  '      }\n' +
  '      n[stat]=total;\n' +
  '    });\n' +
  '    setStats(n);\n' +
  '    setRollModalOpen(false);\n' +
  '    setIsRolling(false);\n' +
  '  }';
if (!src.includes(S5_OLD)) { console.log('ERR step5: applyRollResults not found'); process.exit(1); }
src = src.replace(S5_OLD, S5_NEW); ok++;
console.log('Step 5 done: applyRollResults uses assignments');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
