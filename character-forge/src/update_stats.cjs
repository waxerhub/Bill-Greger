const fs=require('fs');
let src=fs.readFileSync('SpellEngine.jsx','utf8');

const OLD=
'function wisBonus(w){\n' +
'  // PHB Wisdom Table II: Bonus spells for Clerics (cumulative)\n' +
'  // WIS 13: +1 L1 | WIS 14: +2 L1 | WIS 15: +2 L1 +1 L2 | WIS 16: +2 L1 +2 L2\n' +
'  // WIS 17: +2 L1 +2 L2 +1 L3 | WIS 18: +2 L1 +2 L2 +1 L3 +1 L4\n' +
'  if(w<=12)return[];\n' +
'  if(w===13)return[1];\n' +
'  if(w===14)return[2];      // Was [1,1] \u2014 PHB says cumulative 2 bonus L1 spells\n' +
'  if(w===15)return[2,1];\n' +
'  if(w===16)return[2,2];\n' +
'  if(w===17)return[2,2,1];\n' +
'  if(w===18)return[2,2,1,1];\n' +
'  return[3,2,1,1];\n' +
'}\n' +
'function strBonus(s){if(s<=3)return{hit:-3,dmg:-1};if(s<=5)return{hit:-2,dmg:-1};if(s<=7)return{hit:-1,dmg:0};if(s<=15)return{hit:0,dmg:0};if(s===16)return{hit:0,dmg:1};if(s===17)return{hit:1,dmg:1};if(s===18)return{hit:1,dmg:2};return{hit:3,dmg:6};}\n' +
'function dexAC(d){\n' +
'  // PHB Dexterity Table I: Defensive Adjustment\n' +
'  if(d===3)return 4;if(d===4)return 3;if(d===5)return 2;if(d===6)return 1;\n' +
'  if(d<=14)return 0;  // 7\u201314: no adjustment\n' +
'  if(d===15)return -1;if(d===16)return -2;if(d===17)return -3;if(d===18)return -4;\n' +
'  return -4;  // 18+ treated as 18\n' +
'}\n' +
'function conHP(c,g){\n' +
'  // PHB Constitution Table: HP Adjustment per die\n' +
'  // CON 3 = -2, CON 4-6 = -1, CON 7-14 = 0, 15 = +1, 16 = +2\n' +
'  // CON 17 = +2 (+3 Warriors), CON 18 = +2 (+4 Warriors)\n' +
'  var w=g==="Warrior";\n' +
'  if(c===3)return -2;\n' +
'  if(c<=6)return -1;\n' +
'  if(c<=14)return 0;\n' +
'  if(c===15)return 1;if(c===16)return 2;\n' +
'  if(c===17)return w?3:2;if(c===18)return w?4:2;\n' +
'  return w?5:2;\n' +
'}';

