const fs=require('fs');
let src=fs.readFileSync('SpellEngine.jsx','utf8');
let ok=0;

// 1. Add strPct state after the stats useState line
const S1_OLD='  var _stats=useState({Str:10,Dex:10,Con:10,Int:10,Wis:16,Cha:15}),stats=_stats[0],setStats=_stats[1];';
const S1_NEW='  var _stats=useState({Str:10,Dex:10,Con:10,Int:10,Wis:16,Cha:15}),stats=_stats[0],setStats=_stats[1];\n  var _spct=useState(0),strPct=_spct[0],setStrPct=_spct[1];';
if(!src.includes(S1_OLD)){console.log('ERR step1');process.exit(1);}
src=src.replace(S1_OLD,S1_NEW); ok++;
console.log('Step 1 done');

// 2. Add setStrPct(0) to reset handler
const S2_OLD='    setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setMemorized([]);setNotes("");';
const S2_NEW='    setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setStrPct(0);setMemorized([]);setNotes("");';
if(!src.includes(S2_OLD)){console.log('ERR step2');process.exit(1);}
src=src.replace(S2_OLD,S2_NEW); ok++;
console.log('Step 2 done');

// 3. Apply exceptional STR in stat derivation
const S3_OLD='  var strB=strBonus(adjStats.Str);';
const S3_NEW=
'  var isWarrior=classData.group==="Warrior";\n' +
'  var exStr=isWarrior&&adjStats.Str===18&&strPct>0;\n' +
'  var strB=exStr?strExBonus(strPct):strBonus(adjStats.Str);';
if(!src.includes(S3_OLD)){console.log('ERR step3');process.exit(1);}
src=src.replace(S3_OLD,S3_NEW); ok++;
console.log('Step 3 done');

// 4. Replace the stat input block to add percentile field under STR when Warrior+18
const S4_OLD=
'return <div key={a} style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"10px",textAlign:"center"}}>\n' +
'                <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",marginBottom:"4px"}}>{a.toUpperCase()}</div>\n' +
'                <input type="number" value={stats[a]} onChange={function(e){setStat(a,e.target.value);}} min="3" max="18" style={{width:"50px",textAlign:"center",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:g,fontSize:"20px",fontWeight:"bold",fontFamily:"Georgia,serif",outline:"none",padding:"4px"}} />\n' +
'                {adj!==0&&<div style={{fontSize:"10px",color:adj>0?"#7a7":"#a77",fontFamily:"monospace",marginTop:"2px"}}>{adj>0?"+":""}{adj} = {stats[a]+adj}</div>}\n' +
'              </div>;';

const S4_NEW=
'var showPct=a==="Str"&&classData.group==="Warrior"&&(stats[a]+(raceData.adj[a]||0))===18;\n' +
'              return <div key={a} style={{background:surf,border:"1px solid "+(showPct?"#e0c080":brd),borderRadius:"6px",padding:"10px",textAlign:"center"}}>\n' +
'                <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",marginBottom:"4px"}}>{a.toUpperCase()}</div>\n' +
'                <input type="number" value={stats[a]} onChange={function(e){setStat(a,e.target.value);}} min="3" max="18" style={{width:"50px",textAlign:"center",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:g,fontSize:"20px",fontWeight:"bold",fontFamily:"Georgia,serif",outline:"none",padding:"4px"}} />\n' +
'                {adj!==0&&<div style={{fontSize:"10px",color:adj>0?"#7a7":"#a77",fontFamily:"monospace",marginTop:"2px"}}>{adj>0?"+":""}{adj} = {stats[a]+adj}</div>}\n' +
'                {showPct&&<div style={{marginTop:"4px",borderTop:"1px solid #554400",paddingTop:"4px"}}>\n' +
'                  <div style={{fontSize:"9px",color:"#e0c080",marginBottom:"2px"}}>EXCEPTIONAL %</div>\n' +
'                  <input type="number" value={strPct||""} placeholder="1-100" onChange={function(e){var v=parseInt(e.target.value)||0;setStrPct(Math.min(100,Math.max(0,v)));}} min="1" max="100" style={{width:"50px",textAlign:"center",background:"#0a0a12",border:"1px solid #e0c080",borderRadius:"4px",color:"#e0c080",fontSize:"14px",fontWeight:"bold",fontFamily:"monospace",outline:"none",padding:"2px"}} />\n' +
'                  {strPct>0&&<div style={{fontSize:"8px",color:"#e0c080",marginTop:"2px"}}>{strPct===100?"18/00":"18/"+String(strPct).padStart(2,"0")}</div>}\n' +
'                </div>}\n' +
'              </div>;';

