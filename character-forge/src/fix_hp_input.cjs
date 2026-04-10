const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');

const OLD =
  '<Card brd={brd} surf={surf}><Lbl dim={dim}>HIT POINTS</Lbl><input type="number" value={hp} onChange={function(e){setHP(parseInt(e.target.value)||1);}} style={Object.assign({},is(brd,txt),{width:"60px"})} /><div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>Con: {conB>=0?"+":""}{conB}/die</div></Card>';

// Roll level d{hd} + conB per die, minimum 1 total
const NEW =
  '<Card brd={brd} surf={surf}><Lbl dim={dim}>HIT POINTS</Lbl>\n' +
  '  <div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"wrap"}}>\n' +
  '    <input type="text" inputMode="numeric" value={hp===0?"":String(hp)}\n' +
  '      onChange={function(e){\n' +
  '        var v=e.target.value;\n' +
  '        if(v===""){ setHP(0); return; }\n' +
  '        var n=parseInt(v);\n' +
  '        if(!isNaN(n))setHP(n);\n' +
  '      }}\n' +
  '      onBlur={function(){if(hp<1)setHP(1);}}\n' +
  '      style={Object.assign({},is(brd,txt),{width:"64px",textAlign:"center"})} />\n' +
  '    <button onClick={function(){setHP(function(p){return Math.max(1,p-1);});}} title="−1"\n' +
  '      style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>−</button>\n' +
  '    <button onClick={function(){setHP(function(p){return p+1;});}} title="+1"\n' +
  '      style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>+</button>\n' +
  '    <button onClick={function(){\n' +
  '      var hd=classData.hd||6;\n' +
  '      var total=0;\n' +
  '      for(var i=0;i<level;i++){total+=Math.floor(Math.random()*hd)+1+conB;}\n' +
  '      setHP(Math.max(level,total));\n' +
  '    }} title={"Roll "+level+"d"+classData.hd+(conB!==0?"+"+(conB*level):"")}\n' +
  '      style={{background:"#1a2a1a",color:"#7a7",border:"1px solid #3a5a3a",borderRadius:"4px",padding:"2px 6px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace",whiteSpace:"nowrap"}}>\n' +
  '      ROLL {level}d{classData.hd}{conB!==0&&(conB>0?"+":"")+conB+"/die"}\n' +
  '    </button>\n' +
  '  </div>\n' +
  '  <div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>Con: {conB>=0?"+":""}{conB}/die | d{classData.hd} HD</div>\n' +
  '</Card>';

if (!src.includes(OLD)) { console.log('ERR: HP card not found'); process.exit(1); }
src = src.replace(OLD, NEW);
fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('Done: HP input updated.');