const NEW=
'// PHB Table 5: WISDOM — Bonus Spells (cumulative total by WIS score)\n' +
'// Each WIS row adds the listed level slot(s) cumulatively from the row above\n' +
'function wisBonus(w){\n' +
'  if(w<=12)return[];\n' +
'  if(w===13)return[1];           // +1 first\n' +
'  if(w===14)return[2];           // +1 first again\n' +
'  if(w===15)return[2,1];         // +1 second\n' +
'  if(w===16)return[2,2];         // +1 second again\n' +
'  if(w===17)return[2,2,1];       // +1 third\n' +
'  if(w===18)return[2,2,1,1];     // +1 fourth\n' +
'  if(w===19)return[3,2,1,2];     // +1 first, +1 fourth\n' +
'  if(w===20)return[3,3,1,3];     // +1 second, +1 fourth\n' +
'  if(w===21)return[3,3,2,3,1];   // +1 third, +1 fifth\n' +
'  if(w===22)return[3,3,2,4,2];   // +1 fourth, +1 fifth\n' +
'  if(w===23)return[3,3,2,4,4];   // +2 fifth\n' +
'  if(w===24)return[3,3,2,4,4,2]; // +2 sixth\n' +
'  return[3,3,2,4,4,3,1];         // WIS 25: +1 sixth, +1 seventh\n' +
'}\n' +
'// PHB Table 5: WISDOM — Magical Defense Adjustment (saving throws vs magic)\n' +
'function wisDefense(w){\n' +
'  if(w===1)return -6;\n' +
'  if(w===2)return -4;\n' +
'  if(w===3)return -3;\n' +
'  if(w===4)return -2;\n' +
'  if(w<=7)return -1;\n' +
'  if(w<=14)return 0;\n' +
'  if(w===15)return 1;\n' +
'  if(w===16)return 2;\n' +
'  if(w===17)return 3;\n' +
'  return 4; // 18+\n' +
'}\n' +
'// PHB Table 1: STRENGTH — Hit Probability and Damage Adjustment\n' +
'function strBonus(s){\n' +
'  if(s===1)return{hit:-5,dmg:-4};\n' +
'  if(s===2)return{hit:-3,dmg:-2};\n' +
'  if(s===3)return{hit:-3,dmg:-1};\n' +
'  if(s<=5)return{hit:-2,dmg:-1};\n' +
'  if(s<=7)return{hit:-1,dmg:0};\n' +
'  if(s<=15)return{hit:0,dmg:0};\n' +
'  if(s===16)return{hit:0,dmg:1};\n' +
'  if(s===17)return{hit:1,dmg:1};\n' +
'  if(s===18)return{hit:1,dmg:2};\n' +
'  if(s===19)return{hit:3,dmg:7};\n' +
'  if(s===20)return{hit:3,dmg:8};\n' +
'  if(s===21)return{hit:4,dmg:9};\n' +
'  if(s===22)return{hit:4,dmg:10};\n' +
'  if(s===23)return{hit:5,dmg:11};\n' +
'  if(s===24)return{hit:6,dmg:12};\n' +
'  return{hit:7,dmg:14}; // 25\n' +
'}\n' +
'// PHB Table 1: STRENGTH — Exceptional STR for Warriors (18/xx)\n' +
'// Pass percentile 1-100, where 100 = 18/00\n' +
'function strExBonus(pct){\n' +
'  if(pct<=50)return{hit:1,dmg:3};\n' +
'  if(pct<=75)return{hit:2,dmg:3};\n' +
'  if(pct<=90)return{hit:2,dmg:4};\n' +
'  if(pct<=99)return{hit:2,dmg:5};\n' +
'  return{hit:3,dmg:6}; // 18/00\n' +
'}\n' +
'// PHB Table 2: DEXTERITY — Defensive Adjustment (positive = worse AC)\n' +
'function dexAC(d){\n' +
'  if(d<=1)return 4;\n' +
'  if(d===2)return 3;\n' +
'  if(d===3)return 3;\n' +
'  if(d===4)return 2;\n' +
'  if(d===5)return 1;\n' +
'  if(d<=14)return 0;\n' +
'  if(d===15)return -1;if(d===16)return -2;if(d===17)return -3;if(d===18)return -4;\n' +
'  if(d<=20)return -4;\n' +
'  if(d<=23)return -5;\n' +
'  return -6; // 24-25\n' +
'}\n' +
'// PHB Table 2: DEXTERITY — Missile Attack Adjustment\n' +
'function dexMissile(d){\n' +
'  if(d<=1)return -3;\n' +
'  if(d===2)return -2;\n' +
'  if(d<=5)return -1;\n' +
'  if(d<=15)return 0;\n' +
'  if(d===16)return 1;\n' +
'  if(d<=18)return 2;\n' +
'  if(d<=20)return 3;\n' +
'  return 4; // 21+\n' +
'}\n' +
'// PHB Table 3: CONSTITUTION — HP Adjustment per Hit Die\n' +
'// Warriors get parenthetical bonus; all other classes max at +2\n' +
'function conHP(c,g){\n' +
'  var w=g==="Warrior";\n' +
'  if(c===1)return -3;\n' +
'  if(c<=3)return -2;\n' +
'  if(c<=6)return -1;\n' +
'  if(c<=14)return 0;\n' +
'  if(c===15)return 1;\n' +
'  if(c===16)return 2;\n' +
'  if(c===17)return w?3:2;\n' +
'  if(c===18)return w?4:2;\n' +
'  if(c===19)return w?5:2;\n' +
'  if(c===20)return w?5:2;\n' +
'  if(c<=23)return w?6:2;\n' +
'  return w?7:2; // 24-25\n' +
'}\n' +
'// PHB Table 4: INTELLIGENCE — Spell-learning info for Wizards\n' +
'function intInfo(i){\n' +
'  if(i<=1)return{lang:0,spellLvl:0,learnPct:0,maxSpells:0};\n' +
'  if(i<=8)return{lang:1,spellLvl:0,learnPct:0,maxSpells:0};\n' +
'  if(i===9) return{lang:2,spellLvl:4,learnPct:35,maxSpells:6};\n' +
'  if(i===10)return{lang:2,spellLvl:5,learnPct:40,maxSpells:7};\n' +
'  if(i===11)return{lang:2,spellLvl:5,learnPct:45,maxSpells:7};\n' +
'  if(i===12)return{lang:3,spellLvl:6,learnPct:50,maxSpells:7};\n' +
'  if(i===13)return{lang:3,spellLvl:6,learnPct:55,maxSpells:9};\n' +
'  if(i===14)return{lang:4,spellLvl:7,learnPct:60,maxSpells:9};\n' +
'  if(i===15)return{lang:4,spellLvl:7,learnPct:65,maxSpells:11};\n' +
'  if(i===16)return{lang:5,spellLvl:8,learnPct:70,maxSpells:11};\n' +
'  if(i===17)return{lang:6,spellLvl:8,learnPct:75,maxSpells:14};\n' +
'  if(i===18)return{lang:7,spellLvl:9,learnPct:85,maxSpells:18};\n' +
'  if(i===19)return{lang:8,spellLvl:9,learnPct:95,maxSpells:"All"};\n' +
'  if(i===20)return{lang:9,spellLvl:9,learnPct:96,maxSpells:"All"};\n' +
'  if(i===21)return{lang:10,spellLvl:9,learnPct:97,maxSpells:"All"};\n' +
'  if(i===22)return{lang:11,spellLvl:9,learnPct:98,maxSpells:"All"};\n' +
'  if(i===23)return{lang:12,spellLvl:9,learnPct:99,maxSpells:"All"};\n' +
'  if(i===24)return{lang:15,spellLvl:9,learnPct:100,maxSpells:"All"};\n' +
'  return{lang:20,spellLvl:9,learnPct:100,maxSpells:"All"}; // 25\n' +
'}';

if(!src.includes(OLD)){
  console.log('ERROR: old string not found - aborting');
  process.exit(1);
}
src=src.replace(OLD,NEW);
fs.writeFileSync('SpellEngine.jsx',src,'utf8');
console.log('SpellEngine.jsx updated successfully.');
