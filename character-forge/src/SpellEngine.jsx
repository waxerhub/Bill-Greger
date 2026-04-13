import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { exportCharacterSheet } from "./exportPDF.js";
import { streamSpellSearch, extractSpellNames, generateCharacter, suggestSpellsForCharacter, parsePDFCharacter, generateMagicItem } from "./claudeAI.js";
import { supabase, saveCharacter as supabaseSave, loadCharacterById, listMyCharacters, signIn, signUp, signOut, onAuthStateChange, saveGearToLibrary, listGearLibrary, deleteGearFromLibrary, getDmPasswordHash, setDmPasswordHash } from "./supabase.js";

// ======== CORE 2E TABLES ========
var RACES={"Human":{adj:{},classes:["Fighter","Ranger","Paladin","Cleric","Druid","Mage","Thief","Bard"]},"Elf":{adj:{Dex:1,Con:-1},classes:["Fighter","Ranger","Cleric","Mage","Thief"]},"Half-Elf":{adj:{},classes:["Fighter","Ranger","Cleric","Druid","Mage","Thief","Bard"]},"Dwarf":{adj:{Con:1,Cha:-1},classes:["Fighter","Cleric","Thief"]},"Gnome":{adj:{Int:1,Wis:-1},classes:["Fighter","Cleric","Thief","Illusionist"]},"Halfling":{adj:{Dex:1,Str:-1},classes:["Fighter","Cleric","Thief"]},"Half-Orc":{adj:{Str:1,Con:1,Int:-1,Cha:-2},classes:["Fighter","Cleric","Thief"]}};
var CLASSES={"Fighter":{hd:10,prime:"Str",thac0:"war",saves:"war",spells:null,group:"Warrior"},"Ranger":{hd:10,prime:"Str",thac0:"war",saves:"war",spells:"ranger",group:"Warrior"},"Paladin":{hd:10,prime:"Str",thac0:"war",saves:"war",spells:"paladin",group:"Warrior"},"Cleric":{hd:8,prime:"Wis",thac0:"pri",saves:"pri",spells:"priest",group:"Priest"},"Druid":{hd:8,prime:"Wis",thac0:"pri",saves:"pri",spells:"priest",group:"Priest"},"Mage":{hd:4,prime:"Int",thac0:"wiz",saves:"wiz",spells:"wizard",group:"Wizard"},"Illusionist":{hd:4,prime:"Int",thac0:"wiz",saves:"wiz",spells:"wizard",group:"Wizard"},"Thief":{hd:6,prime:"Dex",thac0:"rog",saves:"rog",spells:null,group:"Rogue"},"Bard":{hd:6,prime:"Dex",thac0:"rog",saves:"rog",spells:"bard",group:"Rogue"}};
// PHB XP tables — index 0 = XP needed to reach level 1 (always 0), index 19 = level 20
var XP_TABLE={
  Fighter:    [0,2000,4000,8000,16000,32000,64000,125000,250000,500000,750000,1000000,1250000,1500000,1750000,2000000,2250000,2500000,2750000,3000000],
  Ranger:     [0,2250,4500,9000,18000,36000,75000,150000,300000,600000,900000,1200000,1500000,1800000,2100000,2400000,2700000,3000000,3300000,3600000],
  Paladin:    [0,2750,5500,12000,24000,45000,95000,175000,350000,700000,1050000,1400000,1750000,2100000,2450000,2800000,3150000,3500000,3850000,4200000],
  Cleric:     [0,1500,3000,6000,13000,27500,55000,110000,225000,450000,675000,900000,1125000,1350000,1575000,1800000,2025000,2250000,2475000,2700000],
  Druid:      [0,2000,4000,7500,12500,20000,35000,60000,90000,125000,200000,300000,750000,1500000,3000000,3600000,4200000,4800000,5400000,6000000],
  Mage:       [0,2500,5000,10000,20000,40000,70000,110000,160000,220000,440000,660000,880000,1100000,1320000,1540000,1760000,1980000,2200000,2420000],
  Illusionist:[0,2250,4500,9000,18000,36000,62000,95000,145000,200000,400000,600000,800000,1000000,1200000,1400000,1600000,1800000,2000000,2200000],
  Thief:      [0,1250,2500,5000,10000,20000,40000,70000,110000,160000,220000,440000,660000,880000,1100000,1320000,1540000,1760000,1980000,2200000],
  Bard:       [0,1500,3000,6000,13000,27500,55000,110000,200000,400000,600000,800000,1000000,1200000,1400000,1600000,1800000,2000000,2200000,2400000],
};
function xpForLevel(cls,lvl){var t=XP_TABLE[cls];return t?t[Math.max(0,Math.min(19,lvl-1))]||0:0;}
function xpToNextLevel(cls,lvl){if(lvl>=20)return null;var t=XP_TABLE[cls];return t?t[Math.min(19,lvl)]:null;}
function fmt(n){return n>=1000000?(n/1000000).toFixed(2).replace(/\.?0+$/,"")+"M":n>=1000?Math.round(n/100)/10+"k":String(n);}
function getThac0(t,l){
  // PHB tables: Warriors improve 1/level (THAC0 20 at L1)
  // Priests improve 2 every 3 levels (20 at L1-3, 18 at L4-6, 16 at L7-9...)
  // Wizards improve 1 every 3 levels (20 at L1-3, 19 at L4-6, 18 at L7-9...)
  // Rogues improve 1 every 2 levels (20 at L1-2, 19 at L3-4...)
  if(t==="war")return Math.max(1,21-l);
  if(t==="pri")return Math.max(1,20-2*Math.floor((l-1)/3));
  if(t==="wiz")return Math.max(1,20-Math.floor((l-1)/3));
  if(t==="rog")return Math.max(1,20-Math.floor((l-1)/2));
  return 20;
}
var SAVES={war:function(l){var t=l<=2?0:l<=4?1:l<=6?2:l<=8?3:l<=10?4:l<=12?5:l<=14?6:l<=16?7:8;return{Para:14-t,Rod:16-t,Pet:15-t,Breath:17-t,Spell:17-t};},pri:function(l){var t=l<=3?0:l<=6?1:l<=9?2:l<=12?3:l<=15?4:l<=18?5:6;return{Para:10-t,Rod:14-t,Pet:13-t,Breath:16-t,Spell:15-t};},wiz:function(l){var t=l<=5?0:l<=10?1:l<=15?2:3;return{Para:14-t,Rod:11-t,Pet:13-t,Breath:15-t,Spell:12-t};},rog:function(l){var t=l<=4?0:l<=8?1:l<=12?2:l<=16?3:4;return{Para:13-t,Rod:14-t,Pet:12-t,Breath:16-t,Spell:15-t};}};
var PRIEST_SLOTS=[null,[1],[2],[2,1],[3,2],[3,3,1],[3,3,2],[3,3,2,1],[3,3,3,2],[4,4,3,2,1],[4,4,3,3,2],[5,4,4,3,2,1],[6,5,5,3,2,2],[6,6,6,4,2,2],[6,6,6,5,3,2,1]];
var WIZARD_SLOTS=[null,[1],[2],[2,1],[3,2],[4,2,1],[4,2,2],[4,3,2,1],[4,3,3,2],[4,3,3,2,1],[4,4,3,2,2],[4,4,4,3,3],[4,4,4,4,4,1],[5,5,5,4,4,2],[5,5,5,4,4,2,1]];
// PHB Table 5: WISDOM — Bonus Spells (cumulative total by WIS score)
// Each WIS row adds the listed level slot(s) cumulatively from the row above
function wisBonus(w){
  if(w<=12)return[];
  if(w===13)return[1];           // +1 first
  if(w===14)return[2];           // +1 first again
  if(w===15)return[2,1];         // +1 second
  if(w===16)return[2,2];         // +1 second again
  if(w===17)return[2,2,1];       // +1 third
  if(w===18)return[2,2,1,1];     // +1 fourth
  if(w===19)return[3,2,1,2];     // +1 first, +1 fourth
  if(w===20)return[3,3,1,3];     // +1 second, +1 fourth
  if(w===21)return[3,3,2,3,1];   // +1 third, +1 fifth
  if(w===22)return[3,3,2,4,2];   // +1 fourth, +1 fifth
  if(w===23)return[3,3,2,4,4];   // +2 fifth
  if(w===24)return[3,3,2,4,4,2]; // +2 sixth
  return[3,3,2,4,4,3,1];         // WIS 25: +1 sixth, +1 seventh
}
// PHB Table 5: WISDOM — Magical Defense Adjustment (saving throws vs magic)
function wisDefense(w){
  if(w===1)return -6;
  if(w===2)return -4;
  if(w===3)return -3;
  if(w===4)return -2;
  if(w<=7)return -1;
  if(w<=14)return 0;
  if(w===15)return 1;
  if(w===16)return 2;
  if(w===17)return 3;
  return 4; // 18+
}
// PHB Table 5: WISDOM — Spell Immunities for WIS 19+ (cumulative)
function wisImmunity(w){
  var s=[];
  if(w>=19) s=s.concat(["Cause Fear","Charm Person","Command","Friends","Hypnotism"]);
  if(w>=20) s=s.concat(["Fear","Forget","Hold Person","Ray of Enfeeblement","Scare"]);
  if(w>=21) s=s.concat(["Charm Monster","Confusion","Emotion","Fumble","Suggestion"]);
  if(w>=23) s=s.concat(["Chaos","Feeblemind","Hold Monster","Magic Jar","Quest"]);
  if(w>=24) s=s.concat(["Geas","Mass Suggestion","Rod of Rulership"]);
  if(w>=25) s=s.concat(["Antipathy/Sympathy","Death Spell","Mass Charm"]);
  return s;
}
// PHB Table 5: WISDOM — Spell Failure % for priests (1=80%, drops to 0% at WIS 13+)
function wisFailure(w){
  if(w===1)return 80;if(w===2)return 60;if(w===3)return 50;if(w===4)return 45;
  if(w===5)return 40;if(w===6)return 35;if(w===7)return 30;if(w===8)return 25;
  if(w===9)return 20;if(w===10)return 15;if(w===11)return 10;if(w===12)return 5;
  return 0;
}
// PHB Table 1: STRENGTH — Hit Probability and Damage Adjustment
function strBonus(s){
  if(s===1)return{hit:-5,dmg:-4};
  if(s===2)return{hit:-3,dmg:-2};
  if(s===3)return{hit:-3,dmg:-1};
  if(s<=5)return{hit:-2,dmg:-1};
  if(s<=7)return{hit:-1,dmg:0};
  if(s<=15)return{hit:0,dmg:0};
  if(s===16)return{hit:0,dmg:1};
  if(s===17)return{hit:1,dmg:1};
  if(s===18)return{hit:1,dmg:2};
  if(s===19)return{hit:3,dmg:7};
  if(s===20)return{hit:3,dmg:8};
  if(s===21)return{hit:4,dmg:9};
  if(s===22)return{hit:4,dmg:10};
  if(s===23)return{hit:5,dmg:11};
  if(s===24)return{hit:6,dmg:12};
  return{hit:7,dmg:14}; // 25
}
// PHB Table 1: STRENGTH — Exceptional STR for Warriors (18/xx)
// Pass percentile 1-100, where 100 = 18/00
function strExBonus(pct){
  if(pct<=50)return{hit:1,dmg:3};
  if(pct<=75)return{hit:2,dmg:3};
  if(pct<=90)return{hit:2,dmg:4};
  if(pct<=99)return{hit:2,dmg:5};
  return{hit:3,dmg:6}; // 18/00
}
// PHB Table 2: DEXTERITY — Defensive Adjustment (positive = worse AC)
function dexAC(d){
  if(d<=1)return 4;
  if(d===2)return 3;
  if(d===3)return 3;
  if(d===4)return 2;
  if(d===5)return 1;
  if(d<=14)return 0;
  if(d===15)return -1;if(d===16)return -2;if(d===17)return -3;if(d===18)return -4;
  if(d<=20)return -4;
  if(d<=23)return -5;
  return -6; // 24-25
}
// PHB Table 2: DEXTERITY — Missile Attack Adjustment
function dexMissile(d){
  if(d<=1)return -3;
  if(d===2)return -2;
  if(d<=5)return -1;
  if(d<=15)return 0;
  if(d===16)return 1;
  if(d<=18)return 2;
  if(d<=20)return 3;
  return 4; // 21+
}
// PHB Table 3: CONSTITUTION — HP Adjustment per Hit Die
// Warriors get parenthetical bonus; all other classes max at +2
function conHP(c,g){
  var w=g==="Warrior";
  if(c===1)return -3;
  if(c<=3)return -2;
  if(c<=6)return -1;
  if(c<=14)return 0;
  if(c===15)return 1;
  if(c===16)return 2;
  if(c===17)return w?3:2;
  if(c===18)return w?4:2;
  if(c===19)return w?5:2;
  if(c===20)return w?5:2;
  if(c<=23)return w?6:2;
  return w?7:2; // 24-25
}
// PHB Table 4: INTELLIGENCE — Spell-learning info for Wizards
function intInfo(i){
  if(i<=1)return{lang:0,spellLvl:0,learnPct:0,maxSpells:0};
  if(i<=8)return{lang:1,spellLvl:0,learnPct:0,maxSpells:0};
  if(i===9) return{lang:2,spellLvl:4,learnPct:35,maxSpells:6};
  if(i===10)return{lang:2,spellLvl:5,learnPct:40,maxSpells:7};
  if(i===11)return{lang:2,spellLvl:5,learnPct:45,maxSpells:7};
  if(i===12)return{lang:3,spellLvl:6,learnPct:50,maxSpells:7};
  if(i===13)return{lang:3,spellLvl:6,learnPct:55,maxSpells:9};
  if(i===14)return{lang:4,spellLvl:7,learnPct:60,maxSpells:9};
  if(i===15)return{lang:4,spellLvl:7,learnPct:65,maxSpells:11};
  if(i===16)return{lang:5,spellLvl:8,learnPct:70,maxSpells:11};
  if(i===17)return{lang:6,spellLvl:8,learnPct:75,maxSpells:14};
  if(i===18)return{lang:7,spellLvl:9,learnPct:85,maxSpells:18};
  if(i===19)return{lang:8,spellLvl:9,learnPct:95,maxSpells:"All"};
  if(i===20)return{lang:9,spellLvl:9,learnPct:96,maxSpells:"All"};
  if(i===21)return{lang:10,spellLvl:9,learnPct:97,maxSpells:"All"};
  if(i===22)return{lang:11,spellLvl:9,learnPct:98,maxSpells:"All"};
  if(i===23)return{lang:12,spellLvl:9,learnPct:99,maxSpells:"All"};
  if(i===24)return{lang:15,spellLvl:9,learnPct:100,maxSpells:"All"};
  return{lang:20,spellLvl:9,learnPct:100,maxSpells:"All"}; // 25
}
function roll4d6(){var d=[];for(var i=0;i<4;i++)d.push(Math.floor(Math.random()*6)+1);d.sort(function(a,b){return b-a;});return d[0]+d[1]+d[2];}
function roll3d6(){var t=0;for(var i=0;i<3;i++)t+=Math.floor(Math.random()*6)+1;return t;}
function roll3d6reroll1(){var t=0;for(var i=0;i<3;i++){var r=Math.floor(Math.random()*6)+1;if(r===1)r=Math.floor(Math.random()*6)+1;t+=r;}return t;}

// ======== PLAYER'S OPTION CP DATA ========
// PRIEST Sphere Costs (Table 6)
var SPHERE_COSTS={"All":{m:3,M:5},"Animal":{m:5,M:10},"Astral":{m:3,M:5},"Chaos":{m:5,M:8},"Charm":{m:5,M:10},"Combat":{m:5,M:10},"Creation":{m:5,M:10},"Divination":{m:5,M:10},"Elemental (All)":{m:8,M:20},"Elemental Air":{m:2,M:5},"Elemental Earth":{m:2,M:5},"Elemental Fire":{m:3,M:8},"Elemental Water":{m:2,M:5},"Guardian":{m:3,M:5},"Healing":{m:5,M:10},"Law":{m:5,M:8},"Necromantic":{m:5,M:10},"Numbers":{m:5,M:10},"Plant":{m:5,M:10},"Protection":{m:5,M:10},"Summoning":{m:5,M:10},"Sun":{m:3,M:5},"Thought":{m:5,M:10},"Time":{m:5,M:10},"Travelers":{m:3,M:5},"War":{m:3,M:5},"Wards":{m:5,M:10},"Weather":{m:5,M:10}};
var SPHERE_NAMES=Object.keys(SPHERE_COSTS);

// WIZARD School Costs (5 CP each)
var WIZARD_SCHOOLS=["Abjuration","Alteration","Conjuration/Summoning","Divination","Enchantment/Charm","Illusion/Phantasm","Invocation/Evocation","Necromancy"];

// Priest Presets
var PRIEST_PRESETS={"Cleric":{cost:100,major:["All","Astral","Charm","Combat","Creation","Divination","Guardian","Healing","Necromantic","Protection","Summoning"],minor:["Elemental Water","Elemental Earth"],abilities:["Turn undead"],limitations:[]},"Druid":{cost:70,major:["All","Animal","Elemental (All)","Healing","Plant","Sun","Weather"],minor:[],abilities:["Identify plants/animals","Pass without trace","Shapechange","Communication","Immunity to charm"],limitations:["Armor: Leather only","Weapons: Druid list"]},"Crusader":{cost:55,major:["All","Combat","Guardian","Healing","War","Wards"],minor:["Necromantic","Protection"],abilities:["Combat bonus (warrior THAC0)"],limitations:[]},"Monk":{cost:60,major:["All","Divination","Guardian","Numbers","Thought"],minor:["Combat","Healing","Necromantic","Time"],abilities:["AC improvement","Unarmed combat"],limitations:["Armor: None"]},"Shaman":{cost:60,major:["All","Animal","Protection","Summoning","Travelers","Wards"],minor:["Healing","Plant"],abilities:["Spirit powers (all)"],limitations:[]}};

// Priest Abilities
var PRIEST_ABILITIES={"Animal empathy":{c:10},"AC improvement":{c:15},"Casting time reduction":{c:5},"Cold resistance":{c:5},"Combat bonus (warrior THAC0)":{c:20},"Communication":{c:10},"Detect evil":{c:10},"Detect undead":{c:10},"Expert healer":{c:10},"Extended duration (one sphere)":{c:10},"Extended duration (all)":{c:15},"Fire/electrical resistance":{c:7},"Followers (8th level)":{c:5},"Followers (any level)":{c:10},"Hit point bonus (d10)":{c:10},"Identify plants/animals":{c:5},"Identify plants/animals (1st)":{c:8},"Immunity to charm":{c:5},"Immunity to magic":{c:15},"Immunity to disease":{c:10},"Inspire allies":{c:5},"Enrage allies":{c:10},"Know alignment":{c:15},"Lay on hands":{c:10},"Pass without trace":{c:5},"Pass without trace (1st)":{c:7},"Shapechange":{c:15},"Turn undead":{c:15},"Unarmed combat":{c:15},"Warrior Con bonus":{c:15},"Warrior Con + Str":{c:20},"Weapon: one edged":{c:5},"Weapon: any":{c:10},"Weapon specialization":{c:25},"Wizardly priest":{c:25},"Thief ability (1)":{c:10},"Thief ability (2)":{c:15},"Spirit powers (one)":{c:30},"Spirit powers (all)":{c:40}};

// Priest Limitations
var PRIEST_LIMITS={"Armor: Chain or lighter":{r:5},"Armor: Studded leather":{r:10},"Armor: None":{r:15},"Armor: Leather only":{r:8},"Awkward casting":{r:5},"Behavior/taboo":{r:2},"Ceremony/observance":{r:5},"Difficult spell acquisition":{r:5},"Fanaticism":{r:5},"Hazardous spells":{r:10},"Limited items: Potions/scrolls":{r:5},"Limited items: Rings":{r:5},"Limited items: Rods/staves/wands":{r:5},"Limited items: Misc magic":{r:5},"Limited items: Weapons/armor":{r:5},"Limited spell selection":{r:5},"Reduced HP (d6)":{r:10},"Reduced HP (d4)":{r:20},"Reduced spell progression":{r:15},"Slower casting times":{r:5},"Talisman required":{r:8},"Weapons: Staff/club/hammer/mace/flail":{r:5},"Weapons: None":{r:15},"Weapons: Druid list":{r:3}};

// Wizard Abilities
var WIZARD_ABILITIES={"Armor: Padded":{c:5},"Armor: Leather/studded":{c:10},"Armor: Any":{c:15},"Auto spell acquisition (one school)":{c:2},"Auto spell acquisition (any school)":{c:5},"Bonus spells (one school)":{c:10},"Bonus spells (any school)":{c:15},"Casting time reduction (one school)":{c:2},"Casting time reduction (all)":{c:5},"Combat bonus (rogue THAC0)":{c:8},"Combat bonus (priest THAC0)":{c:10},"Constitution adjustment (warrior)":{c:5},"Detect magic":{c:10},"Dispel (1/day)":{c:10},"Dispel (3/day)":{c:15},"Enhanced casting level":{c:10},"Extended duration (one school)":{c:10},"Extended duration (all)":{c:15},"Followers":{c:10},"Improved Hit Die (d6)":{c:10},"Improved Hit Die (d8)":{c:20},"Learning bonus +15% (one school)":{c:5},"Learning bonus +25% (one school)":{c:7},"No components (one school)":{c:5},"No components (any school)":{c:8},"Priestly wizard (minor sphere)":{c:10},"Priestly wizard (major sphere)":{c:15},"Range increase +25% (one school)":{c:5},"Range increase +50% (one school)":{c:7},"Read magic":{c:5},"Research bonus (one school)":{c:5},"Research bonus (all)":{c:10},"School knowledge +1/-1 saves":{c:5},"School knowledge +2/-2 saves":{c:8},"Thief ability (1)":{c:10},"Thief ability (2)":{c:15},"Weapon: Cleric/thief list":{c:10},"Weapon: Any":{c:15},"Weapon specialization":{c:15}};

// Wizard Limitations
var WIZARD_LIMITS={"Awkward casting":{r:5},"Behavior/taboo":{r:2},"Difficult memorization":{r:5},"Hazardous spells":{r:10},"Learning penalty -15%":{r:5},"Learning penalty -25%":{r:8},"Limited items: Potions/scrolls":{r:5},"Limited items: Rings":{r:5},"Limited items: Rods/staves/wands":{r:5},"Limited items: Misc/weapons/armor":{r:5},"Reduced HP (d3)":{r:10},"Reduced spell knowledge":{r:7},"Reduced spell progression":{r:15},"Slower casting time +3":{r:2},"Slower casting time (next unit)":{r:5},"Supernatural constraint":{r:5},"Talisman required":{r:8},"Weapons: None allowed":{r:5},"Weapons: Cannot wield":{r:5}};

// ======== ACTIVE SPELL EFFECTS ========
var BUFF_SPELLS={
  "Stone Strength":{level:1,strBonus:2,desc:"+2 STR (muscles harden like stone)"},
  "Barkskin":{level:2,acBonus:2,saveBonus:1,desc:"AC +2 (bark-tough skin). Saves vs all attack forms except magic +1."},
  "Oxen Strength":{level:3,strLvlBonus:true,desc:"+1 STR/level (max 18/00). Each 10% exceptional = 1 point. Unarmored AC 8."}
};

