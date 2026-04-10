const fs=require('fs');
let src=fs.readFileSync('SpellEngine.jsx','utf8');
let ok=0;

// 1. Update BUFF_SPELLS: Oxen Strength is level-based, Stone Strength stays flat +2
const S1_OLD=
'var BUFF_SPELLS={\n' +
'  "Stone Strength":{level:1,strBonus:2,desc:"+2 STR — muscles harden like stone"},\n' +
'  "Barkskin":{level:2,acBonus:2,saveBonus:1,desc:"AC improves by 2 (skin becomes as tough as bark). Saving throws vs all attack forms except magic +1."},\n' +
'  "Oxen Strength":{level:3,strBonus:6,desc:"+6 STR — strength of an ox"}\n' +
'};';
const S1_NEW=
'var BUFF_SPELLS={\n' +
'  "Stone Strength":{level:1,strBonus:2,desc:"+2 STR (muscles harden like stone)"},\n' +
'  "Barkskin":{level:2,acBonus:2,saveBonus:1,desc:"AC +2 (bark-tough skin). Saves vs all attack forms except magic +1."},\n' +
'  "Oxen Strength":{level:3,strLvlBonus:true,desc:"+1 STR/level (max 18/00). Each 10% exceptional = 1 point. Unarmored AC 8."}\n' +
'};';
if(!src.includes(S1_OLD)){console.log('ERR step1 BUFF_SPELLS not found');process.exit(1);}
src=src.replace(S1_OLD,S1_NEW); ok++;
console.log('Step 1 done: updated BUFF_SPELLS');

// 2. Replace the entire buff computation block with level-aware version
const S2_OLD=
'  // Active spell buffs\n' +
'  var buffStr=0,buffAC=0,buffSave=0,activeBuffs=[];\n' +
'  memorized.forEach(function(m){\n' +
'    var sp=BUFF_SPELLS[m["Spell Name"]];\n' +
'    if(sp){activeBuffs.push(m["Spell Name"]);if(sp.strBonus)buffStr+=sp.strBonus;if(sp.acBonus)buffAC+=sp.acBonus;if(sp.saveBonus)buffSave+=sp.saveBonus;}\n' +
'  });\n' +
'  var effStr=adjStats.Str+buffStr;\n' +
'  var effStrB=strBonus(effStr);\n' +
'  var effAC=ac-buffAC;';

const S2_NEW=
'  // Active spell buffs\n' +
'  var buffStr=0,buffStrLvl=0,buffAC=0,buffSave=0,activeBuffs=[];\n' +
'  memorized.forEach(function(m){\n' +
'    var sp=BUFF_SPELLS[m["Spell Name"]];\n' +
'    if(sp){\n' +
'      activeBuffs.push(m["Spell Name"]);\n' +
'      if(sp.strBonus)  buffStr+=sp.strBonus;\n' +
'      if(sp.strLvlBonus) buffStrLvl+=level; // Oxen Strength: +1 STR per caster level\n' +
'      if(sp.acBonus)   buffAC+=sp.acBonus;\n' +
'      if(sp.saveBonus) buffSave+=sp.saveBonus;\n' +
'    }\n' +
'  });\n' +
'  // Compute effective STR & exceptional percentile from buffs\n' +
'  var rawEffStr=adjStats.Str+buffStr+buffStrLvl;\n' +
'  var effStr, effStrPct;\n' +
'  if(rawEffStr<=18){\n' +
'    effStr=rawEffStr;\n' +
'    // Keep character\'s own exceptional % if still at 18\n' +
'    effStrPct=(exStr&&rawEffStr===18)?strPct:0;\n' +
'  } else {\n' +
'    effStr=18;\n' +
'    // Points above 18 → 10% per point on the exceptional chart, cap 100\n' +
'    var overflowPct=Math.min(100,(rawEffStr-18)*10);\n' +
'    effStrPct=exStr?Math.min(100,strPct+overflowPct):overflowPct;\n' +
'  }\n' +
'  var effStrB=effStrPct>0?strExBonus(effStrPct):strBonus(effStr);\n' +
'  var effAC=ac-buffAC;';

