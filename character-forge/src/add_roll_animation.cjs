const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: Add _rolling state after _expandedSpell ─────────────────────────
const S1_OLD =
  '  var _expandedSpell=useState(null),expandedSpell=_expandedSpell[0],setExpandedSpell=_expandedSpell[1];';
const S1_NEW =
  '  var _expandedSpell=useState(null),expandedSpell=_expandedSpell[0],setExpandedSpell=_expandedSpell[1];\n' +
  '  var _rolling=useState(false),isRolling=_rolling[0],setIsRolling=_rolling[1];\n' +
  '  var _rollAnim=useState(0),rollAnimKey=_rollAnim[0],setRollAnimKey=_rollAnim[1];';
if (!src.includes(S1_OLD)) { console.log('ERR step1: expandedSpell not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: added rolling state');

// ── Step 2: Update rollAll to trigger animation, delay stat update ───────────
const S2_OLD =
  '  function rollAll(method){\n' +
  '    var fn=method==="3d6"?roll3d6:method==="3d6r1"?roll3d6reroll1:roll4d6;\n' +
  '    var n={};["Str","Dex","Con","Int","Wis","Cha"].forEach(function(a){n[a]=fn();});setStats(n);\n' +
  '  }';
const S2_NEW =
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
if (!src.includes(S2_OLD)) { console.log('ERR step2: rollAll not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: updated rollAll with animation trigger');

// ── Step 3: Inject keyframe style tag + overlay div at top of return ────────
const S3_OLD =
  '  return (\n' +
  '    <div style={{minHeight:"100vh",background:bg,color:txt,fontFamily:"Georgia,serif",display:"flex",flexDirection:"column"}}>';
const S3_NEW =
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
if (!src.includes(S3_OLD)) { console.log('ERR step3: return div not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: injected animation styles and overlay');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