// Duration in rounds for known buff spells (function of caster level)
var SPELL_DURATIONS={
  "Stone Strength":function(l){return l*10;},   // 1 turn/level
  "Barkskin":      function(l){return 4+l;},    // 4 rds + 1/level
  "Oxen Strength": function(l){return l;}       // 1 round/level
};

// ======== DICE ROLLER COMPONENTS ========
var DOT_POS={
  1:[[50,50]],
  2:[[72,25],[28,75]],
  3:[[72,25],[50,50],[28,75]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
  6:[[28,22],[72,22],[28,50],[72,50],[28,78],[72,78]]
};

function DieDots({n,dropped}){
  return <div style={{position:"relative",width:"100%",height:"100%"}}>
    {(DOT_POS[n]||[]).map(function(d,i){
      return <div key={i} style={{position:"absolute",left:d[0]+"%",top:d[1]+"%",
        width:"10px",height:"10px",borderRadius:"50%",
        background:dropped?"#555":(n===1?"#cc3333":"#1a1a2e"),
        transform:"translate(-50%,-50%)",
        boxShadow:dropped?"none":"0 1px 2px rgba(0,0,0,0.4)"}}/>;
    })}
  </div>;
}

function Die3D({value,phase,delay,dropped}){
  // Cube face layout: front=1, back=6, right=4, left=3, top=2, bottom=5
  // To show face N toward viewer, rotate the cube:
  var faceRX={1:0,2:90,3:0,4:0,5:-90,6:0};
  var faceRY={1:0,2:0,3:90,4:-90,5:0,6:180};
  var sz=58, half=sz/2;
  var finalX=720+(faceRX[value]||0);
  var finalY=720+(faceRY[value]||0);
  var rolling=phase!=="idle";
  var dur=(0.85+delay*0.0008).toFixed(2);
  var cubeStyle={
    position:"relative",width:sz+"px",height:sz+"px",
    transformStyle:"preserve-3d",
    transform:rolling?("rotateX("+finalX+"deg) rotateY("+finalY+"deg)"):"rotateX(0deg) rotateY(0deg)",
    transition:rolling?("transform "+dur+"s cubic-bezier(0.12,0.9,0.3,1) "+delay+"ms"):"none",
    opacity:dropped?0.28:1,
  };
  var fc=dropped?"#252530":"#f2ecd8";
  var bc=dropped?"#3a3a4a":"#8b7355";
  var fb={position:"absolute",width:sz+"px",height:sz+"px",background:fc,
    border:"2px solid "+bc,borderRadius:"8px",
    display:"flex",alignItems:"center",justifyContent:"center",
    backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",
    padding:"7px",boxSizing:"border-box"};
  var faces=[
    {t:"translateZ("+half+"px)",n:1},
    {t:"rotateY(180deg) translateZ("+half+"px)",n:6},
    {t:"rotateY(90deg) translateZ("+half+"px)",n:4},
    {t:"rotateY(-90deg) translateZ("+half+"px)",n:3},
    {t:"rotateX(-90deg) translateZ("+half+"px)",n:2},
    {t:"rotateX(90deg) translateZ("+half+"px)",n:5},
  ];
  return <div style={{perspective:"180px",width:sz+"px",height:sz+"px"}}>
    <div style={cubeStyle}>
      {faces.map(function(f,i){
        return <div key={i} style={Object.assign({},fb,{transform:f.t})}>
          <DieDots n={f.n} dropped={dropped}/>
        </div>;
      })}
    </div>
  </div>;
}

function DiceRollerModal({method,allRolls,onApply,onReroll,onClose}){
  var _ph=useState("idle"),phase=_ph[0],setPhase=_ph[1];
  var _asn=useState(["Str","Dex","Con","Int","Wis","Cha"]),assignments=_asn[0],setAssignments=_asn[1];
  useEffect(function(){
    var t1=setTimeout(function(){setPhase("rolling");},60);
    var t2=setTimeout(function(){setPhase("settled");},1600);
    return function(){clearTimeout(t1);clearTimeout(t2);};
  },[]);
  function swapAssign(idx,newStat){
    setAssignments(function(prev){
      var next=prev.slice();
      var oldStat=next[idx];
      if(oldStat===newStat)return prev;
      var otherIdx=next.indexOf(newStat);
      next[idx]=newStat;
      if(otherIdx>=0)next[otherIdx]=oldStat;
      return next;
    });
  }
  var g="#c9a84c",surf="#111118",brd="#1e1e2e",dim="#666050",txt="#ccc8b8";
  var sNames=["Str","Dex","Con","Int","Wis","Cha"];
  var mLabel={"3d6":"3d6 Straight","3d6r1":"3d6 Reroll 1s","4d6":"4d6 Drop Lowest"}[method]||method;
  var settled=phase==="settled";
  return <div style={{position:"fixed",inset:0,background:"rgba(3,3,8,0.97)",zIndex:10000,
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    padding:"16px",overflowY:"auto"}}>
    <div style={{width:"100%",maxWidth:"740px",background:surf,border:"1px solid "+brd,
      borderRadius:"12px",padding:"20px",boxShadow:"0 0 40px rgba(0,0,0,0.8)"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
        <div style={{color:g,fontWeight:"bold",fontFamily:"Georgia,serif",fontSize:"15px",
          fontVariant:"small-caps",letterSpacing:"2px"}}>
          Rolling Ability Scores — {mLabel}
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:dim,
          fontSize:"20px",cursor:"pointer",padding:"0 4px",lineHeight:"1"}}>✕</button>
      </div>
      {/* Stat rows */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"10px"}}>
        {allRolls.map(function(rolls,si){
          var isDrop=method==="4d6";
          var minV=isDrop?Math.min.apply(null,rolls):null;
          var minI=isDrop?rolls.indexOf(minV):-1;
          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);
          var dBase=si*100;
          var assigned=assignments[si]||sNames[si];
          return <div key={si} style={{background:"#0a0a12",border:"1px solid "+brd,
            borderRadius:"8px",padding:"10px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",gap:"6px"}}>
              <div style={{fontSize:"9px",color:dim,fontFamily:"monospace",letterSpacing:"1px"}}>ROLL {si+1}</div>
              <select value={assigned} onChange={function(e){swapAssign(si,e.target.value);}}
                disabled={!settled}
                style={{background:"#0a0a12",border:"1px solid "+brd,color:settled?g:dim,
                  fontFamily:"monospace",fontSize:"11px",fontWeight:"bold",letterSpacing:"1px",
                  padding:"3px 6px",borderRadius:"4px",outline:"none",cursor:settled?"pointer":"default",
                  textTransform:"uppercase"}}>
                {sNames.map(function(s){return <option key={s} value={s}>{s}</option>;})}
              </select>
            </div>
            <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
              {rolls.map(function(v,di){
                var drp=isDrop&&di===minI;
                return <div key={di} style={{display:"flex",flexDirection:"column",
                  alignItems:"center",gap:"4px"}}>
                  <Die3D value={v} phase={phase} delay={dBase+di*80} dropped={drp}/>
                  {settled&&<div style={{fontSize:"11px",fontFamily:"monospace",fontWeight:"bold",
                    color:drp?"#444":g,textDecoration:drp?"line-through":"none"}}>{v}</div>}
                </div>;
              })}
              {settled&&<div style={{marginLeft:"8px",fontSize:"28px",fontWeight:"bold",
                color:g,fontFamily:"Georgia,serif",minWidth:"32px",textAlign:"center"}}>
                {total}
              </div>}
            </div>
          </div>;
        })}
      </div>
      {/* Total summary */}
      {settled&&<div style={{marginTop:"12px",padding:"8px 12px",background:"#0a0a12",
        border:"1px solid "+brd,borderRadius:"6px",
        display:"flex",gap:"16px",flexWrap:"wrap",justifyContent:"center"}}>
        {sNames.map(function(stat){
          var si=assignments.indexOf(stat);
          var rolls=si>=0?(allRolls[si]||[]):[];
          var isDrop=method==="4d6";
          var minI=isDrop?rolls.indexOf(Math.min.apply(null,rolls)):-1;
          var total=rolls.reduce(function(s,v,i){return s+(isDrop&&i===minI?0:v);},0);
          return <div key={stat} style={{textAlign:"center",minWidth:"40px"}}>
            <div style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>{stat}</div>
            <div style={{fontSize:"18px",fontWeight:"bold",color:g,fontFamily:"Georgia,serif"}}>{total}</div>
          </div>;
        })}
      </div>}
      {/* Buttons */}
      <div style={{display:"flex",gap:"10px",marginTop:"16px",justifyContent:"flex-end"}}>
        <button onClick={onReroll}
          style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,
            padding:"8px 16px",borderRadius:"6px",cursor:"pointer",
            fontFamily:"monospace",fontSize:"11px"}}>
          Re-roll
        </button>
        <button onClick={function(){onApply(assignments);}} disabled={!settled}
          style={{background:settled?"#1a2a1a":"#0a0a0a",
            color:settled?"#7a7":dim,
            border:"1px solid "+(settled?"#3a5a3a":brd),
            padding:"8px 20px",borderRadius:"6px",
            cursor:settled?"pointer":"default",
            fontFamily:"monospace",fontSize:"11px",fontWeight:"bold"}}>
          Apply to Stats
        </button>
      </div>
    </div>
  </div>;
}

// ======== DRUID DATA ========
var BEAST_FORMS = {
  "Owlbear": {
    size:"Large", mv:"12", ac:5, hd:"5+2", attacks:[
      {name:"Claw",dmg:"1d8"},
      {name:"Claw",dmg:"1d8"},
      {name:"Beak",dmg:"2d6"}
    ],
    special:"Hug (if both claws hit same target: 2d8 extra crush damage)",
    notes:"Monster Manual entry. Totemic Druids must choose Owlbear as totem animal."
  },
  "Brown Bear": {
    size:"Large", mv:"12", ac:6, hd:"3+3", attacks:[
      {name:"Claw",dmg:"1d6"},
      {name:"Claw",dmg:"1d6"},
      {name:"Bite",dmg:"1d8"}
    ],
    special:"Hug (if both claws hit: 2d8)",
    notes:"Standard shapeshifting form."
  },
  "Wolf": {
    size:"Medium", mv:"18", ac:7, hd:"2+2", attacks:[
      {name:"Bite",dmg:"2d4"}
    ],
    special:"Trip on bite (save vs paralysis or fall prone)",
    notes:"Standard shapeshifting form."
  },
  "Giant Snake": {
    size:"Large", mv:"15", ac:5, hd:"4+2", attacks:[
      {name:"Bite",dmg:"1d6"},
      {name:"Constrict",dmg:"2d4"}
    ],
    special:"Constriction on successful hit (automatic 2d4/round)",
    notes:"Standard shapeshifting form."
  },
  "Giant Eagle": {
    size:"Large", mv:"3/30 (fly)", ac:7, hd:"4", attacks:[
      {name:"Talon",dmg:"1d6"},
      {name:"Talon",dmg:"1d6"},
      {name:"Bite",dmg:"1d4"}
    ],
    special:"Dive attack (double damage on first strike)",
    notes:"Standard shapeshifting form."
  },
  "Boar": {
    size:"Medium", mv:"15", ac:7, hd:"3+3", attacks:[
      {name:"Gore",dmg:"3d4"}
    ],
    special:"Continues to fight at -1 to -9 hp",
    notes:"Standard shapeshifting form."
  }
};

var DRUID_KITS = {
  "Totemic Druid": {
    req:{Wis:12,Cha:15},
    desc:"Bonds with a single totem animal, gaining its powers as they advance.",
    abilities:[
      "Speak with totem animal species at will",
      "Totem animal will never attack the druid",
      "Gain totem animal's senses (scent, low-light vision, etc.) at level 3",
      "Partial totem form (cosmetic features) at level 5",
      "Full totem form 1/day at level 7 (uses shapechange slots)"
    ],
    limitations:[
      "Must select totem animal at 1st level — cannot change",
      "Can only shapechange into totem animal (no other beast forms)",
      "Feral and aloof in civilized company: -20% (-4 on d20) when dealing with new NPCs in civilized areas (towns, cities, castles) other than sylvan creatures"
    ],
    totemRequired:true
  },
  "Shapeshifter": {
    req:{Con:15},
    desc:"Master of physical transformation with enhanced shapechange abilities.",
    abilities:[
      "Double normal shapechange uses per day",
      "Shapechange as free action (no casting time)",
      "Retain full HP when changing forms",
      "At level 7: partial forms (hybrid states) available",
      "At level 9: can shapechange into creatures from compendium"
    ],
    limitations:[
      "Must shapechange at least once per day or suffer -2 to all rolls",
      "Cannot wear armor (interferes with shifting)",
      "Each failed shapechange attempt: cumulative 5% chance of getting stuck"
    ],
    shapeshifter:true
  },
  "Hivemaster": {
    req:{Wis:14},
    desc:"Commands insects and arthropods, specializing in vermin-related magic.",
    abilities:[
      "Speak with insects and arthropods at will",
      "Insects will not attack the druid",
      "Summon insect swarm 1/day (as Insect Plague but smaller, level/day)",
      "Immune to insect-based attacks and poisons",
      "Animal Friendship with arthropods at double normal rate"
    ],
    limitations:[
      "Must carry a live insect at all times (or lose abilities for 24 hrs)",
      "Cannot use fire-based spells (insects fear fire)",
      "Shapechange only into insects or arachnids"
    ]
  },
  "Skald": {
    req:{Wis:12,Cha:13},
    desc:"Druidic bard who preserves oral traditions and history of the natural world.",
    abilities:[
      "Inspire allies with nature sagas (+1 to hit, +1 save, 1/day)",
      "Lore check on natural history at 80% + 1%/level",
      "Recite nature poetry to calm animals (as Animal Friendship, 1/day)",
      "Access to bard spell list (nature-themed) in addition to druid spells"
    ],
    limitations:[
      "Must compose and recite a poem or saga once per week",
      "Cannot use written spellbooks — must memorize everything orally",
      "Armor restricted to padded or leather (for performance)"
    ]
  },
  "Wanderer": {
    req:{Con:12,Wis:12},
    desc:"Nomadic guardian of the wild places between settlements.",
    abilities:[
      "Never lost in any natural terrain",
      "Move through natural difficult terrain at full movement rate",
      "Foraging success at 3 in 6 (double normal chance)",
      "Pass without Trace at will (as spell, self only)",
      "Gain one additional language for each new natural region explored"
    ],
    limitations:[
      "Cannot maintain a permanent residence — must move every season",
      "Takes 1d6 psychic damage per day confined indoors against will",
      "Cannot accumulate wealth beyond what can be carried"
    ]
  },
  "Mountain Druid": {
    req:{Con:14,Str:12},
    desc:"Hardy guardian of alpine and highland regions.",
    abilities:[
      "Immune to altitude effects and natural cold",
      "Climb natural rock at full movement rate",
      "Stone Tell 1/day (as spell)",
      "Earthquake tremor sense — detect tremors up to 1 mile away"
    ],
    limitations:[
      "Must maintain a high-altitude grove or sacred site",
      "Uncomfortable below 2,000 feet elevation (-1 to all rolls for 1 week after descending)"    ]
  },
  "Swamp Druid": {
    req:{Con:13,Wis:12},
    desc:"Master of wetlands, bogs, and bayous.",
    abilities:[
      "Immune to swamp diseases and natural poisons",
      "Breathe underwater 1 round/level (1/day)",
      "Speak with aquatic animals at will",
      "Move through swamp and bog at double normal rate"
    ],
    limitations:[
      "Cannot function well in dry climates (-1 to all saves vs. fire)",
      "Must anoint self with swamp mud daily (or lose druidic powers for 24 hrs)"    ]
  },
  "Arctic Druid": {
    req:{Con:15,Wis:12},
    desc:"Keeper of frozen tundras, glaciers, and polar regions.",
    abilities:[
      "Immune to natural cold",
      "Walk on ice/snow without penalty",
      "Summon blizzard conditions 1/week (outdoors, 1-mile radius)",
      "Speak with arctic animals at will"
    ],
    limitations:[
      "Suffers in warm climates (-2 to all rolls in temperatures above 70°F for first week)",
      "Must meditate in the cold for 1 hour each day"    ]
  },
  "Desert Druid": {
    req:{Con:13,Wis:12},
    desc:"Guardian of arid wastes and sun-blasted badlands.",
    abilities:[
      "Immune to natural heat and dehydration",
      "Locate water within 100 yards (1/day)",
      "Speak with desert animals at will",
      "Create Water 1/day (as clerical spell)"
    ],
    limitations:[
      "Suffers in wet climates (-1 to all rolls in rain or humidity)",
      "Must meditate at high noon each day"    ]
  },
  "Jungle Druid": {
    req:{Dex:13,Wis:12},
    desc:"Protector of tropical rainforests and dense wilderness.",
    abilities:[
      "Move silently in jungle at +3 bonus",
      "Immune to jungle diseases and natural toxins",
      "Speak with tropical animals at will",
      "Plant Door 1/day (as spell, jungle vegetation only)"
    ],
    limitations:[
      "Uncomfortable in open terrain (-1 to all saves outdoors with no canopy)",
      "Cannot wear metal armor (jungle heat and undergrowth)"    ]
  },
  "Plains Druid": {
    req:{Wis:12,Con:12},
    desc:"Warden of grasslands, savannahs, and rolling prairies.",
    abilities:[
      "Spot movement at triple normal range on open terrain",
      "Ride any natural animal without check",
      "Speak with plains animals at will",
      "Control Weather 1/week (limited to plains conditions)"
    ],
    limitations:[
      "Uncomfortable in enclosed spaces or underground (-1 to all rolls)",
      "Must tend or visit a sacred plains grove each month"    ]
  },
  "Forest Druid": {
    req:{Wis:12},
    desc:"The classic druid archetype, guardian of woodlands and forests.",
    abilities:[
      "Speak with forest animals at will",
      "Tree stride 1/day (teleport between trees within 3 miles)",
      "Identify any plant or animal on sight",
      "Barkskin at will (self only)"
    ],
    limitations:[
      "Must maintain a sacred grove within their territory",
      "Cannot harm trees knowingly"    ]
  },
  "Tuigan Druid": {
    req:{Str:13,Wis:13},
    desc:"Horse-bonded steppe druid of the Tuigan nomads.",
    abilities:[
      "Permanent Animal Friendship with horses and ponies",
      "Ride without hands, fight from horseback without penalty",
      "Speak with equines at will",
      "Steppe terrain bonuses (as Wanderer, but plains/steppe only)"
    ],
    limitations:[
      "Must own and care for a horse at all times",
      "Cannot enter cities with population over 5,000 without distress"    ]
  },
  "None": {
    req:{},
    desc:"No kit selected — standard druid.",
    abilities:[],
    limitations:[]
  }
};

