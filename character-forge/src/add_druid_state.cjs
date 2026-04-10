const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');
let ok = 0;

// Step 1: Add new state vars after _kit useState line
const S1_OLD = '  var _kit=useState(""),kit=_kit[0],setKit=_kit[1];';
const S1_NEW =
  '  var _kit=useState(""),kit=_kit[0],setKit=_kit[1];\n' +
  '  var _branch=useState("Forest"),druidBranch=_branch[0],setDruidBranch=_branch[1];\n' +
  '  var _dmOverride=useState(false),dmOverride=_dmOverride[0],setDmOverride=_dmOverride[1];\n' +
  '  var _totem=useState(""),totemAnimal=_totem[0],setTotemAnimal=_totem[1];\n' +
  '  var _shapeUses=useState(0),shapeUsesLeft=_shapeUses[0],setShapeUsesLeft=_shapeUses[1];\n' +
  '  var _shapeFailed=useState(0),shapeFailed=_shapeFailed[0],setShapeFailed=_shapeFailed[1];';
if (!src.includes(S1_OLD)) { console.log('ERR step1: kit state not found'); process.exit(1); }
src = src.replace(S1_OLD, S1_NEW); ok++;
console.log('Step 1 done: added druid state vars');

// Step 2: Add derived vars after thac0 line
const S2_OLD = '  var thac0=getThac0(classData.thac0,level);';
const S2_NEW =
  '  var thac0=getThac0(classData.thac0,level);\n' +
  '  var isDruid=cls==="Druid";\n' +
  '  var kitData=isDruid?(DRUID_KITS[kit]||DRUID_KITS["None"]):null;\n' +
  '  var branchData=isDruid?(DRUID_BRANCHES[druidBranch]||DRUID_BRANCHES["Forest"]):null;\n' +
  '  var maxShapeUses=isDruid?(Math.floor(level/3)+1):0;\n' +
  '  var shapeshifterMaxUses=(kitData&&kitData.shapeshifter)?maxShapeUses*2:maxShapeUses;\n' +
  '  var kitReqFails=(kitData&&kitData.req)?Object.keys(kitData.req).filter(function(s){return adjStats[s]<kitData.req[s];}):[];\n' +
  '  var kitBlocked=kitReqFails.length>0&&!dmOverride;\n' +
  '  var totemForm=(isDruid&&kitData&&kitData.totemRequired&&totemAnimal)?BEAST_FORMS[totemAnimal]:null;';
if (!src.includes(S2_OLD)) { console.log('ERR step2: thac0 line not found'); process.exit(1); }
src = src.replace(S2_OLD, S2_NEW); ok++;
console.log('Step 2 done: added druid derived vars');

// Step 3: Update changeClass to reset druid state
const S3_OLD =
  '  function changeClass(newCls) {\n' +
  '    setCls(newCls);\n' +
  '    var cd=CLASSES[newCls]||{};\n' +
  '    setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);\n' +
  '    if(cd.group==="Priest")setCpBudget(120);\n' +
  '    else if(cd.group==="Wizard")setCpBudget(40);\n' +
  '    else setCpBudget(0);\n' +
  '  }';
const S3_NEW =
  '  function changeClass(newCls) {\n' +
  '    setCls(newCls);\n' +
  '    var cd=CLASSES[newCls]||{};\n' +
  '    setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);\n' +
  '    if(cd.group==="Priest")setCpBudget(120);\n' +
  '    else if(cd.group==="Wizard")setCpBudget(40);\n' +
  '    else setCpBudget(0);\n' +
  '    if(newCls!=="Druid"){setKit("");setDruidBranch("Forest");setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);setDmOverride(false);}\n' +
  '  }';
if (!src.includes(S3_OLD)) { console.log('ERR step3: changeClass not found'); process.exit(1); }
src = src.replace(S3_OLD, S3_NEW); ok++;
console.log('Step 3 done: updated changeClass');

// Step 4: Update resetCharacter to reset druid state
const S4_OLD =
  '    setCharName("");setRace("Human");setCls("Druid");setKit("");setLevel(1);setHP(8);setAlign("True Neutral");\n' +
  '    setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setStrPct(0);setMemorized([]);setActiveCasts([]);setCombatRound(1);setCastingSpell(null);setNotes("");\n' +
  '    setCpBudget(120);setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);';
const S4_NEW =
  '    setCharName("");setRace("Human");setCls("Druid");setKit("");setLevel(1);setHP(8);setAlign("True Neutral");\n' +
  '    setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setStrPct(0);setMemorized([]);setActiveCasts([]);setCombatRound(1);setCastingSpell(null);setNotes("");\n' +
  '    setCpBudget(120);setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);\n' +
  '    setDruidBranch("Forest");setDmOverride(false);setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);';
if (!src.includes(S4_OLD)) { console.log('ERR step4: resetCharacter body not found'); process.exit(1); }
src = src.replace(S4_OLD, S4_NEW); ok++;
console.log('Step 4 done: updated resetCharacter');

fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('All done! Steps ok: ' + ok);