if(!src.includes(S2_OLD)){
  console.log('ERR step2 buff block not found');
  const i=src.indexOf('Active spell buffs');
  if(i>=0) console.log(JSON.stringify(src.substring(i-10,i+400)));
  process.exit(1);
}
src=src.replace(S2_OLD,S2_NEW); ok++;
console.log('Step 2 done: buff computation updated for level-based STR');

// 3. Update the spell effects banner on the Sheet tab to show the actual effective STR
// Find where activeBuffs are displayed to include the exceptional pct info
// Look for the banner that shows active buff descriptions
const S3_OLD='var sp=BUFF_SPELLS[m["Spell Name"]];return <div key={i} style';
if(!src.includes(S3_OLD)){console.log('WARN step3 not found, skipping');}
else{
  // Update the banner to show exceptional STR when Oxen is active
  // (no change needed in banner text since BUFF_SPELLS desc already updated)
  console.log('Step 3: banner uses BUFF_SPELLS desc, already updated via step 1');
  ok++;
}

// 4. Update Sheet tab combat rows to show exceptional notation for spell buffs
// "Str Hit (ex)" label should also trigger for buffStrLvl
const S4_OLD='              <Row l="THAC0" v={thac0} l2={buffStr>0?"Str Hit*":"Str Hit"} v2={(effStrB.hit>=0?"+":"")+effStrB.hit} />';
const S4_NEW='              <Row l="THAC0" v={thac0} l2={(buffStr>0||buffStrLvl>0)?("Str Hit*"+(effStrPct>0?" (ex)":"")):"Str Hit"} v2={(effStrB.hit>=0?"+":"")+effStrB.hit} />';
if(!src.includes(S4_OLD)){console.log('WARN step4 not found, skipping');}
else{ src=src.replace(S4_OLD,S4_NEW); ok++; console.log('Step 4 done'); }

const S5_OLD='              <Row l="HP" v={hp} l2={buffStr>0?"Dmg Adj*":"Dmg Adj"} v2={(effStrB.dmg>=0?"+":"")+effStrB.dmg} />';
const S5_NEW='              <Row l="HP" v={hp} l2={(buffStr>0||buffStrLvl>0)?("Dmg Adj*"+(effStrPct>0?" (ex)":"")):"Dmg Adj"} v2={(effStrB.dmg>=0?"+":"")+effStrB.dmg} />';
if(!src.includes(S5_OLD)){console.log('WARN step5 not found, skipping');}
else{ src=src.replace(S5_OLD,S5_NEW); ok++; console.log('Step 5 done'); }

// 5. Update the STR display on sheet tab to show exceptional % when buff is active
// Find: var buff=a==="Str"?buff  (used in sheet tab stat display)
const S6_OLD='var fin=stats[a]+adj;var buff=a==="Str"?buff';
const i6=src.indexOf(S6_OLD);
if(i6<0){console.log('WARN step6 not found, skipping');}
else{
  // find the line end to see the full expression
  const lineEnd=src.indexOf('\n',i6);
  console.log('Step 6 context: '+src.substring(i6,lineEnd).substring(0,140));
  // No change needed here as the effStrPct/effStrB are the correct values to display
  ok++;
}

// 6. Pass buffStrLvl to exportPDF
const S7_OLD='      stats, adjStats, thac0, saves, ac, strB, conB, strPct, exStr,';
const S7_NEW='      stats, adjStats, thac0, saves, ac, strB, conB, strPct, exStr, effStrB, effStrPct,';
if(!src.includes(S7_OLD)){console.log('WARN step7 not found, skipping');}
else{ src=src.replace(S7_OLD,S7_NEW); ok++; console.log('Step 7 done'); }

fs.writeFileSync('SpellEngine.jsx',src,'utf8');
console.log('All done! Steps ok: '+ok);
