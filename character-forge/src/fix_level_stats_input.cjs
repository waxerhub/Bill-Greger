const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// ── Step 1: Fix setStat — stop clamping on every keystroke ──────────────────
const S1_OLD =
  '  function setStat(a,v){var n=Object.assign({},stats);n[a]=Math.max(1,Math.min(25,parseInt(v)||1));setStats(n);}';
const S1_NEW =
  '  function setStat(a,v){var n=Object.assign({},stats);var p=parseInt(v);n[a]=isNaN(p)?0:p;setStats(n);}\n' +
  '  function clampStat(a){setStats(function(prev){var n=Object.assign({},prev);n[a]=Math.max(3,Math.min(25,n[a]||3));return n;});}';
if (!src.includes(S1_OLD)) { console.log('ERR step1: setStat not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: fixed setStat');

// ── Step 2: Replace LEVEL card ───────────────────────────────────────────────
const S2_OLD =
  '<Card brd={brd} surf={surf}><Lbl dim={dim}>LEVEL</Lbl><input type="number" value={level} onChange={function(e){setLevel(Math.max(1,Math.min(20,parseInt(e.target.value)||1)));}} style={Object.assign({},is(brd,txt),{width:"60px"})} /></Card>';
const S2_NEW =
  '<Card brd={brd} surf={surf}><Lbl dim={dim}>LEVEL</Lbl>\n' +
  '  <div style={{display:"flex",alignItems:"center",gap:"4px"}}>\n' +
  '    <button onClick={function(){setLevel(function(p){return Math.max(1,p-1);});}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>−</button>\n' +
  '    <input type="text" inputMode="numeric" value={level===0?"":String(level)}\n' +
  '      onChange={function(e){\n' +
  '        var v=e.target.value;\n' +
  '        if(v===""){setLevel(0);return;}\n' +
  '        var n=parseInt(v);\n' +
  '        if(!isNaN(n))setLevel(n);\n' +
  '      }}\n' +
  '      onBlur={function(){setLevel(function(p){return Math.max(1,Math.min(20,p||1));});}}\n' +
  '      style={Object.assign({},is(brd,txt),{width:"44px",textAlign:"center"})} />\n' +
  '    <button onClick={function(){setLevel(function(p){return Math.min(20,p+1);});}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>+</button>\n' +
  '  </div>\n' +
  '  <div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>1–20</div>\n' +
  '</Card>';
if (!src.includes(S2_OLD)) { console.log('ERR step2: LEVEL card not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: updated LEVEL card');

// ── Step 3: Replace stat grid input + add +/- buttons per stat ───────────────
// Replace just the inner input line and add micro buttons below it
const S3_OLD =
  '                <input type="number" value={stats[a]} onChange={function(e){setStat(a,e.target.value);}} min="3" max="25" style={{width:"50px",textAlign:"center",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:g,fontSize:"20px",fontWeight:"bold",fontFamily:"Georgia,serif",outline:"none",padding:"4px"}} />';
const S3_NEW =
  '                <input type="text" inputMode="numeric" value={stats[a]===0?"":String(stats[a])}\n' +
  '                  onChange={function(e){setStat(a,e.target.value);}}\n' +
  '                  onBlur={function(){clampStat(a);}}\n' +
  '                  style={{width:"50px",textAlign:"center",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:g,fontSize:"20px",fontWeight:"bold",fontFamily:"Georgia,serif",outline:"none",padding:"4px"}} />\n' +
  '                <div style={{display:"flex",justifyContent:"center",gap:"4px",marginTop:"4px"}}>\n' +
  '                  <button onClick={function(){setStat(a,Math.max(3,stats[a]-1));}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"3px",width:"20px",height:"20px",cursor:"pointer",fontSize:"13px",lineHeight:"1",padding:"0"}}>−</button>\n' +
  '                  <button onClick={function(){setStat(a,Math.min(25,stats[a]+1));}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"3px",width:"20px",height:"20px",cursor:"pointer",fontSize:"13px",lineHeight:"1",padding:"0"}}>+</button>\n' +
  '                </div>';
if (!src.includes(S3_OLD)) { console.log('ERR step3: stat input not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: updated stat inputs');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
