const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: Add modal state vars after _rollAnim line ───────────────────────
const S1_OLD =
  '  var _rollAnim=useState(0),rollAnimKey=_rollAnim[0],setRollAnimKey=_rollAnim[1];';
const S1_NEW =
  '  var _rollAnim=useState(0),rollAnimKey=_rollAnim[0],setRollAnimKey=_rollAnim[1];\n' +
  '  var _rollResults=useState([]),rollResults=_rollResults[0],setRollResults=_rollResults[1];\n' +
  '  var _rollModalOpen=useState(false),rollModalOpen=_rollModalOpen[0],setRollModalOpen=_rollModalOpen[1];\n' +
  '  var _rollModalMethod=useState("4d6"),rollModalMethod=_rollModalMethod[0],setRollModalMethod=_rollModalMethod[1];\n' +
  '  var _rollKey=useState(0),rollKey=_rollKey[0],setRollKey=_rollKey[1];';
if (!src.includes(S1_OLD)) { console.log('ERR step1: _rollAnim line not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: modal state vars added');

// ── Step 2: Replace rollAll with new version + applyRollResults + rerollDice ─
const S2_OLD =
  '  function rollAll(method){\n' +
  '    if(isRolling)return;\n' +
  '    setIsRolling(true);\n' +
  '    setRollAnimKey(function(k){return k+1;});\n' +
  '    var fn=method==="3d6"?roll3d6:method==="3d6r1"?roll3d6reroll1:roll4d6;\n' +
  '    setTimeout(function(){\n' +
  '      var n={};["Str","Dex","Con","Int","Wis","Cha"].forEach(function(a){n[a]=fn();});setStats(n);\n' +
  '      setIsRolling(false);\n' +
  '    },700);\n' +
  '  }';
const S2_NEW =
  '  function genAllRolls(method){\n' +
  '    var numDice=method==="4d6"?4:3;\n' +
  '    return ["Str","Dex","Con","Int","Wis","Cha"].map(function(){\n' +
  '      var r=[];\n' +
  '      for(var i=0;i<numDice;i++){\n' +
  '        var v=Math.floor(Math.random()*6)+1;\n' +
  '        if(method==="3d6r1"&&v===1) v=Math.floor(Math.random()*6)+1;\n' +
  '        r.push(v);\n' +
  '      }\n' +
  '      return r;\n' +
  '    });\n' +
  '  }\n' +
  '  function rollAll(method){\n' +
  '    if(isRolling)return;\n' +
  '    setIsRolling(true);\n' +
  '    setRollModalMethod(method);\n' +
  '    setRollResults(genAllRolls(method));\n' +
  '    setRollKey(function(k){return k+1;});\n' +
  '    setRollModalOpen(true);\n' +
  '  }\n' +
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
  '  }\n' +
  '  function rerollDice(){\n' +
  '    setRollResults(genAllRolls(rollModalMethod));\n' +
  '    setRollKey(function(k){return k+1;});\n' +
  '  }';
if (!src.includes(S2_OLD)) { console.log('ERR step2: rollAll not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: rollAll replaced');

// ── Step 3: Replace old rollDieStyle + emoji overlay with DiceRollerModal ────
const S3_OLD =
  '  var rollDieStyle={\n' +
  '    position:"fixed",top:"42%",fontSize:"52px",zIndex:9999,\n' +
  '    pointerEvents:"none",userSelect:"none",\n' +
  '    animation:"rollDieAcross 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards"\n' +
  '  };\n' +
  '  return (\n' +
  '    <div style={{minHeight:"100vh",background:bg,color:txt,fontFamily:"Georgia,serif",display:"flex",flexDirection:"column"}}>\n' +
  '      <style>{`\n' +
  '        @keyframes rollDieAcross {\n' +
  '          0%   { left: -70px;              transform: rotate(0deg)   scale(1);   opacity:1; }\n' +
  '          15%  { left: 10vw;               transform: rotate(120deg) scale(1.15);opacity:1; }\n' +
  '          40%  { left: 35vw;               transform: rotate(280deg) scale(1.2); opacity:1; }\n' +
  '          65%  { left: 60vw;               transform: rotate(480deg) scale(1.15);opacity:1; }\n' +
  '          85%  { left: 85vw;               transform: rotate(640deg) scale(1);   opacity:1; }\n' +
  '          100% { left: calc(100vw + 70px); transform: rotate(720deg) scale(0.8); opacity:0; }\n' +
  '        }\n' +
  '      `}</style>\n' +
  '      {isRolling&&<div key={rollAnimKey} style={rollDieStyle}>🎲</div>}';
const S3_NEW =
  '  return (\n' +
  '    <div style={{minHeight:"100vh",background:bg,color:txt,fontFamily:"Georgia,serif",display:"flex",flexDirection:"column"}}>\n' +
  '      {rollModalOpen&&<DiceRollerModal\n' +
  '        key={rollKey}\n' +
  '        method={rollModalMethod}\n' +
  '        allRolls={rollResults}\n' +
  '        onApply={applyRollResults}\n' +
  '        onReroll={rerollDice}\n' +
  '        onClose={function(){setRollModalOpen(false);setIsRolling(false);}}\n' +
  '      />}';
if (!src.includes(S3_OLD)) { console.log('ERR step3: rollDieStyle block not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: modal render injected, old animation removed');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