// ======== MAIN COMPONENT ========
function CharCreator({ spellData: SPELL_DATA, itemData: ITEM_DATA }) {
  var _tab=useState("stats"),tab=_tab[0],setTab=_tab[1];
  var _name=useState(""),charName=_name[0],setCharName=_name[1];
  var _race=useState("Human"),race=_race[0],setRace=_race[1];
  var _cls=useState("Druid"),cls=_cls[0],setCls=_cls[1];
  var _kit=useState(""),kit=_kit[0],setKit=_kit[1];
  var _dmOverride=useState(false),dmOverride=_dmOverride[0],setDmOverride=_dmOverride[1];
  var _totem=useState(""),totemAnimal=_totem[0],setTotemAnimal=_totem[1];
  var _shapeUses=useState(0),shapeUsesLeft=_shapeUses[0],setShapeUsesLeft=_shapeUses[1];
  var _shapeFailed=useState(0),shapeFailed=_shapeFailed[0],setShapeFailed=_shapeFailed[1];
  var _lvl=useState(5),level=_lvl[0],setLevel=_lvl[1];
  var _xp=useState(0),xp=_xp[0],setXP=_xp[1];
  var _hp=useState(28),hp=_hp[0],setHP=_hp[1];
  var _align=useState("True Neutral"),align=_align[0],setAlign=_align[1];
  var _stats=useState({Str:10,Dex:10,Con:10,Int:10,Wis:16,Cha:15}),stats=_stats[0],setStats=_stats[1];
  var _spct=useState(0),strPct=_spct[0],setStrPct=_spct[1];
  var _casts=useState([]),activeCasts=_casts[0],setActiveCasts=_casts[1];
  var _round=useState(1),combatRound=_round[0],setCombatRound=_round[1];
  var _casting=useState(null),castingSpell=_casting[0],setCastingSpell=_casting[1];
  var _spells=useState([]),compSpells=_spells[0],setCompSpells=_spells[1];
  // Sync compSpells when spell data prop loads
  useEffect(function(){if(SPELL_DATA&&SPELL_DATA.length>0)setCompSpells(SPELL_DATA);},[SPELL_DATA]);
  var _memo=useState([]),memorized=_memo[0],setMemorized=_memo[1];
  var _notes=useState(""),notes=_notes[0],setNotes=_notes[1];
  // AI state
  var _aiQuery=useState(""),aiQuery=_aiQuery[0],setAiQuery=_aiQuery[1];
  var _aiResult=useState(""),aiResult=_aiResult[0],setAiResult=_aiResult[1];
  var _aiLoading=useState(false),aiLoading=_aiLoading[0],setAiLoading=_aiLoading[1];
  var _aiMode=useState("spells"),aiMode=_aiMode[0],setAiMode=_aiMode[1];
  var _aiHighlight=useState([]),aiHighlight=_aiHighlight[0],setAiHighlight=_aiHighlight[1];
  var _genPrompt=useState(""),genPrompt=_genPrompt[0],setGenPrompt=_genPrompt[1];
  var _genResult=useState(null),genResult=_genResult[0],setGenResult=_genResult[1];
  var _genLoading=useState(false),genLoading=_genLoading[0],setGenLoading=_genLoading[1];
  var _suggestLoading=useState(false),suggestLoading=_suggestLoading[0],setSuggestLoading=_suggestLoading[1];
  var _suggestDone=useState(false),suggestDone=_suggestDone[0],setSuggestDone=_suggestDone[1];
  var _expandedSpell=useState(null),expandedSpell=_expandedSpell[0],setExpandedSpell=_expandedSpell[1];
  var _rolling=useState(false),isRolling=_rolling[0],setIsRolling=_rolling[1];
  var _rollAnim=useState(0),rollAnimKey=_rollAnim[0],setRollAnimKey=_rollAnim[1];
  var _rollResults=useState([]),rollResults=_rollResults[0],setRollResults=_rollResults[1];
  var _rollModalOpen=useState(false),rollModalOpen=_rollModalOpen[0],setRollModalOpen=_rollModalOpen[1];
  var _rollModalMethod=useState("4d6"),rollModalMethod=_rollModalMethod[0],setRollModalMethod=_rollModalMethod[1];
  var _rollKey=useState(0),rollKey=_rollKey[0],setRollKey=_rollKey[1];
  var _sfilt=useState(""),spellFilter=_sfilt[0],setSpellFilter=_sfilt[1];
  var _slvl=useState("1"),spellLvlFilter=_slvl[0],setSpellLvlFilter=_slvl[1];
  // Items tab state
  var _iSearch=useState(""),itemSearch=_iSearch[0],setItemSearch=_iSearch[1];
  var _iCat=useState(""),itemCat=_iCat[0],setItemCat=_iCat[1];
  var _iUsable=useState(""),itemUsable=_iUsable[0],setItemUsable=_iUsable[1];
  var _iExpanded=useState(null),expandedItem=_iExpanded[0],setExpandedItem=_iExpanded[1];
  // Gear (custom items) state
  var _gearItems=useState([]),gearItems=_gearItems[0],setGearItems=_gearItems[1];
  var _gearForm=useState(null),gearForm=_gearForm[0],setGearForm=_gearForm[1];
  var BLANK_GEAR={id:null,name:"",type:"Ring",desc:"",effects:{str:0,dex:0,con:0,int:0,wis:0,cha:0,ac:0,thac0:0,dmg:0,saves:0,hp:0,bonusDmgDice:0,bonusDmgDie:6,bonusDmgType:""}};
  function newGearForm(){setGearForm(Object.assign({},BLANK_GEAR,{effects:Object.assign({},BLANK_GEAR.effects)}));}
  // AI item generation
  var _gearAiPrompt=useState(""),gearAiPrompt=_gearAiPrompt[0],setGearAiPrompt=_gearAiPrompt[1];
  var _gearAiLoading=useState(false),gearAiLoading=_gearAiLoading[0],setGearAiLoading=_gearAiLoading[1];
  var _gearAiError=useState(""),gearAiError=_gearAiError[0],setGearAiError=_gearAiError[1];
  // Gear library modal
  var _gearSearch=useState(""),gearSearch=_gearSearch[0],setGearSearch=_gearSearch[1];
  var _gearLibOpen=useState(false),gearLibOpen=_gearLibOpen[0],setGearLibOpen=_gearLibOpen[1];
  var _gearLibItems=useState([]),gearLibItems=_gearLibItems[0],setGearLibItems=_gearLibItems[1];
  var _gearLibLoading=useState(false),gearLibLoading=_gearLibLoading[0],setGearLibLoading=_gearLibLoading[1];
  var _gearLibRole=useState("player"),gearLibRole=_gearLibRole[0],setGearLibRole=_gearLibRole[1];
  var _gearLibStatus=useState(""),gearLibStatus=_gearLibStatus[0],setGearLibStatus=_gearLibStatus[1];
  // DM password gate
  var _dmPwVerified=useState(false),dmPwVerified=_dmPwVerified[0],setDmPwVerified=_dmPwVerified[1];
  var _dmPwInput=useState(""),dmPwInput=_dmPwInput[0],setDmPwInput=_dmPwInput[1];
  var _dmPwConfirm=useState(""),dmPwConfirm=_dmPwConfirm[0],setDmPwConfirm=_dmPwConfirm[1];
  var _dmPwError=useState(""),dmPwError=_dmPwError[0],setDmPwError=_dmPwError[1];
  var _dmPwLoading=useState(false),dmPwLoading=_dmPwLoading[0],setDmPwLoading=_dmPwLoading[1];
  var _dmPwHashExists=useState(null),dmPwHashExists=_dmPwHashExists[0],setDmPwHashExists=_dmPwHashExists[1];
  var _dmChangePw=useState(false),dmChangePw=_dmChangePw[0],setDmChangePw=_dmChangePw[1];
  // CP state
  var _cpBudget=useState(120),cpBudget=_cpBudget[0],setCpBudget=_cpBudget[1];
  var _cpMajor=useState([]),cpMajor=_cpMajor[0],setCpMajor=_cpMajor[1];
  var _cpMinor=useState([]),cpMinor=_cpMinor[0],setCpMinor=_cpMinor[1];
  var _cpSchools=useState([]),cpSchools=_cpSchools[0],setCpSchools=_cpSchools[1];
  var _cpAbil=useState([]),cpAbil=_cpAbil[0],setCpAbil=_cpAbil[1];
  var _cpLim=useState([]),cpLim=_cpLim[0],setCpLim=_cpLim[1];
  var fr=useRef(null);
  var loadFileRef=useRef(null);

  // Cloud / auth state
  var _cloudId=useState(null),cloudId=_cloudId[0],setCloudId=_cloudId[1];
  var _cloudStatus=useState(""),cloudStatus=_cloudStatus[0],setCloudStatus=_cloudStatus[1];
  var _pdfParsing=useState(false),pdfParsing=_pdfParsing[0],setPdfParsing=_pdfParsing[1];
  // Auth
  var _authUser=useState(null),authUser=_authUser[0],setAuthUser=_authUser[1];
  var _authEmail=useState(""),authEmail=_authEmail[0],setAuthEmail=_authEmail[1];
  var _authPassword=useState(""),authPassword=_authPassword[0],setAuthPassword=_authPassword[1];
  var _authMode=useState("signin"),authMode=_authMode[0],setAuthMode=_authMode[1];
  var _authError=useState(""),authError=_authError[0],setAuthError=_authError[1];
  var _authLoading=useState(false),authLoading=_authLoading[0],setAuthLoading=_authLoading[1];
  // Account modal (character list)
  var _acctOpen=useState(false),acctOpen=_acctOpen[0],setAcctOpen=_acctOpen[1];
  var _acctChars=useState([]),acctChars=_acctChars[0],setAcctChars=_acctChars[1];
  var _acctLoading=useState(false),acctLoading=_acctLoading[0],setAcctLoading=_acctLoading[1];
  var _acctStatus=useState(""),acctStatus=_acctStatus[0],setAcctStatus=_acctStatus[1];
  var _acctSearch=useState(""),acctSearch=_acctSearch[0],setAcctSearch=_acctSearch[1];

  // Auto-save to localStorage on every change
  useEffect(function(){
    try{
      var snap={charName,race,cls,kit,level,xp,hp,align,stats,strPct,memorized,notes,
        cpBudget,cpMajor,cpMinor,cpSchools,cpAbil,cpLim,dmOverride,totemAnimal,shapeUsesLeft,shapeFailed,gearItems};
      localStorage.setItem("cf_autosave",JSON.stringify(snap));
    }catch(_){}
  },[charName,race,cls,kit,level,xp,hp,align,stats,strPct,memorized,notes,
     cpBudget,cpMajor,cpMinor,cpSchools,cpAbil,cpLim,dmOverride,totemAnimal,shapeUsesLeft,shapeFailed,gearItems]);

  // Restore autosave on first load
  useEffect(function(){
    try{
      var raw=localStorage.getItem("cf_autosave");
      if(raw){var d=JSON.parse(raw);applyCharacterData(d);}
    }catch(_){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Listen for Supabase auth state changes
  useEffect(function(){
    if(!supabase)return;
    supabase.auth.getUser().then(function(r){setAuthUser(r.data.user||null);});
    var unsub=onAuthStateChange(function(user){setAuthUser(user||null);});
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Derived
  var raceData=RACES[race]||RACES.Human;
  var classData=CLASSES[cls]||CLASSES.Druid;
  var isPriest=classData.group==="Priest";
  var isWizard=classData.group==="Wizard";
  var adjStats={};
  ["Str","Dex","Con","Int","Wis","Cha"].forEach(function(a){adjStats[a]=stats[a]+(raceData.adj[a]||0);});
  var thac0=getThac0(classData.thac0,level);
  var isDruid=cls==="Druid";
  var kitData=isDruid?(DRUID_KITS[kit]||DRUID_KITS["None"]):null;
  var maxShapeUses=isDruid?(Math.floor(level/3)+1):0;
  var shapeshifterMaxUses=(kitData&&kitData.shapeshifter)?maxShapeUses*2:maxShapeUses;
  var kitReqFails=(kitData&&kitData.req)?Object.keys(kitData.req).filter(function(s){return adjStats[s]<kitData.req[s];}):[];
  var kitBlocked=kitReqFails.length>0&&!dmOverride;
  var totemForm=(isDruid&&kitData&&kitData.totemRequired&&totemAnimal)?BEAST_FORMS[totemAnimal]:null;
  var saves=(SAVES[classData.saves]||SAVES.pri)(level);
  var ac=10+dexAC(adjStats.Dex);
  var isWarrior=classData.group==="Warrior";
  var exStr=isWarrior&&adjStats.Str===18&&strPct>0;
  var strB=exStr?strExBonus(strPct):strBonus(adjStats.Str);
  var conB=conHP(adjStats.Con,classData.group);
  var wisAdj=wisDefense(adjStats.Wis);
  var wisImm=wisImmunity(adjStats.Wis);
  var wisSpellFail=wisFailure(adjStats.Wis);
  var dexMis=dexMissile(adjStats.Dex);
  var slots=classData.spells==="priest"?(PRIEST_SLOTS[Math.min(level,14)]||[]):classData.spells==="wizard"?(WIZARD_SLOTS[Math.min(level,14)]||[]):[];
  var wBonus=classData.spells==="priest"?wisBonus(adjStats.Wis):[];
  var adjSlots=slots.map(function(s,i){return s+(wBonus[i]||0);});

  // Equipped custom gear bonuses
  var equipped=gearItems.filter(function(g){return g.equipped;});
  var gearStr=equipped.reduce(function(s,g){return s+(g.effects.str||0);},0);
  var gearDex=equipped.reduce(function(s,g){return s+(g.effects.dex||0);},0);
  var gearCon=equipped.reduce(function(s,g){return s+(g.effects.con||0);},0);
  var gearInt=equipped.reduce(function(s,g){return s+(g.effects.int||0);},0);
  var gearWis=equipped.reduce(function(s,g){return s+(g.effects.wis||0);},0);
  var gearCha=equipped.reduce(function(s,g){return s+(g.effects.cha||0);},0);
  var gearAC=equipped.reduce(function(s,g){return s+(g.effects.ac||0);},0);
  var gearThac0=equipped.reduce(function(s,g){return s+(g.effects.thac0||0);},0);
  var gearDmg=equipped.reduce(function(s,g){return s+(g.effects.dmg||0);},0);
  var gearSaves=equipped.reduce(function(s,g){return s+(g.effects.saves||0);},0);
  var gearHP=equipped.reduce(function(s,g){return s+(g.effects.hp||0);},0);
  // Apply gear stat bonuses on top of racial adjustments
  adjStats.Str+=gearStr; adjStats.Dex+=gearDex; adjStats.Con+=gearCon;
  adjStats.Int+=gearInt; adjStats.Wis+=gearWis; adjStats.Cha+=gearCha;

  // Active spell buffs
  var buffStr=0,buffStrLvl=0,buffAC=0,buffSave=0,activeBuffs=[];
  activeCasts.forEach(function(m){
    var sp=BUFF_SPELLS[m["Spell Name"]];
    if(sp){
      activeBuffs.push(m["Spell Name"]);
      if(sp.strBonus)  buffStr+=sp.strBonus;
      if(sp.strLvlBonus) buffStrLvl+=level; // Oxen Strength: +1 STR per caster level
      if(sp.acBonus)   buffAC+=sp.acBonus;
      if(sp.saveBonus) buffSave+=sp.saveBonus;
    }
  });
  // Compute effective STR & exceptional percentile from buffs
  var rawEffStr=adjStats.Str+buffStr+buffStrLvl;
  var effStr, effStrPct;
  if(rawEffStr<=18){
    effStr=rawEffStr;
    // Keep character's own exceptional % if still at 18
    effStrPct=(exStr&&rawEffStr===18)?strPct:0;
  } else {
    effStr=18;
    // Points above 18 → 10% per point on the exceptional chart, cap 100
    var overflowPct=Math.min(100,(rawEffStr-18)*10);
    effStrPct=exStr?Math.min(100,strPct+overflowPct):overflowPct;
  }
  var effStrB=effStrPct>0?strExBonus(effStrPct):strBonus(effStr);
  // gear bonuses: positive = benefit (AC+2 means AC goes from 10→8, THAC0+2 means 20→18)
  var effAC=ac-buffAC-gearAC;
  var effThac0=thac0-strB.hit-gearThac0;
  var effSaves={};
  Object.keys(saves).forEach(function(k){effSaves[k]=saves[k]-gearSaves-buffSave;});
  var effHP=hp+gearHP;

  // Active abilities/limits based on class group
  var activeAbilities=isPriest?PRIEST_ABILITIES:isWizard?WIZARD_ABILITIES:{};
  var activeLimits=isPriest?PRIEST_LIMITS:isWizard?WIZARD_LIMITS:{};

  // CP calculation
  var cpSpent=0;
  if(isPriest){
    cpMajor.forEach(function(s){cpSpent+=(SPHERE_COSTS[s]||{M:5}).M;});
    cpMinor.forEach(function(s){cpSpent+=(SPHERE_COSTS[s]||{m:3}).m;});
  }
  if(isWizard){
    cpSpent+=cpSchools.length*5;
  }
  cpAbil.forEach(function(a){cpSpent+=(activeAbilities[a]||{c:0}).c;});
  var cpRefund=0;
  cpLim.forEach(function(l){cpRefund+=(activeLimits[l]||{r:0}).r;});
  var cpRemaining=cpBudget-cpSpent+cpRefund;

  // Class change handler - reset CP and set appropriate budget
  function changeClass(newCls) {
    setCls(newCls);
    var cd=CLASSES[newCls]||{};
    setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);
    if(cd.group==="Priest")setCpBudget(120);
    else if(cd.group==="Wizard")setCpBudget(40);
    else setCpBudget(0);
    if(newCls!=="Druid"){setKit("");setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);setDmOverride(false);}
  }

  function loadPreset(name){
    var p=PRIEST_PRESETS[name];if(!p)return;
    setCpMajor(p.major.slice());setCpMinor(p.minor.slice());
    setCpAbil(p.abilities.slice());setCpLim(p.limitations.slice());
  }

  function toggle(list,setList,item){
    if(list.indexOf(item)>=0)setList(list.filter(function(x){return x!==item;}));
    else setList(list.concat([item]));
  }

  function genAllRolls(method){
    var numDice=method==="4d6"?4:3;
    return ["Str","Dex","Con","Int","Wis","Cha"].map(function(){
      var r=[];
      for(var i=0;i<numDice;i++){
        var v=Math.floor(Math.random()*6)+1;
        if(method==="3d6r1"&&v===1) v=Math.floor(Math.random()*6)+1;
        r.push(v);
      }
      return r;
    });
  }
  function rollAll(method){
    if(isRolling)return;
    setIsRolling(true);
    setRollModalMethod(method);
    setRollResults(genAllRolls(method));
    setRollKey(function(k){return k+1;});
    setRollModalOpen(true);
  }
  function applyRollResults(assignments){
    var asn=assignments||["Str","Dex","Con","Int","Wis","Cha"];
    var n={};
    rollResults.forEach(function(rolls,si){
      var stat=asn[si];
      if(!stat)return;
      var total;
      if(rollModalMethod==="4d6"){
        var minV=Math.min.apply(null,rolls);
        var minI=rolls.indexOf(minV);
        total=rolls.reduce(function(s,v,i){return s+(i===minI?0:v);},0);
      } else {
        total=rolls.reduce(function(s,v){return s+v;},0);
      }
      n[stat]=total;
    });
    setStats(n);
    setRollModalOpen(false);
    setIsRolling(false);
  }
  function rerollDice(){
    setRollResults(genAllRolls(rollModalMethod));
    setRollKey(function(k){return k+1;});
  }
  function setStat(a,v){var n=Object.assign({},stats);var p=parseInt(v);n[a]=isNaN(p)?0:p;setStats(n);}
  function clampStat(a){setStats(function(prev){var n=Object.assign({},prev);n[a]=Math.max(3,Math.min(25,n[a]||3));return n;});}

  function reloadSpells(e){
    var f=e.target.files[0];if(!f)return;
    var r=new FileReader();
    r.onload=function(ev){
      try{var wb=XLSX.read(ev.target.result,{type:"array"});var all=[];
        wb.SheetNames.forEach(function(n){if(n.toLowerCase().indexOf("summary")>=0)return;
          var rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:""});
          var t=n.toLowerCase().indexOf("priest")>=0?"Priest":"Wizard";
          rows.forEach(function(row){all.push(Object.assign({},row,{_type:t}));});
        });setCompSpells(all);e.target.value="";}catch(err){alert("Error: "+err.message);}
    };r.readAsArrayBuffer(f);
  }

  function addToMemo(s){
    var sl=parseInt(s.Level),sa=adjSlots[sl-1]||0,su=memoCount(sl);
    if(su>=sa) return;
    setMemorized(function(prev){return prev.concat([Object.assign({},s,{prepId:Date.now()+"_"+Math.random()})]);});
  }
  function removeFromMemo(prepId){setMemorized(function(prev){return prev.filter(function(m){return m.prepId!==prepId;});});}
  // Keep toggleMemo as alias for backward compat (used nowhere critical now)
  function toggleMemo(s){addToMemo(s);}
  function isMemo(s){return memorized.some(function(m){return m["Spell Name"]===s["Spell Name"]&&m.Level===s.Level;});}
  function memoInstances(s){return memorized.filter(function(m){return m["Spell Name"]===s["Spell Name"]&&m.Level===s.Level;}).length;}
  function memoCount(lv){return memorized.filter(function(m){return m.Level==lv;}).length;}
  // Open inline cast dialog; pre-fill rounds from SPELL_DURATIONS if known
  function initCast(s){
    var autoRounds=SPELL_DURATIONS[s["Spell Name"]]?SPELL_DURATIONS[s["Spell Name"]](level):0;
    setCastingSpell({prepId:s.prepId,spell:s,rounds:autoRounds});
  }
  // Expend spell with no active tracking (instantaneous effect)
  function castInstant(s){
    if(s.prepId){
      setMemorized(function(prev){return prev.filter(function(m){return m.prepId!==s.prepId;});});
    } else {
      var idx=memorized.findIndex(function(m){return m["Spell Name"]===s["Spell Name"]&&m.Level===s.Level;});
      if(idx>=0) setMemorized(function(prev){return prev.filter(function(_,i){return i!==idx;});});
    }
    setCastingSpell(null);
  }
  // Expend spell and add to active tracking with a round countdown
  function castDuration(s,rounds){
    var dur=rounds>0?rounds:null;
    var cast=Object.assign({},s,{castId:Date.now()+"_"+Math.random(),roundsLeft:dur,totalRounds:dur});
    setActiveCasts(function(prev){return prev.concat([cast]);});
    if(s.prepId){
      setMemorized(function(prev){return prev.filter(function(m){return m.prepId!==s.prepId;});});
    } else {
      var idx=memorized.findIndex(function(m){return m["Spell Name"]===s["Spell Name"]&&m.Level===s.Level;});
      if(idx>=0) setMemorized(function(prev){return prev.filter(function(_,i){return i!==idx;});});
    }
    setCastingSpell(null);
  }
  // Legacy alias used by any remaining references
  function castSpell(s){initCast(s);}
  function dismissCast(castId){
    setActiveCasts(function(prev){return prev.filter(function(c){return c.castId!==castId;});});
  }
  function nextRound(){
    setCombatRound(function(r){return r+1;});
    setActiveCasts(function(prev){
      return prev.map(function(c){
        if(c.roundsLeft===null||c.roundsLeft===undefined) return c;
        return Object.assign({},c,{roundsLeft:c.roundsLeft-1});
      }).filter(function(c){return c.roundsLeft===null||c.roundsLeft===undefined||c.roundsLeft>0;});
    });
  }
  function resetCombat(){
    setCombatRound(1);
    setActiveCasts([]);
  }

  // Spell filtering based on CP selections
  var availableSpells=compSpells.filter(function(s){
    if(classData.spells==="priest"&&s._type!=="Priest")return false;
    if(classData.spells==="wizard"&&s._type!=="Wizard")return false;
    // CP-based sphere filtering for priests
    if(isPriest&&(cpMajor.length>0||cpMinor.length>0)&&s._type==="Priest"){
      var sph=(s.Sphere||"").toLowerCase();var ok=false;
      cpMajor.concat(cpMinor).forEach(function(my){
        var c=my.toLowerCase().replace("elemental (all)","elemental");
        if(sph.indexOf(c)>=0)ok=true;
        if(c==="elemental"&&(sph.indexOf("fire")>=0||sph.indexOf("water")>=0||sph.indexOf("air")>=0||sph.indexOf("earth")>=0||sph.indexOf("magma")>=0||sph.indexOf("ooze")>=0||sph.indexOf("ice")>=0||sph.indexOf("smoke")>=0))ok=true;
      });
      if(sph==="all"||sph.indexOf("all")>=0)ok=true;
      if(!ok)return false;
      // Minor = max L3
      var minorOnly=true;
      cpMajor.forEach(function(my){var c=my.toLowerCase().replace("elemental (all)","elemental");if(sph.indexOf(c)>=0)minorOnly=false;if(c==="elemental"&&(sph.indexOf("fire")>=0||sph.indexOf("water")>=0||sph.indexOf("air")>=0||sph.indexOf("earth")>=0))minorOnly=false;});
      if(sph==="all"||sph.indexOf("all")>=0)minorOnly=false;
      if(minorOnly&&s.Level>3)return false;
    }
    // CP-based school filtering for wizards
    if(isWizard&&cpSchools.length>0&&s._type==="Wizard"){
      var sch=(s.School||"").toLowerCase();var ok2=false;
      cpSchools.forEach(function(my){if(sch.indexOf(my.toLowerCase().split("/")[0])>=0)ok2=true;});
      if(sch.indexOf("universal")>=0)ok2=true;
      if(!ok2)return false;
    }
    if(spellLvlFilter&&s.Level!=parseInt(spellLvlFilter))return false;
    if(spellFilter){var q=spellFilter.toLowerCase();return(s["Spell Name"]||"").toLowerCase().indexOf(q)>=0;}
    return true;
  });

  // Reset character
  async function resetCharacter() {
    setCharName("");setRace("Human");setCls("Druid");setKit("");setLevel(1);setXP(0);setHP(8);setAlign("True Neutral");
    setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setStrPct(0);setMemorized([]);setActiveCasts([]);setCombatRound(1);setCastingSpell(null);setNotes("");
    setCpBudget(120);setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);
    setDmOverride(false);setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);
    setCloudId(null);
  }

  function exportPDF() {
    exportCharacterSheet({
      charName, race, cls, kit, level, hp, align,
      stats, adjStats, thac0, saves, ac, strB, conB, strPct, exStr, effStrB, effStrPct,
      adjSlots, memorized, notes,
      cpBudget, cpSpent, cpRefund,
      cpMajor, cpMinor, cpSchools, cpAbil, cpLim,
      isPriest, isWizard, classData, raceData,
    });
  }

  // ── AI helpers ──────────────────────────────────────────────────────────
  function renderBold(text){
    if(!text)return null;
    var parts=text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map(function(p,i){
      if(p.length>4&&p.startsWith("**")&&p.endsWith("**"))return <strong key={i} style={{color:"#e0c080"}}>{p.slice(2,-2)}</strong>;
      return <span key={i}>{p}</span>;
    });
  }
  function toggleSpellDesc(id){
    setExpandedSpell(function(prev){return prev===id?null:id;});
  }
  var HIDDEN_FIELDS=new Set(["Spell Name","Level","Category","Sphere","School","Damage Dice","_type"]);
  function spellExtraFields(s){
    return Object.keys(s).filter(function(k){return !HIDDEN_FIELDS.has(k)&&s[k]!==""&&s[k]!==null&&s[k]!==undefined;});
  }
  async function doSpellSearch(){
    if(!aiQuery.trim()||aiLoading)return;
    setAiLoading(true);setAiResult("");setAiHighlight([]);
    try{
      await streamSpellSearch(aiQuery,SPELL_DATA,
        function(chunk){setAiResult(function(p){return p+chunk;});},
        function(full){setAiHighlight(extractSpellNames(full));setAiLoading(false);}
      );
    }catch(e){setAiResult("Error: "+e.message);setAiLoading(false);}
  }
  async function doGenChar(){
    if(!genPrompt.trim()||genLoading)return;
    setGenLoading(true);setGenResult(null);
    try{var r=await generateCharacter(genPrompt);setGenResult(r);}catch(e){setGenResult({error:e.message});}
    setGenLoading(false);
  }
  function applyGenerated(r){
    if(!r||r.error)return;
    if(r.name)setCharName(r.name);
    if(r.race&&RACES[r.race])setRace(r.race);
    if(r.cls&&CLASSES[r.cls])changeClass(r.cls);
    if(r.level)setLevel(parseInt(r.level)||1);
    if(r.stats)setStats({Str:r.stats.Str||10,Dex:r.stats.Dex||10,Con:r.stats.Con||10,Int:r.stats.Int||10,Wis:r.stats.Wis||10,Cha:r.stats.Cha||10});
    if(r.strPct)setStrPct(parseInt(r.strPct)||0);
    if(r.align)setAlign(r.align);
    if(r.hp)setHP(parseInt(r.hp)||1);
    if(r.notes)setNotes(r.notes);
    setTab("stats");
  }
  async function doSuggestSpells(){
    if(!genResult||genResult.error||suggestLoading)return;
    setSuggestLoading(true);setSuggestDone(false);setAiHighlight([]);
    try{
      // Determine caster group and max castable spell level
      var genCls=CLASSES[genResult.cls]||{};
      var genGroup=genCls.group||"";
      var genLvl=parseInt(genResult.level)||1;
      // Wizard: roughly ceil(level/2), Priest: similar progression, cap 9
      var maxSpLvl=Math.min(9,Math.ceil(genLvl/2));
      var relevant=SPELL_DATA.filter(function(s){
        if(genGroup==="Wizard"&&s.Sphere&&!s.School)return false;
        if(genGroup==="Priest"&&s.School&&!s.Sphere)return false;
        if(genGroup==="Warrior"||genGroup==="Rogue")return false;
        return parseInt(s.Level)<=maxSpLvl;
      });
      if(relevant.length===0){setSuggestDone(true);setSuggestLoading(false);return;}
      var charInfo={name:genResult.name,race:genResult.race,cls:genResult.cls,level:genResult.level,align:genResult.align};
      var names=await suggestSpellsForCharacter(charInfo,genPrompt,relevant);
      setAiHighlight(names);
      setSuggestDone(true);
    }catch(e){setAiHighlight([{error:e.message}]);setSuggestDone(false);}
    setSuggestLoading(false);
  }
  function createFullCharacter(){
    if(!genResult||genResult.error)return;
    // Apply all character fields
    if(genResult.name)setCharName(genResult.name);
    if(genResult.race&&RACES[genResult.race])setRace(genResult.race);
    if(genResult.cls&&CLASSES[genResult.cls])changeClass(genResult.cls);
    if(genResult.level)setLevel(parseInt(genResult.level)||1);
    if(genResult.stats)setStats({Str:genResult.stats.Str||10,Dex:genResult.stats.Dex||10,Con:genResult.stats.Con||10,Int:genResult.stats.Int||10,Wis:genResult.stats.Wis||10,Cha:genResult.stats.Cha||10});
    if(genResult.strPct)setStrPct(parseInt(genResult.strPct)||0);
    if(genResult.align)setAlign(genResult.align);
    if(genResult.hp)setHP(parseInt(genResult.hp)||1);
    if(genResult.notes)setNotes(genResult.notes);
    // Apply suggested spells to memorized list
    if(aiHighlight.length>0){
      var matched=SPELL_DATA.filter(function(s){return aiHighlight.indexOf(s["Spell Name"])>=0;});
      var withIds=matched.map(function(s){return Object.assign({},s,{prepId:Date.now()+"_"+Math.random()});});
      setMemorized(withIds);
    }
    setActiveCasts([]);setCombatRound(1);
    setTab("stats");
  }

  // ── Character data helpers ───────────────────────────────────────────────
  function getCharacterSnapshot(){
    return {charName,race,cls,kit,level,xp,hp,align,stats,strPct,memorized,notes,
      cpBudget,cpMajor,cpMinor,cpSchools,cpAbil,cpLim,dmOverride,totemAnimal,shapeUsesLeft,shapeFailed,gearItems,_version:1};
  }
  function applyCharacterData(d){
    if(!d)return;
    if(d.charName!==undefined)setCharName(d.charName);
    if(d.race&&RACES[d.race])setRace(d.race);
    if(d.cls&&CLASSES[d.cls])changeClass(d.cls);
    if(d.kit!==undefined)setKit(d.kit);
    if(d.level)setLevel(parseInt(d.level)||1);
    if(d.xp!==undefined)setXP(parseInt(d.xp)||0);
    if(d.hp)setHP(parseInt(d.hp)||1);
    if(d.align)setAlign(d.align);
    if(d.stats)setStats({Str:d.stats.Str||10,Dex:d.stats.Dex||10,Con:d.stats.Con||10,Int:d.stats.Int||10,Wis:d.stats.Wis||10,Cha:d.stats.Cha||10});
    if(d.strPct!==undefined)setStrPct(parseInt(d.strPct)||0);
    if(d.memorized)setMemorized(d.memorized);
    if(d.notes!==undefined)setNotes(d.notes);
    if(d.cpBudget)setCpBudget(d.cpBudget);
    if(d.cpMajor)setCpMajor(d.cpMajor);
    if(d.cpMinor)setCpMinor(d.cpMinor);
    if(d.cpSchools)setCpSchools(d.cpSchools);
    if(d.cpAbil)setCpAbil(d.cpAbil);
    if(d.cpLim)setCpLim(d.cpLim);
    if(d.dmOverride!==undefined)setDmOverride(d.dmOverride);
    if(d.totemAnimal!==undefined)setTotemAnimal(d.totemAnimal);
    if(d.shapeUsesLeft!==undefined)setShapeUsesLeft(d.shapeUsesLeft);
    if(d.shapeFailed!==undefined)setShapeFailed(d.shapeFailed);
    if(d.gearItems)setGearItems(d.gearItems);
  }

  // ── JSON save / load ─────────────────────────────────────────────────────
  function saveJSON(){
    var blob=new Blob([JSON.stringify(getCharacterSnapshot(),null,2)],{type:"application/json"});
    var url=URL.createObjectURL(blob);
    var a=document.createElement("a");
    a.href=url;a.download=(charName||"character").replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"")+".json";
    a.click();URL.revokeObjectURL(url);
  }
  function handleLoadFile(e){
    var file=e.target.files&&e.target.files[0];
    if(!file)return;
    e.target.value="";
    var ext=file.name.split(".").pop().toLowerCase();
    if(ext==="json"){
      var reader=new FileReader();
      reader.onload=function(ev){try{applyCharacterData(JSON.parse(ev.target.result));setCloudStatus("Loaded from file");}catch(_){setCloudStatus("Error: invalid JSON");}};
      reader.readAsText(file);
    } else if(ext==="pdf"){
      var reader2=new FileReader();
      reader2.onload=async function(ev){
        setPdfParsing(true);setCloudStatus("Reading PDF…");
        try{
          var b64=btoa(String.fromCharCode(...new Uint8Array(ev.target.result)));
          var data=await parsePDFCharacter(b64);
          applyCharacterData(data);setCloudStatus("Imported from PDF");
        }catch(err){setCloudStatus("PDF error: "+err.message);}
        setPdfParsing(false);
      };
      reader2.readAsArrayBuffer(file);
    }
  }

  // ── Account / cloud save ─────────────────────────────────────────────────
  async function doAuthSubmit(){
    setAuthLoading(true);setAuthError("");
    try{
      if(authMode==="signup"){
        await signUp(authEmail,authPassword);
        setAuthError("Check your email to confirm your account, then sign in.");
      }else{
        var user=await signIn(authEmail,authPassword);
        setAuthUser(user);
        setAuthEmail("");setAuthPassword("");
        // Immediately load their character list
        await refreshAcctChars();
      }
    }catch(e){setAuthError(e.message);}
    setAuthLoading(false);
  }
  async function doSignOut(){
    try{await signOut();}catch(_){}
    setAuthUser(null);setCloudId(null);setAcctChars([]);setAcctStatus("");
  }
  async function refreshAcctChars(){
    setAcctLoading(true);
    try{var list=await listMyCharacters();setAcctChars(list||[]);}
    catch(e){setAcctStatus("Error: "+e.message);}
    setAcctLoading(false);
  }
  async function openAcctModal(){
    setAcctOpen(true);setAcctStatus("");
    if(authUser)await refreshAcctChars();
  }
  async function cloudSave(){
    if(!authUser){setAcctOpen(true);return;}
    setCloudStatus("Saving…");
    try{
      var rec=await supabaseSave(getCharacterSnapshot(),cloudId||undefined);
      setCloudId(rec.id);
      setCloudStatus("Saved ✓");
      setTimeout(function(){setCloudStatus("");},2500);
      refreshAcctChars();
    }catch(err){setCloudStatus("Error: "+err.message);}
  }
  async function cloneCurrentChar(){
    if(!authUser){setAcctOpen(true);return;}
    setAcctStatus("Cloning…");
    try{
      var snap=getCharacterSnapshot();
      snap.charName=(snap.charName||"Unnamed")+" (Copy)";
      var rec=await supabaseSave(snap); // no existingId → always inserts new
      setCloudId(rec.id);
      setCharName(snap.charName);
      setAcctStatus("Cloned ✓");
      setTimeout(function(){setAcctStatus("");},2500);
      refreshAcctChars();
    }catch(err){setAcctStatus("Error: "+err.message);}
  }
  async function loadAcctChar(id){
    setAcctOpen(false);setCloudStatus("Loading…");
    try{
      var rec=await loadCharacterById(id);
      applyCharacterData(rec.data);
      setCloudId(id);
      setCloudStatus("Loaded ✓");
      setTimeout(function(){setCloudStatus("");},2000);
    }catch(err){setCloudStatus("Error: "+err.message);}
  }
  async function deleteAcctChar(id,e){
    e.stopPropagation();
    try{
      await supabase.from("characters").delete().eq("id",id);
      if(cloudId===id)setCloudId(null);
      setAcctChars(function(l){return l.filter(function(c){return c.id!==id;});});
    }catch(err){setAcctStatus("Error: "+err.message);}
  }

  // Styles
  var g="#c9a84c",bg="#08080d",surf="#111118",brd="#1e1e2e",dim="#666050",txt="#ccc8b8";
  var tabs=["stats","combat","spells","✦ CP","sheet","notes","items","gear","✦ AI"];

  return (
    <div style={{minHeight:"100vh",background:bg,color:txt,fontFamily:"Georgia,serif",display:"flex",flexDirection:"column"}}>
      {rollModalOpen&&<DiceRollerModal
        key={rollKey}
        method={rollModalMethod}
        allRolls={rollResults}
        onApply={applyRollResults}
        onReroll={rerollDice}
        onClose={function(){setRollModalOpen(false);setIsRolling(false);}}
      />}
      {/* Header */}
      <div style={{padding:"10px 16px",borderBottom:"1px solid "+brd,background:"#12111a",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"12px"}}>
          <span style={{fontSize:"16px",color:g,fontWeight:"bold",fontVariant:"small-caps",letterSpacing:"2px"}}>Character Forge</span>
          <span style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>AD&D 2E · PLAYER'S OPTION</span>
        </div>
        <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
          {tabs.map(function(t){var id=t.replace("✦ ","");
            return <button key={t} onClick={function(){setTab(id);}} style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",letterSpacing:"1px",textTransform:"uppercase",background:tab===id?"#1a1a30":"transparent",color:tab===id?g:dim,border:tab===id?"1px solid #2a2a4a":"1px solid transparent"}}>{t}</button>;
          })}
          <button onClick={resetCharacter} style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"#2a1a1a",color:"#a07d7d",border:"1px solid #4e2e2e"}}>NEW</button>
          <button onClick={exportPDF} style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2e4e2e"}}>PDF</button>
          <button onClick={saveJSON} title="Download character as JSON" style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"#1a1a2a",color:"#80a0e0",border:"1px solid #2a2a5a"}}>💾 Save</button>
          <button onClick={function(){loadFileRef.current&&loadFileRef.current.click();}} disabled={pdfParsing} title="Load from JSON or import from PDF" style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"#1a1a2a",color:pdfParsing?"#555":"#80a0e0",border:"1px solid #2a2a5a"}}>{pdfParsing?"…":"📂 Load"}</button>
          <input ref={loadFileRef} type="file" accept=".json,.pdf" onChange={handleLoadFile} style={{display:"none"}} />
          {supabase&&<button onClick={cloudSave} title="Save character to your account" style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a"}}>☁ Save</button>}
          {supabase&&<button onClick={openAcctModal} title="Account & saved characters" style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"#1a1a28",color:authUser?"#80c0e0":"#8080a0",border:"1px solid #2a2a5a"}}>{authUser?"👤 "+authUser.email.split("@")[0]:"👤 Sign In"}</button>}
          <a href="https://github.com/waxerhub/Bill-Greger/blob/claude/access-character-forge-CaPe1/character-forge/GUIDE.md" target="_blank" rel="noopener noreferrer" title="Open feature guide" style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"transparent",color:dim,border:"1px solid transparent",textDecoration:"none"}}>? Guide</a>
        </div>
      </div>
      {/* Status bar */}
      {cloudStatus&&<div style={{padding:"4px 16px",background:"#0a0a18",borderBottom:"1px solid "+brd,fontSize:"11px",color:cloudStatus.startsWith("⚠")||cloudStatus.startsWith("Error")||cloudStatus.includes("error")?"#e08080":"#7db87d",fontFamily:"monospace"}}>{cloudStatus}</div>}
      {/* Account modal */}
      {acctOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={function(){setAcctOpen(false);}}>
        <div style={{background:"#12111a",border:"1px solid "+brd,borderRadius:"8px",padding:"24px",minWidth:"320px",maxWidth:"420px",width:"90%"}} onClick={function(e){e.stopPropagation();}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px"}}>
            <div style={{color:g,fontWeight:"bold",fontVariant:"small-caps",letterSpacing:"1px"}}>My Account</div>
            <button onClick={function(){setAcctOpen(false);}} style={{background:"transparent",border:"none",color:dim,cursor:"pointer",fontSize:"18px",padding:"0 4px"}}>×</button>
          </div>
          {!authUser?(
            /* ── Sign in / sign up form ── */
            <div>
              <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
                {["signin","signup"].map(function(m){
                  return <button key={m} onClick={function(){setAuthMode(m);setAuthError("");}}
                    style={{flex:1,padding:"6px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:authMode===m?"#1a1a30":"transparent",color:authMode===m?g:dim,border:authMode===m?"1px solid #2a2a4a":"1px solid #1a1a2a"}}>
                    {m==="signin"?"Sign In":"Create Account"}
                  </button>;
                })}
              </div>
              <input type="email" value={authEmail} onChange={function(e){setAuthEmail(e.target.value);setAuthError("");}}
                onKeyDown={function(e){if(e.key==="Enter")doAuthSubmit();}}
                placeholder="Email" autoComplete="username"
                style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",background:"#0a0a12",border:"1px solid "+(authError?"#e08080":brd),borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"8px"}}/>
              <input type="password" value={authPassword} onChange={function(e){setAuthPassword(e.target.value);setAuthError("");}}
                onKeyDown={function(e){if(e.key==="Enter")doAuthSubmit();}}
                placeholder="Password" autoComplete={authMode==="signup"?"new-password":"current-password"}
                style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",background:"#0a0a12",border:"1px solid "+(authError?"#e08080":brd),borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"8px"}}/>
              {authError&&<div style={{fontSize:"11px",color:authError.startsWith("Check")?"#7db87d":"#e08080",fontFamily:"monospace",marginBottom:"8px"}}>{authError}</div>}
              <button onClick={doAuthSubmit} disabled={authLoading||!authEmail.trim()||!authPassword.trim()}
                style={{width:"100%",padding:"9px",background:authLoading?"#1a1a28":"#1e1a2e",color:authLoading?dim:g,border:"1px solid "+(authLoading?brd:"#3a2a5a"),borderRadius:"4px",cursor:authLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"12px"}}>
                {authLoading?"Working…":authMode==="signin"?"Sign In":"Create Account"}
              </button>
            </div>
          ):(
            /* ── Signed-in: character list ── */
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                <div style={{fontSize:"11px",color:"#80c0e0",fontFamily:"monospace"}}>{authUser.email}</div>
                <button onClick={doSignOut} style={{padding:"3px 10px",background:"transparent",color:"#a06060",border:"1px solid #4a2a2a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Sign Out</button>
              </div>
              <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
                <button onClick={cloudSave} style={{padding:"4px 10px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>☁ Save Current</button>
                <button onClick={cloneCurrentChar} title="Save a copy of the current character as a new entry" style={{padding:"4px 10px",background:"#1a1a2a",color:"#80a0e0",border:"1px solid #2a2a5a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>⎘ Clone</button>
              </div>
              {acctStatus&&<div style={{fontSize:"11px",color:acctStatus.startsWith("Error")?"#e08080":"#7db87d",fontFamily:"monospace",marginBottom:"8px"}}>{acctStatus}</div>}
              <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px",marginBottom:"6px"}}>SAVED CHARACTERS{acctChars.length>0&&<span style={{color:"#555",fontWeight:"normal",letterSpacing:0}}> ({acctChars.length})</span>}</div>
              {acctChars.length>4&&<input value={acctSearch} onChange={function(e){setAcctSearch(e.target.value);}}
                placeholder="Filter characters…"
                style={{width:"100%",boxSizing:"border-box",padding:"6px 9px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px",fontFamily:"monospace",outline:"none",marginBottom:"8px"}}/>}
              {acctLoading&&<div style={{padding:"16px",textAlign:"center",color:dim,fontSize:"12px",fontFamily:"monospace"}}>Loading…</div>}
              {!acctLoading&&acctChars.length===0&&<div style={{padding:"16px",textAlign:"center",color:dim,fontSize:"12px"}}>No saved characters yet. Hit ☁ Save to save this one.</div>}
              <div style={{maxHeight:"300px",overflowY:"auto"}}>
                {!acctLoading&&acctChars.filter(function(c){
                  return !acctSearch.trim()||(c.name||"").toLowerCase().includes(acctSearch.toLowerCase());
                }).map(function(c){
                  return <div key={c.id} onClick={function(){loadAcctChar(c.id);}}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",marginBottom:"6px",background:surf,border:"1px solid "+(cloudId===c.id?"#3a5a3a":brd),borderRadius:"4px",cursor:"pointer"}}>
                    <div>
                      <div style={{fontSize:"13px",color:txt}}>{c.name||"Unnamed"}{cloudId===c.id&&<span style={{fontSize:"9px",color:"#7db87d",fontFamily:"monospace",marginLeft:"6px"}}>current</span>}</div>
                      <div style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>{new Date(c.updated_at).toLocaleString()}</div>
                    </div>
                    <button onClick={function(e){deleteAcctChar(c.id,e);}} style={{background:"transparent",border:"none",color:"#664444",cursor:"pointer",fontSize:"16px",padding:"0 4px"}}>×</button>
                  </div>;
                })}
                {!acctLoading&&acctSearch.trim()&&acctChars.filter(function(c){return(c.name||"").toLowerCase().includes(acctSearch.toLowerCase());}).length===0&&
                  <div style={{padding:"12px",textAlign:"center",color:dim,fontSize:"12px"}}>No characters match "{acctSearch}".</div>}
              </div>
            </div>
          )}
        </div>
      </div>}
      {/* Character bar */}
      <div style={{padding:"8px 16px",borderBottom:"1px solid "+brd,background:"#0d0d14",display:"flex",gap:"16px",alignItems:"center",flexWrap:"wrap",fontSize:"12px"}}>
        <input value={charName} onChange={function(e){setCharName(e.target.value);}} placeholder="Character Name" style={{padding:"4px 8px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"3px",color:g,fontSize:"14px",fontFamily:"Georgia,serif",width:"160px",outline:"none"}} />
        <span style={{color:dim}}>{race} {cls}{kit?" ("+kit+")":""}</span>
        <span style={{color:dim}}>Lvl {level}</span>
        <span style={{color:"#e08080"}}>HP {effHP}</span>
        <span style={{color:"#80a0e0"}}>AC {effAC}</span>
        <span style={{color:"#e0c080"}}>THAC0 {effThac0}</span>
        {(isPriest||isWizard)&&<span style={{color:cpRemaining<0?"#e06060":cpRemaining===0?"#60e060":"#80a0e0",fontFamily:"monospace",fontSize:"11px"}}>CP: {cpSpent-cpRefund}/{cpBudget}</span>}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px"}}>

        {/* ═══ STATS TAB ═══ */}
        {tab==="stats"&&<div>
          <div style={{display:"flex",gap:"16px",flexWrap:"wrap",marginBottom:"16px"}}>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>RACE</Lbl>
              <select value={race} onChange={function(e){setRace(e.target.value);}} style={ss(brd,txt)}>{Object.keys(RACES).map(function(r){return <option key={r}>{r}</option>;})}</select>
              {Object.keys(raceData.adj).length>0&&<div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>{Object.keys(raceData.adj).map(function(a){var v=raceData.adj[a];return a+(v>0?"+":"")+v;}).join(", ")}</div>}
            </Card>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>CLASS</Lbl>
              <select value={cls} onChange={function(e){changeClass(e.target.value);}} style={ss(brd,txt)}>{Object.keys(CLASSES).map(function(c){return <option key={c}>{c}</option>;})}</select>
              <div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>HD: d{classData.hd} | {classData.group} | CP: {isPriest?120:isWizard?40:0}</div>
            </Card>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>KIT</Lbl>
              {isDruid
                ?<select value={kit} onChange={function(e){setKit(e.target.value);setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);}} style={ss(brd,txt)}>
                  {Object.keys(DRUID_KITS).map(function(k){return <option key={k}>{k}</option>;})}
                </select>
                :<input value={kit} onChange={function(e){setKit(e.target.value);}} placeholder="e.g. Fighter Subclass" style={is(brd,txt)} />}
              {/* stat requirement warning */}
              {isDruid&&kitReqFails.length>0&&<div style={{marginTop:"6px",padding:"6px 8px",background:"#2a1010",border:"1px solid #804040",borderRadius:"4px",fontSize:"10px",color:"#e08080",fontFamily:"monospace"}}>
                ⚠ Stat req not met: {kitReqFails.map(function(s){return s+" "+kitData.req[s];}).join(", ")}
                <label style={{display:"block",marginTop:"4px",color:"#c0a0a0",cursor:"pointer"}}>
                  <input type="checkbox" checked={dmOverride} onChange={function(e){setDmOverride(e.target.checked);}} style={{marginRight:"4px"}} />
                  DM Override
                </label>
              </div>}
              {isDruid&&kitData&&kitData.desc&&<div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>{kitData.desc}</div>}
            </Card>
            {/* Totemic Druid — totem selector + stat block */}
            {isDruid&&kitData&&kitData.totemRequired&&<Card brd={brd} surf={surf}><Lbl dim={dim}>TOTEM ANIMAL</Lbl>
              <select value={totemAnimal} onChange={function(e){setTotemAnimal(e.target.value);setShapeUsesLeft(0);}} style={ss(brd,txt)}>
                <option value="">— select —</option>
                {Object.keys(BEAST_FORMS).map(function(k){return <option key={k}>{k}</option>;})}
              </select>
              {totemForm&&<div style={{marginTop:"8px",padding:"8px",background:"#0a1020",border:"1px solid #2a4060",borderRadius:"4px",fontSize:"10px",fontFamily:"monospace",color:txt}}>
                <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>{totemAnimal} STAT BLOCK</div>
                <div>Size: {totemForm.size} | MV: {totemForm.mv} | AC: {totemForm.ac} | HD: {totemForm.hd}</div>
                <div style={{marginTop:"4px",color:dim}}>Attacks:</div>
                {totemForm.attacks.map(function(a,i){return <div key={i} style={{paddingLeft:"8px"}}>• {a.name}: {a.dmg}</div>;})}
                {totemForm.special&&<div style={{marginTop:"4px",color:"#a080e0"}}>Special: {totemForm.special}</div>}
                <div style={{marginTop:"6px",borderTop:"1px solid #2a4060",paddingTop:"4px"}}>
                  <span style={{color:dim}}>Shape Uses: </span>
                  <span style={{color:shapeUsesLeft>0?"#7a7":"#a77"}}>{shapeUsesLeft}/{shapeshifterMaxUses}</span>
                  <button onClick={function(){setShapeUsesLeft(function(p){return Math.min(p+1,shapeshifterMaxUses);});}} style={{marginLeft:"8px",background:"#1a2a1a",color:"#7a7",border:"1px solid #3a5a3a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>+Use</button>
                  <button onClick={function(){setShapeUsesLeft(0);}} style={{marginLeft:"4px",background:"#1a1a2a",color:dim,border:"1px solid #3a3a5a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>Reset</button>
                </div>
              </div>}
            </Card>}
            {/* Shapeshifter kit tracker */}
            {isDruid&&kitData&&kitData.shapeshifter&&<Card brd={brd} surf={surf}><Lbl dim={dim}>SHAPECHANGE TRACKER</Lbl>
              <div style={{fontSize:"11px",fontFamily:"monospace",color:txt}}>
                <div style={{marginBottom:"4px"}}>
                  <span style={{color:dim}}>Uses today: </span>
                  <span style={{color:shapeUsesLeft<shapeshifterMaxUses?"#7a7":"#a77"}}>{shapeUsesLeft}/{shapeshifterMaxUses}</span>
                  <button onClick={function(){setShapeUsesLeft(function(p){return Math.min(p+1,shapeshifterMaxUses);});}} style={{marginLeft:"8px",background:"#1a2a1a",color:"#7a7",border:"1px solid #3a5a3a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>+1</button>
                  <button onClick={function(){setShapeUsesLeft(0);setShapeFailed(0);}} style={{marginLeft:"4px",background:"#1a1a2a",color:dim,border:"1px solid #3a3a5a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>Reset</button>
                </div>
                {level>=7&&<div style={{marginBottom:"4px",color:"#a0c0e0",fontSize:"10px"}}>✦ Partial forms available at this level</div>}
                <div>
                  <span style={{color:dim}}>Failed attempts: </span>
                  <span style={{color:shapeFailed>0?"#e08040":dim}}>{shapeFailed}</span>
                  <span style={{color:"#a77",marginLeft:"6px",fontSize:"10px"}}>{shapeFailed>0?"("+Math.min(shapeFailed*5,100)+"% stuck chance)":""}</span>
                  <button onClick={function(){setShapeFailed(function(p){return p+1;});}} style={{marginLeft:"8px",background:"#2a1a1a",color:"#e08040",border:"1px solid #5a3a2a",borderRadius:"3px",padding:"1px 6px",cursor:"pointer",fontSize:"10px"}}>+Fail</button>
                </div>
              </div>
            </Card>}
            <Card brd={brd} surf={surf}><Lbl dim={dim}>LEVEL</Lbl>
  <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
    <button onClick={function(){setLevel(function(p){return Math.max(1,p-1);});}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>−</button>
    <input type="text" inputMode="numeric" value={level===0?"":String(level)}
      onChange={function(e){
        var v=e.target.value;
        if(v===""){setLevel(0);return;}
        var n=parseInt(v);
        if(!isNaN(n))setLevel(n);
      }}
      onBlur={function(){setLevel(function(p){return Math.max(1,Math.min(20,p||1));});}}
      style={Object.assign({},is(brd,txt),{width:"44px",textAlign:"center"})} />
    <button onClick={function(){setLevel(function(p){return Math.min(20,p+1);});}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>+</button>
  </div>
  <div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>1–20</div>
</Card>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>EXPERIENCE</Lbl>
  {(function(){
    var nextXP=xpToNextLevel(cls,level);
    var thisXP=xpForLevel(cls,level);
    var pct=nextXP?Math.min(100,Math.round(((xp-thisXP)/(nextXP-thisXP))*100)):100;
    var canLevel=nextXP!==null&&xp>=nextXP;
    return <div>
      <div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"wrap"}}>
        <input type="text" inputMode="numeric" value={xp===0?"0":String(xp)}
          onChange={function(e){var n=parseInt(e.target.value.replace(/[^0-9]/g,""));setXP(isNaN(n)?0:n);}}
          style={Object.assign({},is(brd,txt),{width:"80px",textAlign:"center"})} />
        <button onClick={function(){setXP(function(p){return p+100;});}} title="+100 XP"
          style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"3px",padding:"1px 5px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>+100</button>
        <button onClick={function(){setXP(function(p){return p+500;});}} title="+500 XP"
          style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"3px",padding:"1px 5px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>+500</button>
        <button onClick={function(){setXP(function(p){return p+1000;});}} title="+1,000 XP"
          style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"3px",padding:"1px 5px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>+1k</button>
      </div>
      {nextXP!==null&&<div style={{marginTop:"6px"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px",color:dim,fontFamily:"monospace",marginBottom:"3px"}}>
          <span>{fmt(xp)} / {fmt(nextXP)} XP</span>
          <span style={{color:canLevel?"#7db87d":dim}}>{canLevel?"LEVEL UP!":pct+"%"}</span>
        </div>
        <div style={{height:"4px",background:brd,borderRadius:"2px",overflow:"hidden"}}>
          <div style={{height:"100%",width:pct+"%",background:canLevel?"#7db87d":"#4a6a8a",borderRadius:"2px",transition:"width 0.3s"}} />
        </div>
      </div>}
      {nextXP===null&&<div style={{fontSize:"10px",color:"#c9a84c",fontFamily:"monospace",marginTop:"4px"}}>Max level</div>}
    </div>;
  })()}
</Card>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>HIT POINTS</Lbl>
  <div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"wrap"}}>
    <input type="text" inputMode="numeric" value={hp===0?"":String(hp)}
      onChange={function(e){
        var v=e.target.value;
        if(v===""){ setHP(0); return; }
        var n=parseInt(v);
        if(!isNaN(n))setHP(n);
      }}
      onBlur={function(){if(hp<1)setHP(1);}}
      style={Object.assign({},is(brd,txt),{width:"64px",textAlign:"center"})} />
    <button onClick={function(){setHP(function(p){return Math.max(1,p-1);});}} title="−1"
      style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>−</button>
    <button onClick={function(){setHP(function(p){return p+1;});}} title="+1"
      style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",lineHeight:"1",padding:"0"}}>+</button>
    <button onClick={function(){
      var hd=classData.hd||6;
      var total=0;
      for(var i=0;i<level;i++){total+=Math.floor(Math.random()*hd)+1+conB;}
      setHP(Math.max(level,total));
    }} title={"Roll "+level+"d"+classData.hd+(conB!==0?"+"+(conB*level):"")}
      style={{background:"#1a2a1a",color:"#7a7",border:"1px solid #3a5a3a",borderRadius:"4px",padding:"2px 6px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace",whiteSpace:"nowrap"}}>
      ROLL {level}d{classData.hd}{conB!==0&&(conB>0?"+":"")+conB+"/die"}
    </button>
  </div>
  <div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>Con: {conB>=0?"+":""}{conB}/die | d{classData.hd} HD</div>
</Card>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>ALIGNMENT</Lbl>
              <select value={align} onChange={function(e){setAlign(e.target.value);}} style={ss(brd,txt)}>{["Lawful Good","Lawful Neutral","Lawful Evil","Neutral Good","True Neutral","Neutral Evil","Chaotic Good","Chaotic Neutral","Chaotic Evil"].map(function(a){return <option key={a}>{a}</option>;})}</select>
            </Card>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",flexWrap:"wrap",gap:"6px"}}>
            <Lbl dim={dim}>ABILITY SCORES</Lbl>
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              <button onClick={function(){rollAll("3d6");}} title="Classic: roll 3 dice, take sum"
                style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,padding:"4px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>3d6</button>
              <button onClick={function(){rollAll("3d6r1");}} title="Roll 3d6, reroll any 1s once"
                style={{background:"#1a1a28",color:"#a0c0e0",border:"1px solid #3a5a7a",padding:"4px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>3d6 reroll 1s</button>
              <button onClick={function(){rollAll("4d6");}} title="Roll 4 dice, drop the lowest"
                style={{background:"#1a2a1a",color:g,border:"1px solid "+brd,padding:"4px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace"}}>4d6 drop lowest</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"8px"}}>
            {["Str","Dex","Con","Int","Wis","Cha"].map(function(a){var adj=raceData.adj[a]||0;
              var showPct=a==="Str"&&classData.group==="Warrior"&&(stats[a]+(raceData.adj[a]||0))===18;
              return <div key={a} style={{background:surf,border:"1px solid "+(showPct?"#e0c080":brd),borderRadius:"6px",padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",marginBottom:"4px"}}>{a.toUpperCase()}</div>
                <input type="text" inputMode="numeric" value={stats[a]===0?"":String(stats[a])}
                  onChange={function(e){setStat(a,e.target.value);}}
                  onBlur={function(){clampStat(a);}}
                  style={{width:"50px",textAlign:"center",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:g,fontSize:"20px",fontWeight:"bold",fontFamily:"Georgia,serif",outline:"none",padding:"4px"}} />
                <div style={{display:"flex",justifyContent:"center",gap:"4px",marginTop:"4px"}}>
                  <button onClick={function(){setStat(a,Math.max(3,stats[a]-1));}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"3px",width:"20px",height:"20px",cursor:"pointer",fontSize:"13px",lineHeight:"1",padding:"0"}}>−</button>
                  <button onClick={function(){setStat(a,Math.min(25,stats[a]+1));}} style={{background:"#1a1a28",color:dim,border:"1px solid "+brd,borderRadius:"3px",width:"20px",height:"20px",cursor:"pointer",fontSize:"13px",lineHeight:"1",padding:"0"}}>+</button>
                </div>
                {adj!==0&&<div style={{fontSize:"10px",color:adj>0?"#7a7":"#a77",fontFamily:"monospace",marginTop:"2px"}}>{adj>0?"+":""}{adj} = {stats[a]+adj}</div>}
                {showPct&&<div style={{marginTop:"4px",borderTop:"1px solid #554400",paddingTop:"4px"}}>
                  <div style={{fontSize:"9px",color:"#e0c080",marginBottom:"2px"}}>EXCEPTIONAL %</div>
                  <input type="number" value={strPct||""} placeholder="1-100" onChange={function(e){var v=parseInt(e.target.value)||0;setStrPct(Math.min(100,Math.max(0,v)));}} min="1" max="100" style={{width:"50px",textAlign:"center",background:"#0a0a12",border:"1px solid #e0c080",borderRadius:"4px",color:"#e0c080",fontSize:"14px",fontWeight:"bold",fontFamily:"monospace",outline:"none",padding:"2px"}} />
                  {strPct>0&&<div style={{fontSize:"8px",color:"#e0c080",marginTop:"2px"}}>{strPct===100?"18/00":"18/"+String(strPct).padStart(2,"0")}</div>}
                </div>}
                {a==="Wis"&&wisSpellFail>0&&<div style={{marginTop:"3px",fontSize:"8px",color:"#c06060",fontFamily:"monospace"}}>{wisSpellFail}% spell fail</div>}
                {a==="Wis"&&wisAdj!==0&&<div style={{marginTop:"2px",fontSize:"8px",color:wisAdj>0?"#a080e0":"#e080a0",fontFamily:"monospace"}}>{wisAdj>0?"+":""}{wisAdj} vs magic</div>}
                {a==="Wis"&&wisImm.length>0&&<div style={{marginTop:"3px",borderTop:"1px solid #3a2a4a",paddingTop:"3px",fontSize:"8px",color:"#c080e0",fontFamily:"monospace"}}>✦ {wisImm.length} spell immune</div>}
              </div>;
            })}
          </div>
        </div>}

        {/* ═══ COMBAT TAB ═══ */}
        {tab==="combat"&&<div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:"10px",marginBottom:"20px"}}>
            <SB label="THAC0" value={effThac0} color="#e0c080" sub={"Hit: "+(strB.hit>=0?"+":"")+strB.hit+(gearThac0?" Gear:"+(gearThac0>0?"+":"")+gearThac0:"")} />
            <SB label="AC" value={effAC} color="#80a0e0" sub={"Dex: "+dexAC(adjStats.Dex)+(gearAC?" Gear:"+(gearAC>0?"+":"")+gearAC:"")} />
            <SB label="HP" value={effHP} color="#e08080" sub={"d"+classData.hd+(gearHP?" +"+gearHP+" gear":"")} />
            <SB label="DMG ADJ" value={(effStrB.dmg+gearDmg>=0?"+":"")+(effStrB.dmg+gearDmg)} color="#e0a080" sub={exStr?"18/"+(strPct===100?"00":String(strPct).padStart(2,"0")):"Str "+adjStats.Str} />
          </div>
          <Lbl dim={dim}>SAVING THROWS</Lbl>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"8px",marginBottom:"20px"}}>
            {Object.keys(effSaves).map(function(s){var n={Para:"Para/Poison",Rod:"Rod/Staff",Pet:"Petrify",Breath:"Breath",Spell:"Spell"};
              return <div key={s} style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"8px",textAlign:"center"}}><div style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>{n[s]}</div><div style={{fontSize:"18px",color:g,fontWeight:"bold",marginTop:"4px"}}>{effSaves[s]}</div></div>;
            })}
          </div>
          {adjSlots.length>0&&<div><Lbl dim={dim}>SPELL SLOTS</Lbl><div style={{display:"flex",gap:"8px",marginBottom:"10px"}}>{adjSlots.map(function(s,i){var u=memoCount(i+1);return <div key={i} style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"8px 12px",textAlign:"center",minWidth:"50px"}}><div style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>LVL {i+1}</div><div style={{fontSize:"16px",color:u>=s?"#e08080":g,fontWeight:"bold"}}>{u}/{s}</div></div>;})}</div></div>}
          {memorized.length>0&&<div><Lbl dim={dim}>MEMORIZED ({memorized.length})</Lbl><div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>{memorized.sort(function(a,b){return a.Level-b.Level;}).map(function(s,i){return <span key={i} onClick={function(){toggleMemo(s);}} style={{padding:"4px 10px",background:"#1a1a28",border:"1px solid #2a2a4a",borderRadius:"4px",fontSize:"11px",cursor:"pointer",color:txt}}><span style={{color:dim,fontFamily:"monospace",marginRight:"4px"}}>L{s.Level}</span>{s["Spell Name"]}<span style={{color:"#a66",marginLeft:"6px"}}>✕</span></span>;})}</div></div>}
        </div>}

        {/* ═══ SPELLS TAB ═══ */}
        {tab==="spells"&&<div>
          <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px",padding:"8px 12px",background:surf,border:"1px solid "+brd,borderRadius:"6px"}}>
            <span style={{fontSize:"11px",color:g,fontFamily:"monospace"}}>{compSpells.length} spells</span>
            {(cpMajor.length>0||cpMinor.length>0||cpSchools.length>0)&&<span style={{fontSize:"11px",color:"#80a0e0",fontFamily:"monospace"}}>Filtered by CP</span>}
            <button onClick={function(){fr.current&&fr.current.click();}} style={{marginLeft:"auto",background:"#141428",color:"#80a0e0",border:"1px solid #2a2a5a",padding:"4px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>⟳ Reload XLSX</button>
            <input ref={fr} type="file" accept=".xlsx" onChange={reloadSpells} style={{display:"none"}} />
          </div>
          {/* ── Round Counter ── */}
          <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px",padding:"6px 12px",background:"#0e0e1e",border:"1px solid #2a2a4a",borderRadius:"6px"}}>
            <span style={{fontSize:"11px",color:dim,fontFamily:"monospace"}}>COMBAT ROUND</span>
            <span style={{fontSize:"18px",color:"#e0c080",fontWeight:"bold",fontFamily:"monospace",minWidth:"32px",textAlign:"center"}}>{combatRound}</span>
            <button onClick={nextRound} style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",padding:"3px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>⏭ Next Round</button>
            <button onClick={resetCombat} style={{background:"#1a1a1a",color:dim,border:"1px solid #333",padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>↺ Reset</button>
          </div>

          {/* ── Active Casts ── */}
          {activeCasts.length>0&&<div style={{marginBottom:"10px",border:"1px solid #2a3a2a",borderRadius:"6px",overflow:"hidden"}}>
            <div style={{background:"#0d1a0d",padding:"5px 12px",fontSize:"10px",color:"#7db87d",fontFamily:"monospace",letterSpacing:"1px"}}>ACTIVE SPELLS</div>
            {activeCasts.map(function(c){
              var pct=c.totalRounds>0?Math.round((c.roundsLeft/c.totalRounds)*100):100;
              var barColor=pct>60?"#3a7a3a":pct>30?"#7a7a20":"#7a2020";
              var label=c.roundsLeft===null||c.roundsLeft===undefined?"∞ ongoing":(c.roundsLeft+" rd"+(c.roundsLeft!==1?"s":"")+" / "+c.totalRounds);
              var aName=c["Spell Name"];var aId="act_"+c.castId;var aOpen=expandedSpell===aId;
              return <div key={c.castId} style={{borderBottom:"1px solid #1a2a1a",background:aOpen?"#0a120a":"transparent"}}>
                <div style={{padding:"5px 12px",display:"flex",alignItems:"center",gap:"8px"}}>
                  <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{c.Level}</span>
                  <span style={{fontSize:"12px",color:"#c9e8c9",flex:1}}>{aName}</span>
                  {c.totalRounds>0&&<div style={{width:"60px",height:"6px",background:"#0a0a12",borderRadius:"3px",overflow:"hidden"}}>
                    <div style={{width:Math.max(0,pct)+"%",height:"100%",background:barColor,borderRadius:"3px",transition:"width 0.3s"}} />
                  </div>}
                  <span style={{fontSize:"10px",color:pct>60?"#7db87d":pct>30?"#c0c040":"#c06060",fontFamily:"monospace",minWidth:"70px",textAlign:"right"}}>{label}</span>
                  <button onClick={function(){toggleSpellDesc(aId);}} title="Show description" style={{background:"transparent",border:"none",color:aOpen?g:dim,cursor:"pointer",fontSize:"12px",padding:"0 4px",lineHeight:1}}>{aOpen?"▼":"▶"}</button>
                  <button onClick={function(){dismissCast(c.castId);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>×</button>
                </div>
                {aOpen&&<div style={{padding:"4px 14px 8px 44px",fontSize:"11px",color:"#b8b4a8",lineHeight:"1.6",fontStyle:"italic"}}>
                  {(function(){var ef=spellExtraFields(c);
                    if(ef.length===0)return <span style={{color:dim,fontFamily:"monospace"}}>No additional data — upload a richer XLSX to see spell details</span>;
                    return ef.map(function(k){return <div key={k} style={{marginBottom:"2px"}}><span style={{color:dim,fontFamily:"monospace",marginRight:"6px"}}>{k}:</span><span style={{fontStyle:"normal",color:txt}}>{String(c[k])}</span></div>;});
                  })()}
                </div>}
              </div>;
            })}
          </div>}

          {/* ── Prepared Spells ── */}
          {memorized.length>0&&<div style={{marginBottom:"10px",border:"1px solid #2a2a3a",borderRadius:"6px",overflow:"hidden"}}>
            <div style={{background:"#0d0d1a",padding:"5px 12px",fontSize:"10px",color:g,fontFamily:"monospace",letterSpacing:"1px",display:"flex",justifyContent:"space-between"}}>
              <span>PREPARED</span>
              <span style={{color:dim}}>{memorized.length} spell{memorized.length!==1?"s":""}</span>
            </div>
            {memorized.slice().sort(function(a,b){return a.Level-b.Level;}).map(function(s,i){
              var isBuff=!!BUFF_SPELLS[s["Spell Name"]];
              var durFn=SPELL_DURATIONS[s["Spell Name"]];
              var durLabel=durFn?(" · "+durFn(level)+" rds"):"";
              var isCasting=castingSpell&&castingSpell.prepId===s.prepId;
              var pName=s["Spell Name"];var pId="prep_"+(s.prepId||i);var pOpen=expandedSpell===pId;
              return <div key={i} style={{borderBottom:"1px solid "+(isCasting?"#2a3a1e":"#1e1e2e"),background:isCasting?"#0d1a0d":pOpen?"#0e0e1c":"transparent"}}>
                <div style={{padding:"5px 12px",display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                  <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"18px"}}>L{s.Level}</span>
                  <span style={{fontSize:"12px",color:g,flex:1}}>{pName}{isBuff&&<span style={{fontSize:"9px",color:"#80c0e0",marginLeft:"4px"}}>buff{durLabel}</span>}</span>
                  {isCasting
                    ?<div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"wrap"}}>
                      <button onClick={function(){castInstant(s);}} title="Resolve immediately, expend slot" style={{background:"#1a1a2a",color:"#c0a060",border:"1px solid #3a3a20",padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>⚡ Instant</button>
                      <span style={{color:dim,fontSize:"10px"}}>or</span>
                      <input type="number" min="1" value={castingSpell.rounds||""} placeholder="rds" onChange={function(e){setCastingSpell(function(p){return Object.assign({},p,{rounds:parseInt(e.target.value)||0});});}} style={{width:"38px",background:"#0a0a12",border:"1px solid #2a4a2a",borderRadius:"3px",color:"#7db87d",fontSize:"11px",textAlign:"center",padding:"2px 4px",fontFamily:"monospace"}} />
                      <button onClick={function(){castDuration(s,castingSpell.rounds);}} disabled={!castingSpell.rounds} title="Track duration" style={{background:castingSpell.rounds?"#1a2a1a":"#111",color:castingSpell.rounds?"#7db87d":"#444",border:"1px solid "+(castingSpell.rounds?"#2a4a2a":"#222"),padding:"2px 8px",borderRadius:"3px",cursor:castingSpell.rounds?"pointer":"not-allowed",fontSize:"11px",fontFamily:"monospace"}}>⏱ Track</button>
                      <button onClick={function(){setCastingSpell(null);}} style={{background:"transparent",color:dim,border:"none",cursor:"pointer",fontSize:"12px",padding:"0 2px"}}>✕</button>
                    </div>
                    :<button onClick={function(){initCast(s);}} style={{background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",padding:"2px 8px",borderRadius:"3px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>⚡ Cast</button>}
                  <button onClick={function(){toggleSpellDesc(pId);}} title="Show description" style={{background:"transparent",border:"none",color:pOpen?g:dim,cursor:"pointer",fontSize:"12px",padding:"0 4px",lineHeight:1}}>{pOpen?"▼":"▶"}</button>
                  {!isCasting&&<button onClick={function(){removeFromMemo(s.prepId);}} style={{background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px",padding:"0 2px",lineHeight:"1"}}>×</button>}
                </div>
                {pOpen&&<div style={{padding:"4px 14px 8px 44px",fontSize:"11px",color:"#b8b4a8",lineHeight:"1.6",fontStyle:"italic"}}>
                  {(function(){var ef=spellExtraFields(s);
                    if(ef.length===0)return <span style={{color:dim,fontFamily:"monospace"}}>No additional data — upload a richer XLSX to see spell details</span>;
                    return ef.map(function(k){return <div key={k} style={{marginBottom:"2px"}}><span style={{color:dim,fontFamily:"monospace",marginRight:"6px"}}>{k}:</span><span style={{fontStyle:"normal",color:txt}}>{String(s[k])}</span></div>;});
                  })()}
                </div>}
              </div>;
            })}
          </div>}

          <div style={{display:"flex",gap:"8px",marginBottom:"12px",flexWrap:"wrap",alignItems:"center"}}>
            <input value={spellFilter} onChange={function(e){setSpellFilter(e.target.value);}} placeholder="Search…" style={Object.assign({},is(brd,txt),{width:"200px"})} />
            <select value={spellLvlFilter} onChange={function(e){setSpellLvlFilter(e.target.value);}} style={ss(brd,txt)}><option value="">All Levels</option>{[1,2,3,4,5,6,7,8,9].map(function(l){return <option key={l} value={l}>L{l}</option>;})}</select>
            <span style={{fontSize:"11px",color:dim,fontFamily:"monospace"}}>{availableSpells.length} spells</span>
          </div>
          <div style={{maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
            {availableSpells.slice(0,150).map(function(s,i){
              var n=memoInstances(s);var sl=parseInt(s.Level),sa=adjSlots[sl-1]||0,su=memoCount(sl);var full=su>=sa;
              var cc=s.Category==="Combat"?"#e08080":s.Category==="Support"?"#80e080":"#8080e0";
              var isHighlighted=aiHighlight.length>0&&aiHighlight.indexOf(s["Spell Name"])>=0;
              var name=s["Spell Name"];
              var compId="comp_"+i;var isOpen=expandedSpell===compId;
              return <div key={i} style={{borderBottom:"1px solid "+brd,background:isHighlighted?"#1a1a0a":isOpen?"#111120":undefined,boxShadow:isHighlighted?"inset 0 0 0 1px #6a5a20":undefined,opacity:full&&!n?0.4:1}}>
                <div style={{padding:"6px 12px",display:"flex",alignItems:"center",gap:"10px"}}>
                  <button onClick={function(){addToMemo(s);}} disabled={full} style={{background:n>0?"#2a3a2a":"#1a1a28",color:n>0?"#7a7":dim,border:"1px solid "+(n>0?"#3a5a3a":brd),padding:"2px 8px",borderRadius:"3px",cursor:full?"not-allowed":"pointer",fontSize:"11px",fontFamily:"monospace",minWidth:"32px"}}>{n>0?"+"+n:"+"}</button>
                  <span style={{fontSize:"11px",color:dim,fontFamily:"monospace",minWidth:"20px"}}>L{s.Level}</span>
                  <span style={{fontSize:"12px",color:n>0?g:txt,flex:1}}>{name}</span>
                  <span style={{fontSize:"9px",color:cc,fontFamily:"monospace"}}>{s.Category}</span>
                  {s["Damage Dice"]&&<span style={{fontSize:"9px",color:"#e08080",fontFamily:"monospace"}}>{s["Damage Dice"]}</span>}
                  <button onClick={function(){toggleSpellDesc(compId);}} title="Show description" style={{background:"transparent",border:"none",color:isOpen?g:dim,cursor:"pointer",fontSize:"12px",padding:"0 4px",lineHeight:1}}>{isOpen?"▼":"▶"}</button>
                </div>
                {isOpen&&<div style={{padding:"6px 14px 10px 58px",fontSize:"11px",color:"#b8b4a8",lineHeight:"1.6",fontStyle:"italic"}}>
                  {(function(){var ef=spellExtraFields(s);
                    if(ef.length===0)return <span style={{color:dim,fontFamily:"monospace"}}>No additional data — upload a richer XLSX to see spell details</span>;
                    return ef.map(function(k){return <div key={k} style={{marginBottom:"2px"}}><span style={{color:dim,fontFamily:"monospace",marginRight:"6px"}}>{k}:</span><span style={{fontStyle:"normal",color:txt}}>{String(s[k])}</span></div>;});
                  })()}
                </div>}
              </div>;
            })}
            {availableSpells.length>150&&<div style={{padding:"12px",textAlign:"center",color:dim,fontSize:"12px"}}>Showing 150 of {availableSpells.length}</div>}
          </div>
        </div>}

        {/* ═══ CP TAB ═══ */}
        {tab==="CP"&&<div>
          {/* Budget */}
          <div style={{background:surf,border:"1px solid "+brd,borderRadius:"8px",padding:"14px",marginBottom:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
              <div><span style={{fontSize:"13px",color:g,fontWeight:"bold",fontVariant:"small-caps"}}>CP Budget</span><span style={{fontSize:"10px",color:dim,fontFamily:"monospace",marginLeft:"8px"}}>{isPriest?"Priest (120 base)":isWizard?"Wizard (40 base)":"N/A"}</span></div>
              <input type="number" value={cpBudget} onChange={function(e){setCpBudget(Math.max(0,parseInt(e.target.value)||0));}} style={{width:"60px",textAlign:"center",padding:"4px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:g,fontSize:"16px",fontWeight:"bold",fontFamily:"monospace",outline:"none"}} />
            </div>
            <div style={{display:"flex",gap:"20px",marginTop:"8px",fontSize:"12px",fontFamily:"monospace"}}>
              <span style={{color:"#e08060"}}>Spent: {cpSpent}</span>
              <span style={{color:"#60a060"}}>Refund: {cpRefund}</span>
              <span style={{color:cpRemaining<0?"#e06060":cpRemaining===0?"#60e060":"#80c0e0",fontWeight:"bold"}}>Remaining: {cpRemaining}</span>
            </div>
            <div style={{marginTop:"6px",height:"6px",background:"#0a0a12",borderRadius:"3px",overflow:"hidden"}}>
              <div style={{height:"100%",width:Math.min(100,Math.max(0,((cpSpent-cpRefund)/Math.max(1,cpBudget))*100))+"%",background:cpRemaining<0?"#e06060":"#60a060",borderRadius:"3px"}} />
            </div>
          </div>

          {/* Presets (priest only) */}
          {isPriest&&<div style={{marginBottom:"12px",display:"flex",gap:"6px",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>PRESETS:</span>
            {Object.keys(PRIEST_PRESETS).map(function(n){return <button key={n} onClick={function(){loadPreset(n);}} style={{padding:"4px 12px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace",background:"#1a1a28",color:g,border:"1px solid "+brd}}>{n} ({PRIEST_PRESETS[n].cost})</button>;})}
            <button onClick={function(){setCpMajor([]);setCpMinor([]);setCpAbil([]);setCpLim([]);}} style={{padding:"4px 12px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace",background:"#2a1a1a",color:"#e08080",border:"1px solid #4a2a2a"}}>CLEAR</button>
          </div>}

          {/* Wizard schools or Priest spheres */}
          {isWizard&&<div style={{marginBottom:"12px"}}>
            <Lbl dim={dim}>SCHOOLS OF MAGIC <span style={{color:g}}>(5 CP each, Universal is free)</span></Lbl>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"6px"}}>
              {WIZARD_SCHOOLS.map(function(sch){var on=cpSchools.indexOf(sch)>=0;
                return <label key={sch} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 10px",cursor:"pointer",fontSize:"12px",background:on?"#1a2a18":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?g:dim}}>
                  <input type="checkbox" checked={on} onChange={function(){toggle(cpSchools,setCpSchools,sch);}} style={{accentColor:g}} />
                  <span style={{flex:1}}>{sch}</span><span style={{fontFamily:"monospace",fontSize:"10px",color:"#e08060"}}>5 CP</span>
                </label>;
              })}
            </div>
            <div style={{marginTop:"4px",fontSize:"10px",color:dim,fontFamily:"monospace"}}>{cpSchools.length} schools = {cpSchools.length*5} CP (+ Universal free)</div>
          </div>}

          {isPriest&&<div style={{marginBottom:"12px"}}>
            <Lbl dim={dim}>SPHERES OF ACCESS <span style={{color:g}}>(Table 6)</span></Lbl>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"4px"}}>
              {SPHERE_NAMES.map(function(sp){var c=SPHERE_COSTS[sp];var isMaj=cpMajor.indexOf(sp)>=0;var isMin=cpMinor.indexOf(sp)>=0;
                return <div key={sp} style={{display:"flex",alignItems:"center",gap:"4px",padding:"3px 8px",background:isMaj?"#1a2a18":isMin?"#18202a":surf,border:"1px solid "+(isMaj?"#3a5a3a":isMin?"#2a3a5a":brd),borderRadius:"4px",fontSize:"11px"}}>
                  <span style={{flex:1,color:isMaj?g:isMin?"#80c0e0":dim}}>{sp}</span>
                  <button onClick={function(){if(isMaj){setCpMajor(cpMajor.filter(function(x){return x!==sp;}));}else{setCpMinor(cpMinor.filter(function(x){return x!==sp;}));setCpMajor(cpMajor.concat([sp]));}}} style={{padding:"1px 5px",fontSize:"9px",fontFamily:"monospace",borderRadius:"3px",cursor:"pointer",background:isMaj?"#2a4a2a":"#1a1a28",color:isMaj?"#7a7":dim,border:"1px solid "+(isMaj?"#4a6a4a":brd)}}>M{c.M}</button>
                  <button onClick={function(){if(isMin){setCpMinor(cpMinor.filter(function(x){return x!==sp;}));}else{setCpMajor(cpMajor.filter(function(x){return x!==sp;}));setCpMinor(cpMinor.concat([sp]));}}} style={{padding:"1px 5px",fontSize:"9px",fontFamily:"monospace",borderRadius:"3px",cursor:"pointer",background:isMin?"#1a2a4a":"#1a1a28",color:isMin?"#80c0e0":dim,border:"1px solid "+(isMin?"#2a4a6a":brd)}}>m{c.m}</button>
                  {(isMaj||isMin)&&<button onClick={function(){setCpMajor(cpMajor.filter(function(x){return x!==sp;}));setCpMinor(cpMinor.filter(function(x){return x!==sp;}));}} style={{padding:"1px 3px",fontSize:"9px",color:"#a66",background:"transparent",border:"none",cursor:"pointer"}}>✕</button>}
                </div>;
              })}
            </div>
          </div>}

          {/* Abilities */}
          {(isPriest||isWizard)&&<div style={{marginBottom:"12px"}}>
            <Lbl dim={dim}>ABILITIES</Lbl>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
              {Object.keys(activeAbilities).map(function(a){var d=activeAbilities[a];var on=cpAbil.indexOf(a)>=0;
                return <label key={a} style={{display:"flex",alignItems:"center",gap:"6px",padding:"3px 8px",cursor:"pointer",fontSize:"11px",background:on?"#1a2a18":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:dim}}>
                  <input type="checkbox" checked={on} onChange={function(){toggle(cpAbil,setCpAbil,a);}} style={{accentColor:g}} />
                  <span style={{flex:1}}>{a}</span>
                  <span style={{fontFamily:"monospace",fontSize:"10px",color:"#e08060"}}>{d.c}</span>
                </label>;
              })}
            </div>
          </div>}

          {/* Limitations */}
          {(isPriest||isWizard)&&<div style={{marginBottom:"12px"}}>
            <Lbl dim={dim}>LIMITATIONS <span style={{color:"#60a060"}}>(refund CP)</span></Lbl>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
              {Object.keys(activeLimits).map(function(l){var d=activeLimits[l];var on=cpLim.indexOf(l)>=0;
                return <label key={l} style={{display:"flex",alignItems:"center",gap:"6px",padding:"3px 8px",cursor:"pointer",fontSize:"11px",background:on?"#1a2818":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:dim}}>
                  <input type="checkbox" checked={on} onChange={function(){toggle(cpLim,setCpLim,l);}} style={{accentColor:"#60a060"}} />
                  <span style={{flex:1}}>{l}</span>
                  <span style={{fontFamily:"monospace",fontSize:"10px",color:"#60a060"}}>-{d.r}</span>
                </label>;
              })}
            </div>
          </div>}

          {!(isPriest||isWizard)&&<div style={{padding:"40px",textAlign:"center",color:dim}}>
            <div style={{fontSize:"36px",opacity:0.3,marginBottom:"12px"}}>⚔️</div>
            <div>CP character creation is available for Priest and Wizard classes.</div>
            <div style={{fontSize:"11px",marginTop:"8px"}}>Select Cleric, Druid, Mage, or Illusionist on the Stats tab to enable.</div>
          </div>}
        </div>}

        {/* ═══ SHEET TAB ═══ */}
        {tab==="sheet"&&<div style={{fontFamily:"'Courier New',monospace",fontSize:"11px",lineHeight:"1.5",color:"#ddd",background:"#0c0c14",border:"1px solid "+brd,borderRadius:"8px",padding:"20px",maxWidth:"700px",margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:"16px"}}>
            <div style={{fontSize:"18px",color:g,fontWeight:"bold",fontVariant:"small-caps",letterSpacing:"3px"}}>Advanced Dungeons & Dragons</div>
            <div style={{fontSize:"12px",color:dim,letterSpacing:"2px"}}>2nd Edition — Player Character Record</div>
          </div>
          <div style={{borderBottom:"2px solid "+g,marginBottom:"12px",paddingBottom:"8px"}}>
            <Row l="Character" v={charName||"_______________"} l2="Level" v2={level} />
            <Row l="Class/Kit" v={cls+(kit?" ("+kit+")":"")} l2="Alignment" v2={align} />
            <Row l="Race" v={race} l2="Deity" v2="_______________" />
          </div>
          {activeBuffs.length>0&&<div style={{background:"#0d1a0d",border:"1px solid #2a4a2a",borderRadius:"4px",padding:"10px",marginBottom:"12px"}}>
            <div style={{color:"#7db87d",fontWeight:"bold",marginBottom:"6px",letterSpacing:"1px",fontSize:"11px"}}>** ACTIVE SPELL EFFECTS **</div>
            {activeCasts.filter(function(m){return BUFF_SPELLS[m["Spell Name"]];}).map(function(m,i){var sp=BUFF_SPELLS[m["Spell Name"]];return <div key={i} style={{color:"#9cc89c",fontSize:"10px",marginBottom:"4px",lineHeight:"1.4"}}><span style={{color:"#c9e8c9",fontWeight:"bold"}}>L{m.Level} {m["Spell Name"]}</span>: {sp.desc}</div>;})}
          </div>}
          <div style={{marginBottom:"12px"}}>
            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>ABILITY SCORES</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"4px",textAlign:"center"}}>
              {["Str","Dex","Con","Int","Wis","Cha"].map(function(a){var adj=raceData.adj[a]||0;var fin=stats[a]+adj;var buff=a==="Str"?buffStr:0;var disp=fin+buff;
                return <div key={a} style={{border:"1px solid "+(buff>0?"#2a4a2a":"#333"),padding:"4px",borderRadius:"4px",background:buff>0?"#0a150a":"transparent"}}>
                  <div style={{fontSize:"9px",color:dim}}>{a.toUpperCase()}</div>
                  <div style={{fontSize:"16px",color:buff>0?"#7db87d":g,fontWeight:"bold"}}>{disp}</div>
                  {buff>0&&<div style={{fontSize:"8px",color:"#7db87d"}}>+{buff} spell</div>}
                  {adj!==0&&<div style={{fontSize:"8px",color:dim}}>({stats[a]}{adj>0?"+":""}{adj})</div>}
                </div>;
              })}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
            <div>
              <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>COMBAT</div>
              <Row l="THAC0" v={thac0} l2={(buffStr>0||buffStrLvl>0)?("Str Hit*"+(effStrPct>0?" (ex)":"")):"Str Hit"} v2={(effStrB.hit>=0?"+":"")+effStrB.hit} />
              <Row l={buffAC>0?"AC*":"AC"} v={effAC} l2="Dex Def" v2={(dexAC(adjStats.Dex)>=0?"+":"")+dexAC(adjStats.Dex)} />
              <Row l="HP" v={hp} l2={(buffStr>0||buffStrLvl>0)?("Dmg Adj*"+(effStrPct>0?" (ex)":"")):"Dmg Adj"} v2={(effStrB.dmg>=0?"+":"")+effStrB.dmg} />
              <Row l="Hit Dice" v={"d"+classData.hd} l2="Con Adj" v2={(conB>=0?"+":"")+conB+"/die"} />
              <Row l="Movement" v={12} l2="Dex Missile" v2={(dexMis>=0?"+":"")+dexMis} />
            </div>
            <div>
              <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>SAVING THROWS</div>
              {Object.keys(effSaves).map(function(s){var n={Para:"Para/Poison/Death",Rod:"Rod/Staff/Wand",Pet:"Petrify/Poly",Breath:"Breath Weapon",Spell:"Spell"};
                var wisAdj2=(s==="Spell"||s==="Rod")?wisAdj:0;
                var sv=effSaves[s]-wisAdj2;
                var note=wisAdj2!==0?(wisAdj2>0?"\u2665 ":"\u2666 "):"";
                return <Row key={s} l={note+(n[s]||s)} v={sv} l2="" v2="" />;
              })}
            </div>
          </div>
          {wisImm.length>0&&<div style={{marginBottom:"12px",border:"1px solid #3a2a4a",borderRadius:"6px",padding:"8px 12px"}}>
            <div style={{color:"#c080e0",fontWeight:"bold",marginBottom:"6px",fontSize:"11px",letterSpacing:"1px"}}>WIS SPELL IMMUNITIES <span style={{color:"#7a5a8a",fontWeight:"normal"}}>(WIS {adjStats.Wis})</span></div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {wisImm.map(function(sp,i){
                return <span key={i} style={{fontSize:"10px",color:"#c0a0e0",background:"#1a0d2a",border:"1px solid #3a2a4a",borderRadius:"3px",padding:"2px 6px",fontFamily:"monospace"}}>{sp}</span>;
              })}
            </div>
            {wisSpellFail>0&&<div style={{marginTop:"6px",fontSize:"10px",color:"#c06060",fontFamily:"monospace"}}>⚠ {wisSpellFail}% chance of spell failure</div>}
          </div>}
          {adjSlots.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>SPELL SLOTS</div>
            <div style={{display:"flex",gap:"8px"}}>
              {adjSlots.map(function(s,i){return <span key={i} style={{border:"1px solid #333",padding:"2px 8px",borderRadius:"4px"}}>L{i+1}: {s}</span>;})}
            </div>
          </div>}
          {(memorized.length>0||activeCasts.length>0)&&<div style={{marginBottom:"12px"}}>
            {activeCasts.length>0&&<div style={{marginBottom:"6px"}}>
              <div style={{color:"#7db87d",fontWeight:"bold",marginBottom:"4px",fontSize:"11px"}}>ACTIVE SPELLS (Round {combatRound})</div>
              {activeCasts.map(function(c,i){
                var label=c.roundsLeft===null||c.roundsLeft===undefined?"∞":(c.roundsLeft+" rd"+(c.roundsLeft!==1?"s":""));
                return <div key={i} style={{color:"#9cc89c",fontSize:"11px",marginBottom:"2px"}}>L{c.Level} {c["Spell Name"]} <span style={{color:"#c0c040",fontFamily:"monospace"}}>[{label}]</span></div>;
              })}
            </div>}
            {memorized.length>0&&<div>
              <div style={{color:g,fontWeight:"bold",marginBottom:"4px",fontSize:"11px"}}>PREPARED SPELLS</div>
              {memorized.slice().sort(function(a,b){return a.Level-b.Level;}).map(function(s,i){
                return <div key={i} style={{color:"#bbb",fontSize:"11px"}}>L{s.Level} — {s["Spell Name"]}</div>;
              })}
            </div>}
          </div>}
          {isPriest&&(cpMajor.length>0||cpMinor.length>0)&&<div style={{marginBottom:"12px"}}>
            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>SPHERES OF ACCESS</div>
            {cpMajor.length>0&&<div><span style={{color:dim}}>Major: </span>{cpMajor.join(", ")}</div>}
            {cpMinor.length>0&&<div><span style={{color:dim}}>Minor: </span>{cpMinor.join(", ")}</div>}
          </div>}
          {isWizard&&cpSchools.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>SCHOOLS OF MAGIC</div>
            <div>Universal, {cpSchools.join(", ")}</div>
          </div>}
          {/* Druid kit abilities on sheet */}
          {isDruid&&kitData&&kit&&kit!=="None"&&!kitBlocked&&kitData.abilities&&kitData.abilities.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>{kit.toUpperCase()} — KIT ABILITIES</div>
            {kitData.abilities.map(function(a,i){return <div key={i} style={{color:"#bbb",fontSize:"12px",marginBottom:"2px"}}>• {a}</div>;})}
          </div>}
          {isDruid&&kitData&&kit&&kit!=="None"&&kitData.limitations&&kitData.limitations.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:"#e08080",fontWeight:"bold",marginBottom:"4px"}}>{kit.toUpperCase()} — KIT LIMITATIONS</div>
            {kitData.limitations.map(function(l,i){return <div key={i} style={{color:"#c08080",fontSize:"12px",marginBottom:"2px"}}>• {l}</div>;})}
          </div>}
          {isDruid&&kitBlocked&&<div style={{marginBottom:"12px",padding:"8px",background:"#2a1010",border:"1px solid #804040",borderRadius:"4px"}}>
            <div style={{color:"#e08080",fontWeight:"bold",marginBottom:"4px"}}>⚠ KIT BLOCKED</div>
            <div style={{color:"#c08080",fontSize:"11px"}}>Stat requirements not met: {kitReqFails.map(function(s){return s+" "+kitData.req[s];}).join(", ")}. Enable DM Override on Stats tab to use this kit.</div>
          </div>}
          {isDruid&&kitData&&kitData.totemRequired&&totemAnimal&&totemForm&&<div style={{marginBottom:"12px"}}>
            <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>TOTEM: {totemAnimal.toUpperCase()}</div>
            <div style={{fontSize:"11px",fontFamily:"monospace",color:txt}}>
              <div>AC {totemForm.ac} | MV {totemForm.mv} | HD {totemForm.hd}</div>
              {totemForm.attacks.map(function(a,i){return <div key={i}>• {a.name}: {a.dmg}</div>;})}
              {totemForm.special&&<div style={{color:"#a080e0",marginTop:"2px"}}>{totemForm.special}</div>}
              <div style={{marginTop:"4px",color:dim}}>Shape uses: {shapeUsesLeft}/{shapeshifterMaxUses}/day</div>
            </div>
          </div>}
          {isDruid&&kitData&&kitData.shapeshifter&&<div style={{marginBottom:"12px"}}>
            <div style={{color:"#7ab",fontWeight:"bold",marginBottom:"4px"}}>SHAPESHIFTER TRACKER</div>
            <div style={{fontSize:"11px",fontFamily:"monospace",color:txt}}>
              <div>Uses: {shapeUsesLeft}/{shapeshifterMaxUses}/day | Failed: {shapeFailed} ({Math.min(shapeFailed*5,100)}% stuck)</div>
              {level>=7&&<div style={{color:"#a0c0e0",marginTop:"2px"}}>✦ Partial forms unlocked at level 7</div>}
              {level>=9&&<div style={{color:"#a0c0e0"}}>✦ Compendium forms unlocked at level 9</div>}
            </div>
          </div>}
          {cpAbil.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>SPECIAL ABILITIES</div>
            {cpAbil.map(function(a,i){return <div key={i} style={{color:"#bbb"}}>• {a}</div>;})}
          </div>}
          {cpLim.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>LIMITATIONS</div>
            {cpLim.map(function(l,i){return <div key={i} style={{color:"#a88"}}>• {l}</div>;})}
          </div>}
          <div style={{borderTop:"1px solid #333",paddingTop:"8px",marginTop:"8px",color:dim,fontSize:"10px"}}>
            CP Budget: {cpBudget} | Spent: {cpSpent} | Refund: {cpRefund} | Net: {cpSpent-cpRefund}/{cpBudget}
          </div>
          {notes&&<div style={{marginTop:"12px"}}><div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>NOTES</div><div style={{color:"#bbb",whiteSpace:"pre-wrap"}}>{notes}</div></div>}
        </div>}

        {/* ═══ ITEMS TAB ═══ */}
        {tab==="items"&&(function(){
          var allItems=ITEM_DATA||[];
          var cats=["","Potion/Oil","Ring","Rod/Staff/Wand","Book","Jewelry","Wearable","Container","Powder/Candle","Household/Tool","Weird"];
          var usables=["","All","Priest","Wizard","Warrior"];
          var q=itemSearch.trim().toLowerCase();
          var filtered=allItems.filter(function(it){
            if(q&&it.name.toLowerCase().indexOf(q)<0&&(it.description||"").toLowerCase().indexOf(q)<0)return false;
            if(itemCat&&it.category!==itemCat)return false;
            if(itemUsable&&itemUsable!==""){
              if(itemUsable==="All"&&it.usableBy&&it.usableBy.indexOf("All")<0)return false;
              if(itemUsable!=="All"&&it.usableBy&&it.usableBy.indexOf(itemUsable)<0&&it.usableBy.indexOf("All")<0)return false;
            }
            return true;
          });
          return <div>
            <Lbl dim={dim}>TOME OF MAGIC — MAGIC ITEMS <span style={{color:"#666",fontWeight:"normal"}}>({allItems.length} items)</span></Lbl>
            {/* Filters */}
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"14px",alignItems:"center"}}>
              <input value={itemSearch} onChange={function(e){setItemSearch(e.target.value);}} placeholder="Search items…"
                style={Object.assign({},is(brd,txt),{flex:"1",minWidth:"160px"})} />
              <select value={itemCat} onChange={function(e){setItemCat(e.target.value);}}
                style={Object.assign({},ss(brd,txt),{minWidth:"160px"})}>
                {cats.map(function(c){return <option key={c} value={c}>{c||"All Categories"}</option>;})}
              </select>
              <select value={itemUsable} onChange={function(e){setItemUsable(e.target.value);}}
                style={Object.assign({},ss(brd,txt),{minWidth:"130px"})}>
                {usables.map(function(u){return <option key={u} value={u}>{u||"All Classes"}</option>;})}
              </select>
            </div>
            {allItems.length===0&&<div style={{padding:"40px",textAlign:"center",color:dim}}>
              <div style={{fontSize:"32px",opacity:0.3,marginBottom:"10px"}}>✦</div>
              <div>Magic items are loading…</div>
            </div>}
            {allItems.length>0&&filtered.length===0&&<div style={{padding:"20px",textAlign:"center",color:dim,fontFamily:"monospace",fontSize:"12px"}}>No items match that filter.</div>}
            {/* Item list */}
            <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
              {filtered.map(function(it){
                var isOpen=expandedItem===it.name;
                var usableBadge=(it.usableBy&&it.usableBy.indexOf("All")<0)?it.usableBy.join(", "):null;
                var catColor={"Potion/Oil":"#7db87d","Ring":"#c9a84c","Rod/Staff/Wand":"#80a0e0","Book":"#e0c080","Jewelry":"#e080c0","Wearable":"#80c0e0","Container":"#a0e0a0","Powder/Candle":"#e0a080","Household/Tool":"#a0a0e0","Weird":"#c080e0"}[it.category]||dim;
                return <div key={it.name} style={{background:surf,border:"1px solid "+(isOpen?"#2a2a4a":brd),borderRadius:"6px",overflow:"hidden"}}>
                  <div onClick={function(){setExpandedItem(isOpen?null:it.name);}}
                    style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 12px",cursor:"pointer",userSelect:"none"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontSize:"13px",color:it.cursed?"#e08080":txt,fontWeight:"bold"}}>{it.name}</span>
                      {it.cursed&&<span style={{fontSize:"9px",color:"#e06060",fontFamily:"monospace",marginLeft:"6px",background:"#2a0a0a",border:"1px solid #4a2020",borderRadius:"3px",padding:"1px 4px"}}>CURSED</span>}
                    </div>
                    <div style={{display:"flex",gap:"6px",alignItems:"center",flexShrink:0}}>
                      <span style={{fontSize:"9px",color:catColor,fontFamily:"monospace",background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"2px 6px"}}>{it.category}</span>
                      {usableBadge&&<span style={{fontSize:"9px",color:"#c9a84c",fontFamily:"monospace",background:"#0a0a12",border:"1px solid #2a2010",borderRadius:"3px",padding:"2px 6px"}}>{usableBadge}</span>}
                      {it.xpValue>0&&<span style={{fontSize:"9px",color:"#888",fontFamily:"monospace"}}>{it.xpValue.toLocaleString()} XP</span>}
                      <span style={{color:isOpen?g:dim,fontSize:"12px",marginLeft:"4px"}}>{isOpen?"▼":"▶"}</span>
                    </div>
                  </div>
                  {isOpen&&<div style={{padding:"8px 14px 12px 14px",borderTop:"1px solid "+brd,fontSize:"12px",color:"#b8b4a8",lineHeight:"1.7",fontStyle:"italic"}}>
                    {it.description||<span style={{color:dim,fontFamily:"monospace",fontStyle:"normal"}}>No description available.</span>}
                  </div>}
                </div>;
              })}
            </div>
          </div>;
        })()}

        {/* ═══ GEAR TAB ═══ */}
        {tab==="gear"&&(function(){
          var GEAR_TYPES=["Ring","Amulet/Necklace","Bracers/Gloves","Helm/Hat","Cloak/Robe","Belt","Boots","Weapon","Armor/Shield","Wand/Staff/Rod","Misc"];
          var EFFECT_LABELS={str:"STR",dex:"DEX",con:"CON",int:"INT",wis:"WIS",cha:"CHA",ac:"AC bonus",thac0:"THAC0 bonus",dmg:"Damage bonus",saves:"Saves bonus",hp:"HP bonus"};
          var EFFECT_COLORS={str:"#e08080",dex:"#80e0a0",con:"#e0a060",int:"#80c0e0",wis:"#c080e0",cha:"#e0c080",ac:"#80a0e0",thac0:"#e0c080",dmg:"#e09060",saves:"#a0e0a0",hp:"#e08080"};
          var DMG_TYPES=["Fire","Cold","Electricity","Acid","Poison","Radiant","Necrotic","Sonic","Force","Psychic","Holy","Unholy","Magic","Piercing","Slashing","Bludgeoning"];
          var DMG_TYPE_COLORS={Fire:"#e06030",Cold:"#80d0f0",Electricity:"#f0e040",Acid:"#80d040",Poison:"#90d060",Radiant:"#f0e0a0",Necrotic:"#a060d0",Sonic:"#80c0e0",Force:"#a080e0",Psychic:"#e080e0",Holy:"#f0f0a0",Unholy:"#806090",Magic:"#c090e0",Piercing:"#c0c0c0",Slashing:"#d0a0a0",Bludgeoning:"#c0a080"};
          var DIE_SIZES=[4,6,8,10,12,20];
          function bonusDmgLabel(it){
            var e=it.effects||{};
            if(!e.bonusDmgDice||!e.bonusDmgType)return null;
            return e.bonusDmgDice+"d"+e.bonusDmgDie+" "+e.bonusDmgType;
          }

          function saveGear(form){
            var item=Object.assign({},form,{id:form.id||Date.now()+"_"+Math.random().toString(36).slice(2),equipped:form.equipped||false});
            setGearItems(function(prev){var idx=prev.findIndex(function(g){return g.id===item.id;});return idx>=0?prev.map(function(g,i){return i===idx?item:g;}):prev.concat([item]);});
            setGearForm(null);setGearAiPrompt("");setGearAiError("");
          }
          function deleteGear(id){setGearItems(function(prev){return prev.filter(function(g){return g.id!==id;})});}
          function toggleEquip(id){setGearItems(function(prev){return prev.map(function(g){return g.id===id?Object.assign({},g,{equipped:!g.equipped}):g;});});}
          function setEffect(key,val){setGearForm(function(f){return Object.assign({},f,{effects:Object.assign({},f.effects,{[key]:parseInt(val)||0})});});}

          async function doGenerateItem(){
            if(!gearAiPrompt.trim()||gearAiLoading)return;
            setGearAiLoading(true);setGearAiError("");
            try{
              var result=await generateMagicItem(gearAiPrompt);
              setGearForm(function(f){return Object.assign({},f||BLANK_GEAR,{
                name:result.name||f&&f.name||"",
                type:GEAR_TYPES.indexOf(result.type)>=0?result.type:(f&&f.type)||"Misc",
                desc:result.description||f&&f.desc||"",
                effects:Object.assign({},BLANK_GEAR.effects,result.effects||{}),
              });});
            }catch(e){setGearAiError(e.message);}
            setGearAiLoading(false);
          }

          async function sha256hex(str){
            var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
          }
          async function loadDmItems(){
            setGearLibLoading(true);
            try{var items=await listGearLibrary("dm");setGearLibItems(items||[]);}
            catch(e){setGearLibStatus("Error: "+e.message);}
            setGearLibLoading(false);
          }
          async function openLibrary(){
            setGearLibOpen(true);setGearLibStatus("");
            // Always open on Library tab; if currently on DM and not verified, stay but don't fetch
            if(gearLibRole==="dm"&&!dmPwVerified){setGearLibItems([]);return;}
            setGearLibLoading(true);
            try{var items=await listGearLibrary(gearLibRole);setGearLibItems(items||[]);}
            catch(e){setGearLibStatus("Error: "+e.message);}
            setGearLibLoading(false);
          }
          async function fetchLibrary(role){
            setGearLibRole(role);setGearLibStatus("");setDmPwError("");
            if(role==="dm"&&!dmPwVerified){
              // Check whether a DM password has been set
              setDmPwLoading(true);
              try{var h=await getDmPasswordHash();setDmPwHashExists(h!==null);}
              catch(e){setGearLibStatus("Error: "+e.message);}
              setDmPwLoading(false);
              setGearLibItems([]);
              return;
            }
            setGearLibLoading(true);
            try{var items=await listGearLibrary(role);setGearLibItems(items||[]);}
            catch(e){setGearLibStatus("Error: "+e.message);}
            setGearLibLoading(false);
          }
          async function verifyDmPassword(){
            if(!dmPwInput.trim())return;
            setDmPwLoading(true);setDmPwError("");
            try{
              var stored=await getDmPasswordHash();
              var entered=await sha256hex(dmPwInput);
              if(entered===stored){
                setDmPwVerified(true);setDmPwInput("");
                await loadDmItems();
              }else{
                setDmPwError("Incorrect password.");
              }
            }catch(e){setDmPwError(e.message);}
            setDmPwLoading(false);
          }
          async function saveDmPassword(){
            if(!dmPwInput.trim()){setDmPwError("Password cannot be empty.");return;}
            if(dmPwInput!==dmPwConfirm){setDmPwError("Passwords do not match.");return;}
            setDmPwLoading(true);setDmPwError("");
            try{
              var hash=await sha256hex(dmPwInput);
              await setDmPasswordHash(hash);
              setDmPwHashExists(true);setDmPwVerified(true);
              setDmPwInput("");setDmPwConfirm("");setDmChangePw(false);
              setGearLibStatus("DM password set \u2713");
              setTimeout(function(){setGearLibStatus("");},3000);
              await loadDmItems();
            }catch(e){setDmPwError(e.message);}
            setDmPwLoading(false);
          }
          async function removeDmPassword(){
            setDmPwLoading(true);setDmPwError("");
            try{
              await setDmPasswordHash(null);
              setDmPwHashExists(false);setDmChangePw(false);
              setGearLibStatus("DM password removed \u2713");
              setTimeout(function(){setGearLibStatus("");},3000);
            }catch(e){setDmPwError(e.message);}
            setDmPwLoading(false);
          }
          async function saveToLibrary(item,role){
            setGearLibStatus("Saving…");
            try{
              await saveGearToLibrary(item,role);
              setGearLibStatus("Saved to "+role+" library ✓");
              setTimeout(function(){setGearLibStatus("");},3000);
            }catch(e){setGearLibStatus("Error: "+e.message);}
          }
          async function removeFromLibrary(id){
            try{
              await deleteGearFromLibrary(id);
              setGearLibItems(function(prev){return prev.filter(function(x){return x.id!==id;});});
            }catch(e){setGearLibStatus("Error: "+e.message);}
          }
          function importFromLibrary(libItem){
            var gear=Object.assign({},BLANK_GEAR,{
              id:Date.now()+"_"+Math.random().toString(36).slice(2),
              name:libItem.name,
              type:libItem.type||"Misc",
              desc:libItem.description||"",
              effects:Object.assign({},BLANK_GEAR.effects,libItem.effects||{}),
              equipped:false,
            });
            setGearItems(function(prev){return prev.concat([gear]);});
            setGearLibStatus("Added: "+libItem.name);
            setTimeout(function(){setGearLibStatus("");},2000);
          }

          var equippedGear=gearItems.filter(function(g){return g.equipped;});
          var anyBonuses=equippedGear.length>0;

          return <div>
            {/* Library modal */}
            {gearLibOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={function(){setGearLibOpen(false);}}>
              <div style={{background:"#12111a",border:"1px solid "+brd,borderRadius:"8px",padding:"20px",width:"90%",maxWidth:"560px",maxHeight:"80vh",display:"flex",flexDirection:"column"}} onClick={function(e){e.stopPropagation();}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                  <div style={{color:g,fontWeight:"bold",fontVariant:"small-caps",letterSpacing:"1px"}}>Gear Library</div>
                  <button onClick={function(){setGearLibOpen(false);}} style={{background:"transparent",border:"none",color:dim,cursor:"pointer",fontSize:"18px",padding:"0 4px"}}>×</button>
                </div>
                {/* Role tabs */}
                <div style={{display:"flex",gap:"6px",marginBottom:"12px"}}>
                  {[["player","Library"],["dm","DM \uD83D\uDD12"]].map(function(pair){
                    return <button key={pair[0]} onClick={function(){fetchLibrary(pair[0]);}}
                      style={{padding:"4px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:gearLibRole===pair[0]?"#1a2a3a":"transparent",color:gearLibRole===pair[0]?"#80c0e0":dim,border:gearLibRole===pair[0]?"1px solid #2a4a6a":"1px solid transparent"}}>{pair[1]}</button>;
                  })}
                </div>
                {gearLibStatus&&<div style={{fontSize:"11px",color:gearLibStatus.startsWith("Error")?"#e08080":"#7db87d",fontFamily:"monospace",marginBottom:"8px"}}>{gearLibStatus}</div>}

                {/* DM password gate */}
                {gearLibRole==="dm"&&!dmPwVerified?(
                  <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 10px"}}>
                    <div style={{color:"#e0c080",fontSize:"14px",fontVariant:"small-caps",letterSpacing:"1px",marginBottom:"4px"}}>
                      {dmPwHashExists===false?"Secure DM Library":"DM Library"}
                    </div>
                    <div style={{color:dim,fontSize:"11px",marginBottom:"20px",textAlign:"center"}}>
                      {dmPwHashExists===false
                        ?"No password set. Create one to prevent players from viewing DM items."
                        :"Enter the DM password to access this library."}
                    </div>
                    {dmPwLoading&&dmPwHashExists===null
                      ?<div style={{color:dim,fontFamily:"monospace",fontSize:"12px"}}>Checking…</div>
                      :<div style={{width:"100%",maxWidth:"300px"}}>
                        <input type="password" value={dmPwInput} onChange={function(e){setDmPwInput(e.target.value);setDmPwError("");}}
                          onKeyDown={function(e){if(e.key==="Enter")dmPwHashExists===false?saveDmPassword():verifyDmPassword();}}
                          placeholder="Password"
                          style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",background:"#0a0a12",border:"1px solid "+(dmPwError?"#e08080":brd),borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"6px"}}/>
                        {dmPwHashExists===false&&<input type="password" value={dmPwConfirm} onChange={function(e){setDmPwConfirm(e.target.value);setDmPwError("");}}
                          onKeyDown={function(e){if(e.key==="Enter")saveDmPassword();}}
                          placeholder="Confirm password"
                          style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",background:"#0a0a12",border:"1px solid "+(dmPwError?"#e08080":brd),borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"6px"}}/>}
                        {dmPwError&&<div style={{fontSize:"11px",color:"#e08080",fontFamily:"monospace",marginBottom:"6px"}}>{dmPwError}</div>}
                        <button onClick={dmPwHashExists===false?saveDmPassword:verifyDmPassword}
                          disabled={dmPwLoading||!dmPwInput.trim()}
                          style={{width:"100%",padding:"8px",background:dmPwLoading||!dmPwInput.trim()?"#1a1a28":"#1e1a2e",color:dmPwLoading||!dmPwInput.trim()?dim:"#e0c080",border:"1px solid "+(dmPwLoading||!dmPwInput.trim()?brd:"#4a3a0a"),borderRadius:"4px",cursor:dmPwLoading||!dmPwInput.trim()?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"12px"}}>
                          {dmPwLoading?"Working…":dmPwHashExists===false?"Set DM Password":"Unlock"}
                        </button>
                      </div>
                    }
                  </div>
                ):(
                  <div style={{overflowY:"auto",flex:1}}>
                    {/* Verified DM toolbar */}
                    {gearLibRole==="dm"&&dmPwVerified&&<div style={{marginBottom:"10px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"8px"}}>
                      <span style={{fontSize:"10px",color:"#e0c080",fontFamily:"monospace"}}>🔓 DM Access</span>
                      {!dmChangePw
                        ?<button onClick={function(){setDmChangePw(true);setDmPwInput("");setDmPwConfirm("");setDmPwError("");}}
                            style={{padding:"2px 10px",background:"transparent",color:dim,border:"1px solid #2a2a3a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Change Password</button>
                        :<div style={{display:"flex",gap:"4px",alignItems:"center",flexWrap:"wrap"}}>
                            <input type="password" value={dmPwInput} onChange={function(e){setDmPwInput(e.target.value);setDmPwError("");}}
                              placeholder="New password" style={{padding:"3px 7px",background:"#0a0a12",border:"1px solid "+(dmPwError?"#e08080":brd),borderRadius:"3px",color:txt,fontSize:"11px",fontFamily:"monospace",width:"120px"}}/>
                            <input type="password" value={dmPwConfirm} onChange={function(e){setDmPwConfirm(e.target.value);setDmPwError("");}}
                              placeholder="Confirm" style={{padding:"3px 7px",background:"#0a0a12",border:"1px solid "+(dmPwError?"#e08080":brd),borderRadius:"3px",color:txt,fontSize:"11px",fontFamily:"monospace",width:"100px"}}/>
                            <button onClick={saveDmPassword} disabled={dmPwLoading}
                              style={{padding:"3px 8px",background:"#1e1a2e",color:"#e0c080",border:"1px solid #4a3a0a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Save</button>
                            <button onClick={removeDmPassword} disabled={dmPwLoading}
                              style={{padding:"3px 8px",background:"transparent",color:"#a06060",border:"1px solid #4a2a2a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Remove</button>
                            <button onClick={function(){setDmChangePw(false);setDmPwInput("");setDmPwConfirm("");setDmPwError("");}}
                              style={{padding:"3px 6px",background:"transparent",color:dim,border:"none",cursor:"pointer",fontFamily:"monospace",fontSize:"12px"}}>✕</button>
                            {dmPwError&&<div style={{fontSize:"10px",color:"#e08080",fontFamily:"monospace",width:"100%"}}>{dmPwError}</div>}
                          </div>
                      }
                    </div>}
                    {gearLibLoading&&<div style={{padding:"20px",textAlign:"center",color:dim,fontFamily:"monospace",fontSize:"12px"}}>Loading…</div>}
                    {!gearLibLoading&&gearLibItems.length===0&&<div style={{padding:"20px",textAlign:"center",color:dim,fontSize:"12px"}}>No items in this library yet.</div>}
                    {!gearLibLoading&&gearLibItems.map(function(it){
                      var bonuses=Object.keys(EFFECT_LABELS).filter(function(k){return it.effects&&it.effects[k];});
                      var libBdl=bonusDmgLabel(it);
                      return <div key={it.id} style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"10px 12px",marginBottom:"6px",display:"flex",alignItems:"flex-start",gap:"10px"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{fontSize:"13px",color:txt,fontWeight:"bold"}}>{it.name}</span>
                            <span style={{fontSize:"9px",color:dim,fontFamily:"monospace",background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{it.type}</span>
                            <span style={{fontSize:"9px",color:it.role==="dm"?"#e0c080":"#80c0e0",fontFamily:"monospace"}}>{it.role==="dm"?"DM":"Player"}</span>
                          </div>
                          {(bonuses.length>0||libBdl)&&<div style={{display:"flex",flexWrap:"wrap",gap:"3px",marginTop:"4px"}}>
                            {bonuses.map(function(k){var v=it.effects[k];return <span key={k} style={{fontSize:"9px",fontFamily:"monospace",color:EFFECT_COLORS[k],background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{EFFECT_LABELS[k]}: {v>0?"+":""}{v}</span>;})}
                            {libBdl&&<span style={{fontSize:"9px",fontFamily:"monospace",color:DMG_TYPE_COLORS[it.effects.bonusDmgType]||"#e0c080",background:"#0a0a12",border:"1px solid #2a1a0a",borderRadius:"3px",padding:"1px 5px"}}>+{libBdl}</span>}
                          </div>}
                          {it.description&&<div style={{fontSize:"10px",color:dim,marginTop:"3px",fontStyle:"italic"}}>{it.description.slice(0,100)}{it.description.length>100?"…":""}</div>}
                        </div>
                        <div style={{display:"flex",gap:"4px",flexShrink:0}}>
                          <button onClick={function(){importFromLibrary(it);}}
                            style={{padding:"3px 10px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>+ Add</button>
                          <button onClick={function(){removeFromLibrary(it.id);}}
                            style={{padding:"3px 8px",background:"transparent",color:"#a06060",border:"1px solid #4a2a2a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>✕</button>
                        </div>
                      </div>;
                    })}
                  </div>
                )}
              </div>
            </div>}

            {/* Header row */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px",flexWrap:"wrap",gap:"8px"}}>
              <Lbl dim={dim}>CUSTOM MAGIC ITEMS {gearItems.length>0&&<span style={{color:"#666",fontWeight:"normal"}}>({gearItems.length} created, {equippedGear.length} equipped)</span>}</Lbl>
              <div style={{display:"flex",gap:"6px"}}>
                {supabase&&<button onClick={openLibrary}
                  style={{padding:"5px 12px",background:"#1a1a28",color:"#80a0e0",border:"1px solid #2a2a5a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px"}}>☁ Browse Library</button>}
                {!gearForm&&<button onClick={newGearForm}
                  style={{padding:"5px 12px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px"}}>+ Create Item</button>}
              </div>
            </div>
            {gearLibStatus&&!gearLibOpen&&<div style={{fontSize:"11px",color:gearLibStatus.startsWith("Error")?"#e08080":"#7db87d",fontFamily:"monospace",marginBottom:"8px"}}>{gearLibStatus}</div>}

            {/* Active bonus summary */}
            {anyBonuses&&<div style={{background:"#0d1a0d",border:"1px solid #2a4a2a",borderRadius:"6px",padding:"10px 14px",marginBottom:"14px"}}>
              <div style={{fontSize:"10px",color:"#7db87d",fontFamily:"monospace",letterSpacing:"1px",marginBottom:"6px"}}>EQUIPPED BONUSES (applied to sheet)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                {Object.keys(EFFECT_LABELS).map(function(k){
                  var total=equippedGear.reduce(function(s,g){return s+(g.effects[k]||0);},0);
                  if(!total)return null;
                  return <span key={k} style={{fontSize:"11px",fontFamily:"monospace",color:EFFECT_COLORS[k],background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"2px 8px"}}>{EFFECT_LABELS[k]}: {total>0?"+":""}{total}</span>;
                })}
                {equippedGear.map(function(g){var lbl=bonusDmgLabel(g);return lbl?<span key={g.id} style={{fontSize:"11px",fontFamily:"monospace",color:DMG_TYPE_COLORS[g.effects.bonusDmgType]||"#e0c080",background:"#0a0a12",border:"1px solid #2a1a0a",borderRadius:"3px",padding:"2px 8px"}}>+{lbl}</span>:null;})}
              </div>
            </div>}

            {/* Creator / editor form */}
            {gearForm&&<div style={{background:surf,border:"1px solid #2a2a4a",borderRadius:"8px",padding:"16px",marginBottom:"16px"}}>
              <div style={{color:g,fontWeight:"bold",marginBottom:"12px",fontVariant:"small-caps",letterSpacing:"1px",fontSize:"13px"}}>{gearForm.id?"Edit Item":"New Magic Item"}</div>

              {/* AI generation panel (new items only) */}
              {!gearForm.id&&<div style={{marginBottom:"14px",padding:"12px",background:"#0d0d1a",border:"1px solid #2a2a4a",borderRadius:"6px"}}>
                <div style={{fontSize:"10px",color:"#80a0e0",fontFamily:"monospace",letterSpacing:"1px",marginBottom:"6px"}}>✦ AI ITEM GENERATOR</div>
                <div style={{display:"flex",gap:"8px",alignItems:"flex-start"}}>
                  <textarea value={gearAiPrompt} onChange={function(e){setGearAiPrompt(e.target.value);}}
                    onKeyDown={function(e){if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))doGenerateItem();}}
                    placeholder={"Describe the item you want…\ne.g. \"a ring that protects against fire and boosts constitution\"\nor \"a cursed sword that makes the wielder stronger but harder to hit\""}
                    rows={3} style={{flex:1,padding:"7px 9px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical",lineHeight:"1.5"}} />
                  <button onClick={doGenerateItem} disabled={gearAiLoading||!gearAiPrompt.trim()}
                    style={{padding:"7px 16px",background:gearAiLoading||!gearAiPrompt.trim()?"#1a1a28":"#1e1a2e",color:gearAiLoading||!gearAiPrompt.trim()?dim:g,border:"1px solid "+(gearAiLoading||!gearAiPrompt.trim()?brd:"#3a2a5a"),borderRadius:"4px",cursor:gearAiLoading||!gearAiPrompt.trim()?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px",whiteSpace:"nowrap"}}>
                    {gearAiLoading?"Generating…":"✨ Generate"}
                  </button>
                </div>
                {gearAiError&&<div style={{fontSize:"11px",color:"#e08080",fontFamily:"monospace",marginTop:"6px"}}>⚠ {gearAiError}</div>}
                <div style={{fontSize:"10px",color:dim,marginTop:"5px",fontFamily:"monospace"}}>The AI fills in the fields below — you can edit anything before saving. Ctrl+Enter to generate.</div>
              </div>}

              {/* Manual fields */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"10px"}}>
                <div>
                  <Lbl dim={dim}>Item Name</Lbl>
                  <input value={gearForm.name} onChange={function(e){setGearForm(function(f){return Object.assign({},f,{name:e.target.value});});}}
                    placeholder="e.g. Ring of Protection +2" style={Object.assign({},is(brd,txt),{width:"100%"})} />
                </div>
                <div>
                  <Lbl dim={dim}>Item Type</Lbl>
                  <select value={gearForm.type} onChange={function(e){setGearForm(function(f){return Object.assign({},f,{type:e.target.value});});}} style={Object.assign({},ss(brd,txt),{width:"100%"})}>
                    {GEAR_TYPES.map(function(t){return <option key={t}>{t}</option>;})}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:"10px"}}>
                <Lbl dim={dim}>Description / Notes</Lbl>
                <textarea value={gearForm.desc} onChange={function(e){setGearForm(function(f){return Object.assign({},f,{desc:e.target.value});});}}
                  placeholder="Flavor text or special powers…" rows={2}
                  style={{width:"100%",padding:"6px 8px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical"}} />
              </div>
              <Lbl dim={dim}>Stat & Combat Effects <span style={{color:"#555",fontWeight:"normal"}}>(positive = better; AC +2 lowers your AC by 2; THAC0 +2 lowers it by 2)</span></Lbl>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:"6px",marginBottom:"14px"}}>
                {Object.keys(EFFECT_LABELS).map(function(k){return <div key={k} style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                  <label style={{fontSize:"10px",color:EFFECT_COLORS[k],fontFamily:"monospace"}}>{EFFECT_LABELS[k]}</label>
                  <input type="number" value={gearForm.effects[k]||0}
                    onChange={function(e){setEffect(k,e.target.value);}}
                    style={{padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"13px",fontFamily:"monospace",outline:"none",textAlign:"center",width:"100%"}} />
                </div>;})}
              </div>
              {/* Bonus typed damage */}
              <Lbl dim={dim}>Bonus Typed Damage <span style={{color:"#555",fontWeight:"normal"}}>(optional — e.g. 2d8 Radiant on a sword)</span></Lbl>
              <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap",marginBottom:"14px",padding:"10px 12px",background:"#0a0a14",border:"1px solid #1e1e30",borderRadius:"6px"}}>
                <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                  <label style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>Dice</label>
                  <input type="number" min={0} max={20} value={gearForm.effects.bonusDmgDice||0}
                    onChange={function(e){setEffect("bonusDmgDice",Math.max(0,parseInt(e.target.value)||0));}}
                    style={{width:"60px",padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"13px",fontFamily:"monospace",outline:"none",textAlign:"center"}} />
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                  <label style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>Die</label>
                  <select value={gearForm.effects.bonusDmgDie||6} onChange={function(e){setEffect("bonusDmgDie",parseInt(e.target.value));}}
                    style={Object.assign({},ss(brd,txt),{width:"70px"})}>
                    {DIE_SIZES.map(function(d){return <option key={d} value={d}>d{d}</option>;})}
                  </select>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:"3px",flex:1,minWidth:"140px"}}>
                  <label style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>Damage Type</label>
                  <select value={gearForm.effects.bonusDmgType||""} onChange={function(e){setEffect("bonusDmgType",e.target.value);}}
                    style={Object.assign({},ss(brd,txt),{width:"100%",color:gearForm.effects.bonusDmgType?DMG_TYPE_COLORS[gearForm.effects.bonusDmgType]||txt:dim})}>
                    <option value="">— None —</option>
                    {DMG_TYPES.map(function(t){return <option key={t} value={t}>{t}</option>;})}
                  </select>
                </div>
                {gearForm.effects.bonusDmgDice>0&&gearForm.effects.bonusDmgType&&
                  <div style={{fontSize:"12px",fontFamily:"monospace",color:DMG_TYPE_COLORS[gearForm.effects.bonusDmgType]||g,alignSelf:"flex-end",paddingBottom:"4px"}}>
                    +{gearForm.effects.bonusDmgDice}d{gearForm.effects.bonusDmgDie} {gearForm.effects.bonusDmgType}
                  </div>}
              </div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                <button onClick={function(){saveGear(gearForm);}} disabled={!gearForm.name.trim()}
                  style={{padding:"7px 20px",background:gearForm.name.trim()?"#1e2a1e":"#111",color:gearForm.name.trim()?"#7db87d":dim,border:"1px solid "+(gearForm.name.trim()?"#3a5a3a":brd),borderRadius:"4px",cursor:gearForm.name.trim()?"pointer":"not-allowed",fontFamily:"monospace",fontSize:"11px"}}>Save Item</button>
                <button onClick={function(){setGearForm(null);setGearAiPrompt("");setGearAiError("");}}
                  style={{padding:"7px 16px",background:"transparent",color:dim,border:"1px solid "+brd,borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px"}}>Cancel</button>
              </div>
            </div>}

            {/* Empty state */}
            {gearItems.length===0&&!gearForm&&<div style={{padding:"40px",textAlign:"center",color:dim}}>
              <div style={{fontSize:"32px",opacity:0.3,marginBottom:"10px"}}>⚔</div>
              <div style={{marginBottom:"6px"}}>No custom items yet.</div>
              <div style={{fontSize:"11px"}}>Click <strong style={{color:txt}}>+ Create Item</strong> to forge a magic item with stat effects, or describe it to the AI and it will fill in the stats automatically.</div>
            </div>}

            {/* Item list */}
            {gearItems.length>3&&<input value={gearSearch} onChange={function(e){setGearSearch(e.target.value);}}
              placeholder="Search items…"
              style={{width:"100%",boxSizing:"border-box",padding:"6px 10px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"10px"}}/>}
            <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
              {gearItems.filter(function(it){return !gearSearch.trim()||(it.name||"").toLowerCase().includes(gearSearch.toLowerCase())||(it.desc||"").toLowerCase().includes(gearSearch.toLowerCase());}).map(function(it){
                var bonusParts=Object.keys(EFFECT_LABELS).filter(function(k){return it.effects&&it.effects[k];}).map(function(k){var v=it.effects[k];return <span key={k} style={{fontSize:"9px",fontFamily:"monospace",color:EFFECT_COLORS[k],background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{EFFECT_LABELS[k]}: {v>0?"+":""}{v}</span>;});
                var bdl=bonusDmgLabel(it);if(bdl)bonusParts.push(<span key="bdmg" style={{fontSize:"9px",fontFamily:"monospace",color:DMG_TYPE_COLORS[it.effects.bonusDmgType]||"#e0c080",background:"#0a0a12",border:"1px solid #2a1a0a",borderRadius:"3px",padding:"1px 5px"}}>+{bdl}</span>);
                return <div key={it.id} style={{background:surf,border:"1px solid "+(it.equipped?"#2a4a2a":brd),borderRadius:"6px",padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:"10px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"13px",color:it.equipped?g:txt,fontWeight:"bold"}}>{it.name}</span>
                      <span style={{fontSize:"9px",color:dim,fontFamily:"monospace",background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{it.type}</span>
                      {it.equipped&&<span style={{fontSize:"9px",color:"#7db87d",fontFamily:"monospace"}}>✓ equipped</span>}
                    </div>
                    {bonusParts.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginTop:"5px"}}>{bonusParts}</div>}
                    {it.desc&&<div style={{fontSize:"11px",color:dim,marginTop:"4px",fontStyle:"italic"}}>{it.desc}</div>}
                  </div>
                  <div style={{display:"flex",gap:"4px",flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button onClick={function(){toggleEquip(it.id);}}
                      style={{padding:"4px 10px",background:it.equipped?"#1a2a1a":"#1a1a28",color:it.equipped?"#7db87d":"#80a0e0",border:"1px solid "+(it.equipped?"#3a5a3a":"#2a2a5a"),borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>
                      {it.equipped?"Unequip":"Equip"}
                    </button>
                    <button onClick={function(){setGearForm(Object.assign({},it,{effects:Object.assign({},it.effects)}));}}
                      style={{padding:"4px 8px",background:"transparent",color:dim,border:"1px solid "+brd,borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Edit</button>
                    {supabase&&<div style={{position:"relative",display:"inline-block"}}>
                      <button onClick={function(e){e.currentTarget.nextSibling.style.display=e.currentTarget.nextSibling.style.display==="block"?"none":"block";}}
                        style={{padding:"4px 8px",background:"#1a1a28",color:"#80a0e0",border:"1px solid #2a2a5a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>☁</button>
                      <div style={{display:"none",position:"absolute",right:0,top:"calc(100% + 4px)",background:"#12111a",border:"1px solid "+brd,borderRadius:"4px",zIndex:100,minWidth:"140px",boxShadow:"0 4px 12px rgba(0,0,0,0.5)"}}>
                        <button onClick={function(e){saveToLibrary(it,"player");e.currentTarget.closest("[style*='position:absolute']").style.display="none";}}
                          style={{display:"block",width:"100%",padding:"8px 12px",background:"transparent",color:"#80c0e0",border:"none",borderBottom:"1px solid "+brd,cursor:"pointer",fontFamily:"monospace",fontSize:"10px",textAlign:"left"}}>Save to Player Library</button>
                        <button onClick={function(e){saveToLibrary(it,"dm");e.currentTarget.closest("[style*='position:absolute']").style.display="none";}}
                          style={{display:"block",width:"100%",padding:"8px 12px",background:"transparent",color:"#e0c080",border:"none",cursor:"pointer",fontFamily:"monospace",fontSize:"10px",textAlign:"left"}}>Save to DM Library</button>
                      </div>
                    </div>}
                    <button onClick={function(){deleteGear(it.id);}}
                      style={{padding:"4px 8px",background:"transparent",color:"#a06060",border:"1px solid #4a2a2a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>✕</button>
                  </div>
                </div>;
              })}
            </div>
          </div>;
        })()}

        {/* ═══ NOTES TAB ═══ */}
        {tab==="notes"&&<div>
          <Lbl dim={dim}>CHARACTER NOTES</Lbl>
          <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="Equipment, backstory, kit abilities, wild shape forms…"
            style={{width:"100%",minHeight:"300px",padding:"12px",background:surf,border:"1px solid "+brd,borderRadius:"6px",color:txt,fontSize:"13px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical",lineHeight:"1.6"}} />
        </div>}

        {/* ═══ AI TAB ═══ */}
        {tab==="AI"&&<div>
          <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
            {["spells","gen"].map(function(m){
              var label=m==="spells"?"✦ Spell Search":"✦ Character Generator";
              return <button key={m} onClick={function(){setAiMode(m);setAiResult("");setAiHighlight([]);setGenResult(null);}} style={{padding:"6px 16px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",letterSpacing:"1px",background:aiMode===m?"#1a1a30":"transparent",color:aiMode===m?g:dim,border:aiMode===m?"1px solid #2a2a4a":"1px solid transparent"}}>{label}</button>;
            })}
          </div>
          {aiMode==="spells"&&<div>
            <Lbl dim={dim}>DESCRIBE THE SPELLS YOU NEED</Lbl>
            <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
              <input value={aiQuery} onChange={function(e){setAiQuery(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")doSpellSearch();}} placeholder="e.g. healing over time, charm a humanoid, conjure fire, teleport…" style={Object.assign({},is(brd,txt),{flex:1})} />
              <button onClick={doSpellSearch} disabled={aiLoading} style={{padding:"6px 18px",background:aiLoading?"#1a1a28":"#1a2a1a",color:aiLoading?dim:"#7db87d",border:"1px solid "+(aiLoading?brd:"#3a6a3a"),borderRadius:"4px",cursor:aiLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px"}}>{aiLoading?"…":"Search"}</button>
            </div>
            {aiResult&&<div style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"14px",fontSize:"12px",lineHeight:"1.8",whiteSpace:"pre-wrap",color:txt,maxHeight:"50vh",overflowY:"auto"}}>{renderBold(aiResult)}</div>}
            {aiHighlight.length>0&&<div style={{marginTop:"8px",fontSize:"11px",color:"#7db87d",fontFamily:"monospace"}}>↑ {aiHighlight.length} spell{aiHighlight.length!==1?"s":""} highlighted in compendium — switch to the Spells tab to see them</div>}
          </div>}
          {aiMode==="gen"&&<div>
            <Lbl dim={dim}>DESCRIBE YOUR CHARACTER CONCEPT</Lbl>
            <textarea value={genPrompt} onChange={function(e){setGenPrompt(e.target.value);}} placeholder="e.g. A grizzled dwarven fighter who lost his clan and wanders as a mercenary. Strong, tough, suspicious of magic…" style={{width:"100%",minHeight:"120px",padding:"10px",background:surf,border:"1px solid "+brd,borderRadius:"6px",color:txt,fontSize:"13px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical",lineHeight:"1.6",marginBottom:"10px"}} />
            <button onClick={doGenChar} disabled={genLoading} style={{padding:"7px 22px",background:genLoading?"#1a1a28":"#1e1a2e",color:genLoading?dim:g,border:"1px solid "+(genLoading?brd:"#3a2a5a"),borderRadius:"4px",cursor:genLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px",letterSpacing:"1px"}}>{genLoading?"Generating…":"Generate Character"}</button>
            {genResult&&!genResult.error&&<div style={{marginTop:"14px",background:surf,border:"1px solid "+brd,borderRadius:"8px",padding:"16px"}}>
              <div style={{color:g,fontWeight:"bold",fontSize:"15px",marginBottom:"10px",fontVariant:"small-caps",letterSpacing:"2px"}}>{genResult.name||"Character"}</div>
              <div style={{fontSize:"12px",marginBottom:"10px"}}>
                <Row l="Race" v={genResult.race} l2="Class" v2={genResult.cls} />
                <Row l="Level" v={genResult.level} l2="Alignment" v2={genResult.align} />
                <Row l="HP" v={genResult.hp} l2="STR" v2={genResult.stats&&(genResult.stats.Str+(genResult.strPct>0?" (18/"+genResult.strPct+"%)":""))} />
                <Row l="DEX/CON" v={genResult.stats&&genResult.stats.Dex+"/"+genResult.stats.Con} l2="INT/WIS/CHA" v2={genResult.stats&&genResult.stats.Int+"/"+genResult.stats.Wis+"/"+genResult.stats.Cha} />
              </div>
              {genResult.notes&&<div style={{color:"#bbb",fontSize:"12px",lineHeight:"1.7",marginBottom:"12px",fontStyle:"italic"}}>{genResult.notes}</div>}
              {/* Primary create action */}
              <button onClick={createFullCharacter} style={{width:"100%",padding:"10px",background:"#1e1a2e",color:g,border:"1px solid #3a2a5a",borderRadius:"6px",cursor:"pointer",fontFamily:"monospace",fontSize:"12px",letterSpacing:"2px",marginBottom:"10px",fontWeight:"bold"}}>✦ CREATE CHARACTER{aiHighlight.length>0?" + "+aiHighlight.length+" SPELLS":""}</button>
              {/* Secondary actions */}
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={function(){applyGenerated(genResult);}} style={{padding:"5px 14px",background:"transparent",color:"#7db87d",border:"1px solid #3a6a3a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px",opacity:0.7}}>✓ Stats only</button>
                {(genResult.cls==="Mage"||genResult.cls==="Illusionist"||genResult.cls==="Cleric"||genResult.cls==="Druid")&&
                  <button onClick={doSuggestSpells} disabled={suggestLoading} style={{padding:"5px 14px",background:"transparent",color:suggestLoading?dim:"#80b0e0",border:"1px solid "+(suggestLoading?brd:"#2a3a6a"),borderRadius:"4px",cursor:suggestLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"10px",opacity:suggestLoading?0.5:0.8}}>{suggestLoading?"… Thinking":"✦ Suggest Spells"+(suggestDone?" ✓":"")}</button>
                }
              </div>
              {suggestDone&&aiHighlight.length>0&&<div style={{marginTop:"8px",fontSize:"11px",color:"#80b0e0",fontFamily:"monospace"}}>{aiHighlight.length} spells queued — hit Create to apply them, or browse the Spells tab</div>}
              {suggestDone&&aiHighlight.length===0&&<div style={{marginTop:"8px",fontSize:"11px",color:dim,fontFamily:"monospace"}}>No castable spells found for this class/level</div>}
            </div>}
            {genResult&&genResult.error&&<div style={{marginTop:"12px",color:"#e08080",fontSize:"12px",fontFamily:"monospace",padding:"10px",background:"#1a0a0a",border:"1px solid #4a2020",borderRadius:"4px"}}>⚠ {genResult.error}</div>}
          </div>}
        </div>}

      </div>
    </div>
  );
}

function SB(p){return <div style={{background:"#111118",border:"1px solid #1e1e2e",borderRadius:"8px",padding:"12px",textAlign:"center"}}><div style={{fontSize:"9px",color:"#666050",fontFamily:"monospace",letterSpacing:"1px"}}>{p.label}</div><div style={{fontSize:"28px",color:p.color||"#c9a84c",fontWeight:"bold",margin:"4px 0"}}>{p.value}</div>{p.sub&&<div style={{fontSize:"10px",color:"#666050",fontFamily:"monospace"}}>{p.sub}</div>}</div>;}
function Card(p){return <div style={{background:p.surf,border:"1px solid "+p.brd,borderRadius:"6px",padding:"10px",minWidth:"120px"}}>{p.children}</div>;}
function Lbl(p){return <div style={{fontSize:"10px",color:p.dim||"#666050",fontFamily:"monospace",letterSpacing:"1px",marginBottom:"6px",textTransform:"uppercase"}}>{p.children}</div>;}
function Row(p){return <div style={{display:"flex",gap:"4px",fontSize:"11px"}}><span style={{color:"#888",minWidth:"120px"}}>{p.l}:</span><span style={{color:"#ddd",minWidth:"60px",fontWeight:"bold"}}>{p.v}</span>{p.l2&&<span style={{color:"#888",minWidth:"60px",marginLeft:"8px"}}>{p.l2}:</span>}{p.v2!==undefined&&p.v2!==""&&<span style={{color:"#ddd",fontWeight:"bold"}}>{p.v2}</span>}</div>;}
function is(b,t){return{padding:"5px 8px",background:"#0a0a12",border:"1px solid "+b,borderRadius:"4px",color:t,fontSize:"12px",fontFamily:"Georgia,serif",outline:"none"};}
function ss(b,t){return{padding:"5px 8px",background:"#0a0a12",border:"1px solid "+b,borderRadius:"4px",color:t,fontSize:"11px",fontFamily:"monospace",outline:"none"};}

export default CharCreator;
