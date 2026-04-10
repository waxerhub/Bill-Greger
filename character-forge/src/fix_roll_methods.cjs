const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: Add roll helper functions alongside roll4d6 ─────────────────────
const S1_OLD =
  'function roll4d6(){var d=[];for(var i=0;i<4;i++)d.push(Math.floor(Math.random()*6)+1);d.sort(function(a,b){return b-a;});return d[0]+d[1]+d[2];}';
const S1_NEW =
  'function roll4d6(){var d=[];for(var i=0;i<4;i++)d.push(Math.floor(Math.random()*6)+1);d.sort(function(a,b){return b-a;});return d[0]+d[1]+d[2];}\n' +
  'function roll3d6(){var t=0;for(var i=0;i<3;i++)t+=Math.floor(Math.random()*6)+1;return t;}\n' +
  'function roll3d6reroll1(){var t=0;for(var i=0;i<3;i++){var r=Math.floor(Math.random()*6)+1;if(r===1)r=Math.floor(Math.random()*6)+1;t+=r;}return t;}';
if (!src.includes(S1_OLD)) { console.log('ERR step1: roll4d6 not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: added roll helper functions');

// ── Step 2: Replace rollAll + the ABILITY SCORES header row ─────────────────
const S2_OLD =
  '  function rollAll(){var n={};["Str","Dex","Con","Int","Wis","Cha"].forEach(function(a){n[a]=roll4d6();});setStats(n);}';
const S2_NEW =
  '  function rollAll(method){\n' +
  '    var fn=method==="3d6"?roll3d6:method==="3d6r1"?roll3d6reroll1:roll4d6;\n' +
  '    var n={};["Str","Dex","Con","Int","Wis","Cha"].forEach(function(a){n[a]=fn();});setStats(n);\n' +
  '  }';
if (!src.includes(S2_OLD)) { console.log('ERR step2: rollAll not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: updated rollAll');

// ── Step 3: Replace the ABILITY SCORES header + single roll button ───────────
const S3_OLD =
  '          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}><Lbl dim={dim}>ABILITY SCORES</Lbl><button onClick={rollAll} style={{background:"#1a1a28",color:g,border:"1px solid "+brd,padding:"4px 12px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>ROLL 4d6</button></div>';
const S3_NEW =
  '          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",flexWrap:"wrap",gap:"6px"}}>\n' +
  '            <Lbl dim={dim}>ABILITY SCORES</Lbl>\n' +
  '            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>\n' +
  '              <button onClick={function(){rollAll("3d6");}} title="Classic: roll 3 dice, take sum"\n' +
  '                style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,padding:"4px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>3d6</button>\n' +
  '              <button onClick={function(){rollAll("3d6r1");}} title="Roll 3d6, reroll any 1s once"\n' +
  '                style={{background:"#1a1a28",color:"#a0c0e0",border:"1px solid #3a5a7a",padding:"4px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>3d6 reroll 1s</button>\n' +
  '              <button onClick={function(){rollAll("4d6");}} title="Roll 4 dice, drop the lowest"\n' +
  '                style={{background:"#1a2a1a",color:g,border:"1px solid "+brd,padding:"4px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>4d6 drop lowest</button>\n' +
  '            </div>\n' +
  '          </div>';
if (!src.includes(S3_OLD)) { console.log('ERR step3: ABILITY SCORES header not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: updated ABILITY SCORES header with 3 roll buttons');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