if(!src.includes(S4_OLD)){
  console.log('ERR step4: block not found');
  // Debug
  const i=src.indexOf('setStat(a,e.target.value)');
  console.log(JSON.stringify(src.substring(i-100,i+50)));
  process.exit(1);
}
src=src.replace(S4_OLD,S4_NEW); ok++;
console.log('Step 4 done');

// 5. Update COMBAT tab SB boxes
const S5_OLD='            <SB label="THAC0" value={thac0} color="#e0c080" sub={"Str: "+(strB.hit>=0?"+":"")+strB.hit} />';
const S5_NEW='            <SB label="THAC0" value={thac0} color="#e0c080" sub={(exStr?"18/"+(strPct===100?"00":String(strPct).padStart(2,"0"))+" ":"")+("Hit: "+(strB.hit>=0?"+":"")+strB.hit)} />';
if(!src.includes(S5_OLD)){console.log('WARN step5 not found, skipping');}
else{ src=src.replace(S5_OLD,S5_NEW); ok++; console.log('Step 5 done'); }

const S6_OLD='            <SB label="DMG ADJ" value={(strB.dmg>=0?"+":"")+strB.dmg} color="#e0a080" sub={"Str "+adjStats.Str} />';
const S6_NEW='            <SB label="DMG ADJ" value={(strB.dmg>=0?"+":"")+strB.dmg} color="#e0a080" sub={exStr?"18/"+(strPct===100?"00":String(strPct).padStart(2,"0")):"Str "+adjStats.Str} />';
if(!src.includes(S6_OLD)){console.log('WARN step6 not found, skipping');}
else{ src=src.replace(S6_OLD,S6_NEW); ok++; console.log('Step 6 done'); }

// 6. Sheet tab COMBAT row — show ex notation
const S7_OLD='              <Row l="THAC0" v={thac0} l2={exStr?(buffStr>0?"Str Hit* (ex)":"Str Hit (ex)"):(buffStr>0?"Str Hit*":"Str Hit")} v2={(effStrB.hit>=0?"+":"")+effStrB.hit} />';
if(!src.includes(S7_OLD)){
  // Try original
  const S7_OLD2='              <Row l="THAC0" v={thac0} l2={buffStr>0?"Str Hit*":"Str Hit"} v2={(effStrB.hit>=0?"+":"")+effStrB.hit} />';
  if(src.includes(S7_OLD2)){
    src=src.replace(S7_OLD2,'              <Row l="THAC0" v={thac0} l2={buffStr>0?"Str Hit*":"Str Hit"} v2={(effStrB.hit>=0?"+":"")+effStrB.hit} />');
    console.log('Step 7 unchanged (already correct)'); ok++;
  } else { console.log('WARN step7 not found'); }
} else { console.log('Step 7 already done'); ok++; }

// 7. Pass strPct to exportPDF
const S8_OLD='      stats, adjStats, thac0, saves, ac, strB, conB,';
const S8_NEW='      stats, adjStats, thac0, saves, ac, strB, conB, strPct, exStr,';
if(!src.includes(S8_OLD)){console.log('WARN step8 not found, skipping');}
else{ src=src.replace(S8_OLD,S8_NEW); ok++; console.log('Step 8 done'); }

fs.writeFileSync('SpellEngine.jsx',src,'utf8');
console.log('All done. Steps ok: '+ok);
