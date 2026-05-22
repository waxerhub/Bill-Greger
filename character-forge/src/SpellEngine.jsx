import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { exportCharacterSheet } from "./exportPDF.js";
import { streamSpellSearch, extractSpellNames, generateCharacter, suggestSpellsForCharacter, parsePDFCharacter, generateMagicItem } from "./claudeAI.js";
import { supabase, saveCharacter as supabaseSave, loadCharacterById, listMyCharacters, signIn, signUp, signOut, onAuthStateChange, resetPasswordForEmail, updatePassword, saveGearToLibrary, listGearLibrary, deleteGearFromLibrary, getDmPasswordHash, setDmPasswordHash, getSpellOverrides, saveSpellOverride, deleteSpellOverride } from "./supabase.js";

// ======== CORE 2E TABLES ========
var RACES={"Human":{adj:{},classes:["Fighter","Ranger","Paladin","Cleric","Druid","Mage","Thief","Bard","Monk"]},"Elf":{adj:{Dex:1,Con:-1},classes:["Fighter","Ranger","Cleric","Mage","Thief"]},"Half-Elf":{adj:{},classes:["Fighter","Ranger","Cleric","Druid","Mage","Thief","Bard","Monk"]},"Dwarf":{adj:{Con:1,Cha:-1},classes:["Fighter","Cleric","Thief"]},"Gnome":{adj:{Int:1,Wis:-1},classes:["Fighter","Cleric","Thief","Illusionist"]},"Halfling":{adj:{Dex:1,Str:-1},classes:["Fighter","Cleric","Thief"]},"Half-Orc":{adj:{Str:1,Con:1,Int:-1,Cha:-2},classes:["Fighter","Cleric","Thief"]}};
var CLASSES={"Fighter":{hd:10,prime:"Str",thac0:"war",saves:"war",spells:null,group:"Warrior"},"Ranger":{hd:10,prime:"Str",thac0:"war",saves:"war",spells:"ranger",group:"Warrior"},"Paladin":{hd:10,prime:"Str",thac0:"war",saves:"war",spells:"paladin",group:"Warrior"},"Cleric":{hd:8,prime:"Wis",thac0:"pri",saves:"pri",spells:"priest",group:"Priest"},"Druid":{hd:8,prime:"Wis",thac0:"pri",saves:"pri",spells:"priest",group:"Priest"},"Mage":{hd:4,prime:"Int",thac0:"wiz",saves:"wiz",spells:"wizard",group:"Wizard"},"Illusionist":{hd:4,prime:"Int",thac0:"wiz",saves:"wiz",spells:"wizard",group:"Wizard"},"Thief":{hd:6,prime:"Dex",thac0:"rog",saves:"rog",spells:null,group:"Rogue"},"Bard":{hd:6,prime:"Dex",thac0:"rog",saves:"rog",spells:"bard",group:"Rogue"},"Monk":{hd:4,prime:null,thac0:"rog",saves:"rog",spells:null,group:"Monk"}};
// Weapon & Non-Weapon Proficiency rates per class group (PHB)
// wpInit/nwpInit: slots at level 1; wpRate/nwpRate: gain 1 slot per N levels
var PROF_RATES={"Warrior":{wpInit:4,wpRate:3,nwpInit:3,nwpRate:3},"Priest":{wpInit:2,wpRate:4,nwpInit:4,nwpRate:3},"Wizard":{wpInit:1,wpRate:6,nwpInit:4,nwpRate:3},"Rogue":{wpInit:2,wpRate:4,nwpInit:3,nwpRate:4},"Monk":{wpInit:2,wpRate:4,nwpInit:5,nwpRate:3}};
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
  Monk:       [0,2250,4750,10000,22500,47500,98000,200000,350000,500000,700000,950000,1250000,1750000,2250000,2750000,3250000,null,null,null],
};
function xpForLevel(cls,lvl){var t=XP_TABLE[cls];return t?t[Math.max(0,Math.min(19,lvl-1))]||0:0;}
function xpToNextLevel(cls,lvl){if(cls==="Monk"&&lvl>=17)return null;if(lvl>=20)return null;var t=XP_TABLE[cls];return t?t[Math.min(19,lvl)]:null;}
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
var WIZARD_SCHOOLS=["Abjuration","Alteration","Chronomancy","Conjuration/Summoning","Divination","Enchantment/Charm","Illusion/Phantasm","Invocation/Evocation","Mentalism","Necromancy"];

// Priest Presets
var PRIEST_PRESETS={"Cleric":{cost:100,major:["All","Astral","Charm","Combat","Creation","Divination","Guardian","Healing","Necromantic","Protection","Summoning"],minor:["Elemental Water","Elemental Earth"],abilities:["Turn undead"],limitations:[]},"Druid":{cost:70,major:["All","Animal","Elemental (All)","Healing","Plant","Sun","Weather"],minor:[],abilities:["Identify plants/animals","Pass without trace","Shapechange","Communication","Immunity to charm"],limitations:["Armor: Leather only","Weapons: Druid list"]},"Crusader":{cost:55,major:["All","Combat","Guardian","Healing","War","Wards"],minor:["Necromantic","Protection"],abilities:["Combat bonus (warrior THAC0)"],limitations:[]},"Monk":{cost:60,major:["All","Divination","Guardian","Numbers","Thought"],minor:["Combat","Healing","Necromantic","Time"],abilities:["AC improvement","Unarmed combat"],limitations:["Armor: None"]},"Shaman":{cost:60,major:["All","Animal","Protection","Summoning","Travelers","Wards"],minor:["Healing","Plant"],abilities:["Spirit powers (all)"],limitations:[]}};

// Wizard Presets — book-accurate specialist class features from Player's Option: Spells & Magic.
// Class features (c:0) are innate abilities, not CP purchases. Learning bonus +15% (one school)
// is the only real CP spend (5 CP); school selection costs 5 CP. Remaining ~30 CP are free.
var WIZARD_PRESETS={
  "Illusionist":{cost:10,schools:["Illusion/Phantasm"],
    abilities:["Illusionist: +2 saves vs illusions (8th)","Illusionist: Dispel illusion 3/day (11th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: INT 16. Opposed schools: Necromancy, Invocation/Evocation, Abjuration."},
  "Abjurer":    {cost:10,schools:["Abjuration"],
    abilities:["Abjurer: +2 saves vs para/poison/death (8th)","Abjurer: AC bonus +1 (11th)","Abjurer: Immune to hold spells (14th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: CON 15. Opposed schools: Alteration, Illusion/Phantasm."},
  "Conjurer":   {cost:10,schools:["Conjuration/Summoning"],
    abilities:["Conjurer: No components for conjurations (11th)","Conjurer: Dispel summoned creatures 3/day (14th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: CON 15. Opposed schools: Divination, Invocation/Evocation."},
  "Diviner":    {cost:10,schools:["Divination"],
    abilities:["Diviner: Find traps 3/day (11th)","Diviner: Immune to scrying spells (14th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: INT 16. Opposed school: Conjuration/Summoning only."},
  "Enchanter":  {cost:10,schools:["Enchantment/Charm"],
    abilities:["Enchanter: Free action 1/day (11th)","Enchanter: Immune to charm spells (14th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: INT 16. Opposed schools: Invocation/Evocation, Necromancy."},
  "Evoker":     {cost:10,schools:["Invocation/Evocation"],
    abilities:["Evoker: +2 saves vs invocation/evocation (8th)","Evoker: +3 saves vs invocation/evocation (11th)","Evoker: Immune to one invocation spell ≤3rd level (14th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: CON 16. Opposed schools: Enchantment/Charm, Conjuration/Summoning."},
  "Necromancer":{cost:10,schools:["Necromancy"],
    abilities:["Necromancer: +2 saves vs necromancy (8th)","Necromancer: Speak with dead at will (11th)","Necromancer: +2 saves vs undead attacks (14th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: WIS 16. Opposed schools: Illusion/Phantasm, Enchantment/Charm."},
  "Transmuter": {cost:10,schools:["Alteration"],
    abilities:["Transmuter: +2 saves vs alteration (8th)","Transmuter: +3 saves vs alteration (11th)","Learning bonus +15% (one school)"],
    limitations:[],
    note:"Req: DEX 15. Opposed schools: Necromancy, Abjuration."},
};
var PRIEST_ABILITIES={"Animal empathy":{c:10},"AC improvement":{c:15},"Casting time reduction":{c:5},"Cold resistance":{c:5},"Combat bonus (warrior THAC0)":{c:20},"Communication":{c:10},"Detect evil":{c:10},"Detect undead":{c:10},"Expert healer":{c:10},"Extended duration (one sphere)":{c:10},"Extended duration (all)":{c:15},"Fire/electrical resistance":{c:7},"Followers (8th level)":{c:5},"Followers (any level)":{c:10},"Hit point bonus (d10)":{c:10},"Identify plants/animals":{c:5},"Identify plants/animals (1st)":{c:8},"Immunity to charm":{c:5},"Immunity to magic":{c:15},"Immunity to disease":{c:10},"Inspire allies":{c:5},"Enrage allies":{c:10},"Know alignment":{c:15},"Lay on hands":{c:10},"Pass without trace":{c:5},"Pass without trace (1st)":{c:7},"Shapechange":{c:15},"Turn undead":{c:15},"Unarmed combat":{c:15},"Warrior Con bonus":{c:15},"Warrior Con + Str":{c:20},"Weapon: one edged":{c:5},"Weapon: any":{c:10},"Weapon specialization":{c:25},"Wizardly priest":{c:25},"Thief ability (1)":{c:10},"Thief ability (2)":{c:15},"Spirit powers (one)":{c:30},"Spirit powers (all)":{c:40}};

// Priest Limitations
var PRIEST_LIMITS={"Armor: Chain or lighter":{r:5},"Armor: Studded leather":{r:10},"Armor: None":{r:15},"Armor: Leather only":{r:8},"Awkward casting":{r:5},"Behavior/taboo":{r:2},"Ceremony/observance":{r:5},"Difficult spell acquisition":{r:5},"Fanaticism":{r:5},"Hazardous spells":{r:10},"Limited items: Potions/scrolls":{r:5},"Limited items: Rings":{r:5},"Limited items: Rods/staves/wands":{r:5},"Limited items: Misc magic":{r:5},"Limited items: Weapons/armor":{r:5},"Limited spell selection":{r:5},"Reduced HP (d6)":{r:10},"Reduced HP (d4)":{r:20},"Reduced spell progression":{r:15},"Slower casting times":{r:5},"Talisman required":{r:8},"Weapons: Staff/club/hammer/mace/flail":{r:5},"Weapons: None":{r:15},"Weapons: Druid list":{r:3}};

// Wizard Abilities
var WIZARD_ABILITIES={"Armor: Padded":{c:5},"Armor: Leather/studded":{c:10},"Armor: Any":{c:15},"Auto spell acquisition (one school)":{c:2},"Auto spell acquisition (any school)":{c:5},"Bonus spells (one school)":{c:10},"Bonus spells (any school)":{c:15},"Casting time reduction (one school)":{c:2},"Casting time reduction (all)":{c:5},"Combat bonus (rogue THAC0)":{c:8},"Combat bonus (priest THAC0)":{c:10},"Constitution adjustment (warrior)":{c:5},"Detect magic":{c:10},"Dispel (1/day)":{c:10},"Dispel (3/day)":{c:15},"Enhanced casting level":{c:10},"Extended duration (one school)":{c:10},"Extended duration (all)":{c:15},"Followers":{c:10},"Improved Hit Die (d6)":{c:10},"Improved Hit Die (d8)":{c:20},"Learning bonus +15% (one school)":{c:5},"Learning bonus +25% (one school)":{c:7},"No components (one school)":{c:5},"No components (any school)":{c:8},"Priestly wizard (minor sphere)":{c:10},"Priestly wizard (major sphere)":{c:15},"Range increase +25% (one school)":{c:5},"Range increase +50% (one school)":{c:7},"Read magic":{c:5},"Research bonus (one school)":{c:5},"Research bonus (all)":{c:10},"School knowledge +1/-1 saves":{c:5},"School knowledge +2/-2 saves":{c:8},"Thief ability (1)":{c:10},"Thief ability (2)":{c:15},"Weapon: Cleric/thief list":{c:10},"Weapon: Any":{c:15},"Weapon specialization":{c:15},"Learning bonus +15% (all schools)":{c:10},"Learning bonus +25% (all schools)":{c:14},"Range increase +25% (all schools)":{c:10},"Range increase +50% (all schools)":{c:14},"Proficiency group crossovers":{c:5},"Immunity (one spell)":{c:11},
// Specialist class features — innate abilities from the book, not CP purchases
"Illusionist: +2 saves vs illusions (8th)":{c:0},"Illusionist: Dispel illusion 3/day (11th)":{c:0},
"Abjurer: +2 saves vs para/poison/death (8th)":{c:0},"Abjurer: AC bonus +1 (11th)":{c:0},"Abjurer: Immune to hold spells (14th)":{c:0},
"Conjurer: No components for conjurations (11th)":{c:0},"Conjurer: Dispel summoned creatures 3/day (14th)":{c:0},
"Diviner: Find traps 3/day (11th)":{c:0},"Diviner: Immune to scrying spells (14th)":{c:0},
"Enchanter: Free action 1/day (11th)":{c:0},"Enchanter: Immune to charm spells (14th)":{c:0},
"Evoker: +2 saves vs invocation/evocation (8th)":{c:0},"Evoker: +3 saves vs invocation/evocation (11th)":{c:0},"Evoker: Immune to one invocation spell ≤3rd level (14th)":{c:0},
"Necromancer: +2 saves vs necromancy (8th)":{c:0},"Necromancer: Speak with dead at will (11th)":{c:0},"Necromancer: +2 saves vs undead attacks (14th)":{c:0},
"Transmuter: +2 saves vs alteration (8th)":{c:0},"Transmuter: +3 saves vs alteration (11th)":{c:0}};

// CP ability descriptive text for Sheet tab display
var CP_ABILITY_DESC={
  // Priest abilities
  "Animal empathy":"Animal Empathy — speak with animals at will; +2 reaction from animals",
  "Casting time reduction":"Casting Time Reduction — all spells cast 1 segment faster",
  "Cold resistance":"Cold Resistance — +2 to saves vs. cold; take half damage from cold",
  "Communication":"Communication — speak/understand any natural creature (animals, plants, etc.)",
  "Detect evil":"Detect Evil — 1/day, as spell (60 ft range, 1 round/level duration)",
  "Detect undead":"Detect Undead — 1/day, 60 ft range, concentration",
  "Expert healer":"Expert Healer — healing spells restore +1 HP/die; natural recovery accelerated",
  "Extended duration (one sphere)":"Extended Duration (one sphere) — spells in chosen sphere last 50% longer",
  "Extended duration (all)":"Extended Duration (all spheres) — all spells last 50% longer",
  "Fire/electrical resistance":"Fire/Electrical Resistance — +2 saves vs. fire & electricity; half damage",
  "Followers (8th level)":"Followers — attract 2d10 × 10 followers at 8th level",
  "Followers (any level)":"Followers — attract followers at any level (as 8th-level ability)",
  "Identify plants/animals":"Identify Plants/Animals — at will, as per spell ability",
  "Identify plants/animals (1st)":"Identify Plants/Animals (1st) — 1/day at 1st level; at will at higher levels",
  "Immunity to charm":"Immunity to Charm — immune to all charm/enchantment spells",
  "Immunity to disease":"Immunity to Disease — immune to all natural and magical diseases",
  "Immunity to magic":"Immunity to Magic — +4 to saves vs. magic; immune to cantrips",
  "Inspire allies":"Inspire Allies — allies within 30 ft gain +1 to morale and attack rolls",
  "Enrage allies":"Enrage Allies — allies berserk: +1 hit/damage, -1 AC, ignore morale",
  "Know alignment":"Know Alignment — 1/day per level; detect alignment at touch",
  "Lay on hands":"Lay on Hands — heal HP/day equal to level × 2 (granted-power version)",
  "Pass without trace":"Pass without Trace — at will, as per druid spell",
  "Pass without trace (1st)":"Pass without Trace (1st) — 1/day at 1st level; at will later",
  "Shapechange":"Shapechange — as Druid shapeshifting ability",
  "Turn undead":"Turn Undead — turn/command undead as a cleric of same level",
  "Unarmed combat":"Unarmed Combat — use warrior unarmed combat rules; 1d3+STR dmg",
  "Weapon: one edged":"Weapon: One Edged — may use any one type of edged weapon",
  "Weapon: any":"Weapon: Any — may use any weapon",
  "Weapon specialization":"Weapon Specialization — may specialize in a weapon (+1 hit, +2 dmg, extra attack)",
  "Wizardly priest":"Wizardly Priest — access to 1–3 wizard schools (select in CP tab)",
  "Thief ability (1)":"Thief Ability (1) — one thief skill at level/2 proficiency",
  "Thief ability (2)":"Thief Ability (2) — two thief skills at level/2 proficiency",
  "Spirit powers (one)":"Spirit Powers (one) — commune with one spirit type; minor spirit abilities",
  "Spirit powers (all)":"Spirit Powers (all) — full shaman spirit powers (all types)",
  // Wizard abilities
  "Armor: Padded":"Armor: Padded — can wear padded armor while casting spells",
  "Armor: Leather/studded":"Armor: Leather/Studded — can wear leather or studded leather while casting",
  "Armor: Any":"Armor: Any — can wear any armor while casting spells",
  "Auto spell acquisition (one school)":"Auto Spell Acquisition (one school) — automatically learn spells of chosen school on level-up",
  "Auto spell acquisition (any school)":"Auto Spell Acquisition (any school) — automatically learn spells of any school on level-up",
  "Bonus spells (one school)":"Bonus Spells (one school) — +1 spell slot per spell level in chosen school",
  "Bonus spells (any school)":"Bonus Spells (any school) — +1 spell slot per spell level in any school",
  "Casting time reduction (one school)":"Casting Time Reduction (one school) — chosen school spells cast 1 segment faster",
  "Casting time reduction (all)":"Casting Time Reduction (all schools) — all spells cast 1 segment faster",
  "Detect magic":"Detect Magic — at will, as per spell (concentration, 1 round)",
  "Dispel (1/day)":"Dispel Magic — 1/day as an innate ability",
  "Dispel (3/day)":"Dispel Magic — 3/day as an innate ability",
  "Enhanced casting level":"Enhanced Casting Level — +2 caster levels for determining spell effects and range",
  "Extended duration (one school)":"Extended Duration (one school) — spells of chosen school last 50% longer",
  "Followers":"Followers — attract apprentices and followers at high level",
  "Learning bonus +15% (one school)":"Learning Bonus +15% (one school) — +15% to spell learning rolls in chosen school",
  "Learning bonus +25% (one school)":"Learning Bonus +25% (one school) — +25% to spell learning rolls in chosen school",
  "No components (one school)":"No Components (one school) — chosen school spells need no material/somatic components",
  "No components (any school)":"No Components (any school) — all spells need no material/somatic components",
  "Priestly wizard (minor sphere)":"Priestly Wizard (minor sphere) — access to one minor priest sphere",
  "Priestly wizard (major sphere)":"Priestly Wizard (major sphere) — access to one major priest sphere",
  "Range increase +25% (one school)":"Range Increase +25% (one school) — range of chosen school spells increased by 25%",
  "Range increase +50% (one school)":"Range Increase +50% (one school) — range of chosen school spells increased by 50%",
  "Read magic":"Read Magic — at will, without spell; can read any magical script",
  "Research bonus (one school)":"Research Bonus (one school) — 25% less time and cost for spell research in chosen school",
  "Research bonus (all)":"Research Bonus (all schools) — 50% less time and cost for all spell research",
  "School knowledge +1/-1 saves":"School Knowledge +1/−1 Saves — +1 to saves vs. chosen school; enemy saves −1 vs. your chosen-school spells",
  "School knowledge +2/-2 saves":"School Knowledge +2/−2 Saves — +2 to saves vs. chosen school; enemy saves −2 vs. your chosen-school spells",
  "Thief ability (1)":"Thief Ability (1) — one thief skill at level/2 proficiency",
  "Thief ability (2)":"Thief Ability (2) — two thief skills at level/2 proficiency",
  "Weapon: Cleric/thief list":"Weapon: Cleric/Thief List — may use weapons from cleric and thief weapon lists",
  "Weapon: Any":"Weapon: Any — may use any weapon",
};

// Spell-like granted power cost formula (Player's Option: Spells & Magic)
// Base: 10 CP + level modifier + frequency modifier
// Level: +1 CP/level (priest spell) or +2 CP/level (wizard spell)
// Frequency: 'week'=+0, '1/day'=+5, '2/day'=+6, '3/day'=+7, 'continuous'=+10
function spellPowerCost(spellLevel,spellType,freq){
  var base=10;
  var lvlCost=(spellType==='wizard'?2:1)*spellLevel;
  var freqCost=freq==='week'?0:freq==='continuous'?10:(5+(parseInt(freq)||1)-1);
  return base+lvlCost+freqCost;
}

// Wizard Limitations
var WIZARD_LIMITS={"Awkward casting":{r:5},"Behavior/taboo":{r:2},"Difficult memorization":{r:5},"Hazardous spells":{r:10},"Learning penalty -15%":{r:5},"Learning penalty -25%":{r:8},"Limited items: Potions/scrolls":{r:5},"Limited items: Rings":{r:5},"Limited items: Rods/staves/wands":{r:5},"Limited items: Misc/weapons/armor":{r:5},"Reduced HP (d3)":{r:10},"Reduced spell knowledge":{r:7},"Reduced spell progression":{r:15},"Slower casting time +3":{r:2},"Slower casting time (next unit)":{r:5},"Supernatural constraint":{r:5},"Talisman required":{r:8},"Weapons: No proficiency":{r:3},"Weapons: Cannot wield":{r:5},"Environmental condition (specific)":{r:5},"Environmental condition (common)":{r:15},"Environmental condition (everyday)":{r:20}};

// ── OA MONK DATA ─────────────────────────────────────────────────────────────
// Table 21: Monk Capabilities by level (index = level, 1-17)
var MONK_CAPS=[null,
  {ac:10,move:15,addAT:null, addDmg:null,     openLock:25,findTrap:20,moveSilent:15,hideShadow:10,hearNoise:10,climbWall:85,surprise:"Normal"},
  {ac:9, move:16,addAT:null, addDmg:null,     openLock:29,findTrap:25,moveSilent:21,hideShadow:15,hearNoise:10,climbWall:86,surprise:32},
  {ac:8, move:17,addAT:null, addDmg:null,     openLock:33,findTrap:30,moveSilent:27,hideShadow:20,hearNoise:15,climbWall:87,surprise:30},
  {ac:7, move:18,addAT:"1/4",addDmg:null,     openLock:37,findTrap:35,moveSilent:33,hideShadow:25,hearNoise:15,climbWall:88,surprise:28},
  {ac:7, move:19,addAT:"1/4",addDmg:"+1",     openLock:42,findTrap:40,moveSilent:40,hideShadow:31,hearNoise:20,climbWall:89,surprise:26},
  {ac:6, move:20,addAT:"1/2",addDmg:"+2",     openLock:47,findTrap:45,moveSilent:47,hideShadow:37,hearNoise:20,climbWall:90,surprise:24},
  {ac:5, move:21,addAT:"1/2",addDmg:"+2",     openLock:52,findTrap:50,moveSilent:55,hideShadow:43,hearNoise:25,climbWall:91,surprise:22},
  {ac:4, move:22,addAT:"1/2",addDmg:"+1D",    openLock:57,findTrap:55,moveSilent:62,hideShadow:49,hearNoise:25,climbWall:92,surprise:20},
  {ac:3, move:23,addAT:"1/1",addDmg:"+1D+1",  openLock:62,findTrap:60,moveSilent:70,hideShadow:56,hearNoise:30,climbWall:93,surprise:18},
  {ac:3, move:24,addAT:"1/1",addDmg:"+1D+2",  openLock:67,findTrap:65,moveSilent:78,hideShadow:63,hearNoise:30,climbWall:94,surprise:16},
  {ac:2, move:25,addAT:"3/2",addDmg:"+1D+2",  openLock:72,findTrap:70,moveSilent:86,hideShadow:70,hearNoise:35,climbWall:95,surprise:14},
  {ac:1, move:26,addAT:"3/2",addDmg:"+2D",    openLock:77,findTrap:75,moveSilent:94,hideShadow:77,hearNoise:35,climbWall:96,surprise:12},
  {ac:0, move:27,addAT:"3/2",addDmg:"+2D",    openLock:82,findTrap:80,moveSilent:99,hideShadow:85,hearNoise:40,climbWall:97,surprise:10},
  {ac:-1,move:28,addAT:"2/1",addDmg:"+2D+1",  openLock:87,findTrap:85,moveSilent:99,hideShadow:93,hearNoise:40,climbWall:98,surprise:8},
  {ac:-1,move:29,addAT:"2/1",addDmg:"+3D",    openLock:92,findTrap:90,moveSilent:99,hideShadow:99,hearNoise:50,climbWall:99,surprise:6},
  {ac:-2,move:30,addAT:"3/1",addDmg:"+3D+1",  openLock:97,findTrap:95,moveSilent:99,hideShadow:99,hearNoise:50,climbWall:99,surprise:4},
  {ac:-3,move:32,addAT:"3/1",addDmg:"+4D",    openLock:99,findTrap:99,moveSilent:99,hideShadow:99,hearNoise:55,climbWall:99,surprise:2},
];
var MONK_LEVEL_TITLES=["","Novice","Initiate","Brother","Disciple","Immaculate","Master","Superior Master","Master of Dragons","Master of the North Wind","Master of the West Wind","Master of the South Wind","Master of the East Wind","Master of Winter","Master of Autumn","Master of Summer","Master of Spring","Grand Master of Flowers"];
// Martial arts style form and method data (Table 69)
var STYLE_FORM_DATA={"Hard":{acMod:1,atMod:1,dmgMod:4},"Soft":{acMod:3,atMod:0,dmgMod:2},"Hard/Soft":{acMod:2,atMod:1,dmgMod:3}};
var STYLE_METHOD_DATA={
  "Kick":      {acMod:1,atMod:1,dmgMod:4,bodyPart:"Foot"},
  "Lock":      {acMod:1,atMod:1,dmgMod:2,bodyPart:"Body"},
  "Movement":  {acMod:2,atMod:1,dmgMod:2,bodyPart:"Legs"},
  "Push":      {acMod:2,atMod:1,dmgMod:1,bodyPart:"Hand"},
  "Strike":    {acMod:1,atMod:1,dmgMod:4,bodyPart:"Hand"},
  "Throw":     {acMod:1,atMod:1,dmgMod:2,bodyPart:"Body"},
  "Vital Area":{acMod:2,atMod:1,dmgMod:4,bodyPart:"Hand and foot"},
  "Weapon":    {acMod:1,atMod:1,dmgMod:0,bodyPart:"Hand and arm"},
};
function dmgModToDie(m){if(m<=4)return 4;if(m<=6)return 6;if(m<=8)return 8;if(m<=10)return 10;return 12;}
// Common pre-built styles
var COMMON_STYLES={
  "Karate":     {form:"Hard",    method:"Strike",   name:"Karate"},
  "Kung-fu":    {form:"Soft",    method:"Lock",     name:"Kung-fu"},
  "Tae Kwon Do":{form:"Hard",    method:"Kick",     name:"Tae Kwon Do"},
  "Jujutsu":    {form:"Soft",    method:"Throw",    name:"Jujutsu"},
};
// Special maneuvers by method, ranked by difficulty
var MONK_MANEUVERS={
  "Kick":[
    {name:"Circle Kick",   rank:1,type:"hard",     desc:"Spinning kick: 2× damage on hit; lose next attack if miss"},
    {name:"Flying Kick",   rank:2,type:"hard",     desc:"5ft run-up; 3× damage on hit; fall down (lose round) if miss"},
    {name:"Backward Kick", rank:3,type:"hard/soft",desc:"Attack foe directly behind without turning; normal damage; no penalty on miss"},
  ],
  "Lock":[
    {name:"Choke Hold",   rank:1,type:"hard/soft",desc:"Apply: opponent unconscious in 1 round if can't escape (escape roll −2); no attacks while applying"},
    {name:"Locking Block",rank:2,type:"soft",     desc:"Lock weapon/limb; locked foe can't attack; +4 to foot attacks vs. locked foe"},
    {name:"Incapacitator",rank:3,type:"hard/soft",desc:"2× damage + render limb useless 24hr; victim saves vs. paralyzation to resist"},
    {name:"Immobilizing", rank:4,type:"hard/soft",desc:"Hold foe unable to act; can still attack with free hand/foot; victim escapes on to-hit −6"},
  ],
  "Movement":[
    {name:"Feint",            rank:1,type:"hard/soft",desc:"Costs one attack; next attack +2 to hit on success; no penalty on miss"},
    {name:"Prone Fighting",   rank:2,type:"soft",     desc:"Always in effect: fight normally while prone"},
    {name:"Immovability",     rank:3,type:"soft",     desc:"Always in effect: save vs. paralyzation when knocked/thrown off feet"},
    {name:"Missile Deflection",rank:4,type:"soft",    desc:"Always in effect: save vs. paralyzation to dodge each nonmagical missile (must be aware)"},
    {name:"Leap",             rank:5,type:"soft",     desc:"Standing: 4ft up, 3+level ft fwd. Running: 8ft up, 10+level ft fwd. Costs one attack"},
    {name:"Speed",            rank:6,type:"hard/soft",desc:"1/day, 5 rounds: 2× melee attacks and 2× combat movement; rest 1d3 rounds after"},
    {name:"Slow Resistance",  rank:7,type:"hard/soft",desc:"Always in effect: immune to all slow effects"},
  ],
  "Push":[
    {name:"Concentrated Push",rank:1,type:"soft",desc:"Knock foe 1ft/level back; if >3ft, save vs. paralyzation or fall; miss → foes get +2 to hit"},
    {name:"Sticking Touch",   rank:2,type:"soft",desc:"+2 to hit and +2 AC while in contact; broken by speed/Leap beyond your ability"},
    {name:"One Finger",       rank:3,type:"soft",desc:"Concentrated Push at range (1ft/level) without touching; only action that round"},
  ],
  "Strike":[
    {name:"Iron Fist",    rank:1,type:"hard",desc:"Always in effect (hand styles): 1d10 dmg/attack; else 1d10 on one attack/round"},
    {name:"Crushing Blow",rank:2,type:"hard",desc:"Only action that round; break 1/2in wood or 1/4in stone per level; vs. living: normal + level dmg"},
    {name:"Eagle Claw",   rank:3,type:"hard",desc:"Only action that round; shatter objects, crush metal, 3d10 damage on hit"},
  ],
  "Throw":[
    {name:"Fall",         rank:1,type:"hard/soft",desc:"Always in effect: take only ½ damage from any fall"},
    {name:"Instant Stand",rank:2,type:"hard/soft",desc:"Regain feet automatically using one attack slot"},
    {name:"Hurl",         rank:3,type:"hard",     desc:"Throw foe 1d4 ft; 2× damage; miss → lose remaining attacks and lose next init"},
    {name:"Great Throw",  rank:4,type:"soft",     desc:"Throw stationary foe 1ft/level or charging foe 6+1ft/level; 3× damage; miss → knocked down"},
  ],
  "Vital Area":[
    {name:"Pain Touch",      rank:1,type:"soft",desc:"No damage; hit → −2 to hit and +2 to be hit for 1d3 rounds; no penalty on miss"},
    {name:"Stunning Touch",  rank:2,type:"soft",desc:"No damage; hit → save vs. paralyzation or stunned 1d4 rounds"},
    {name:"Paralyzing Touch",rank:3,type:"soft",desc:"Hit + failed save → paralyzed 1d6 turns"},
    {name:"Distance Death",  rank:4,type:"soft",desc:"Range 1ft/level; choose Pain (no save), Stunning (−2 save), Paralyzing, or 3× normal damage"},
  ],
  "Weapon":[
    {name:"Weapon Catch",  rank:1,type:"hard/soft",desc:"Lock enemy weapon/limb; +2 to hit locked foe; miss → own weapon disarmed"},
    {name:"Weapon Breaker",rank:2,type:"hard/soft",desc:"Break enemy weapon on successful hit (save vs. crushing blow); no damage"},
    {name:"Steel Cloth",   rank:3,type:"soft",     desc:"Wield cloth as a spear (cannot throw); automatic"},
  ],
  "Mental":[
    {name:"Meditation",       rank:1,type:"hard/soft",desc:"Gain all shukenja meditation powers"},
    {name:"All-around Sight", rank:2,type:"soft",     desc:"Always in effect: detect all non-invisible foes; immune to back-attack penalty"},
    {name:"Mental Resistance",rank:3,type:"soft",     desc:"Always in effect: +2 to saves vs. charm, illusion, hold spells"},
    {name:"Blind Fighting",   rank:4,type:"soft",     desc:"Always in effect: only −1 penalty in darkness/blindness; disabled if also silenced"},
    {name:"Ironskin",         rank:5,type:"hard",     desc:"+2 to AC (only when unarmored; always in effect)"},
    {name:"Levitation",       rank:6,type:"soft",     desc:"After 1 turn concentration: levitate at 5ft/round; no actions while levitating"},
  ],
};
// Level-by-level special abilities text (for sheet display)
var MONK_LEVEL_ABILITIES=[
  "",
  "Ki Power: once/day/level — on successful save vs. magic, take NO damage (normally ½). Declare before or after the die is rolled.",
  "Ki Power: 1/day/level. Unarmed weapon damage: +1 per 2 levels.",
  "Speak with Animals (non-magical, as per spell).",
  "Fall ≤20ft without damage (within 1ft of wall). ESP: only 30% success vs. monk (−2%/level beyond 4).",
  "Immune to disease. Immune to haste and slow spells.",
  "Fall ≤30ft without damage (within 4ft of wall). Cataleptic state: simulate death for up to 2×level turns (must declare duration).",
  "Self-heal 2–5 HP/day (1d4+1). +1 HP/day per level beyond 7.",
  "Speak with Plants (as per spell). Attract 2–5 1st-level monk followers (if monastery HQ exists).",
  "Ki Power (improved): ½ damage even on a failed save vs. magic. Charm/hypnosis/suggestion: only 50% chance to affect (+5%/level beyond 9).",
  "Telepathic/mind blast: defend as INT 18.",
  "Immune to all poison.",
  "Immune to geas and quest spells.",
  "Free special maneuver of player's choice (any method, any rank).",
  "","","",""
];

var BUFF_SPELLS={
  "Ability Alteration":{"desc":"Temporarily transfers ability points between physical abilities at 2:1 ratio; can boost STR, DEX, CON etc. at cost of another stat"},
  "Adamantite Mace":{"thac0Bonus":2,"dmgBonus":2,"desc":"+2 to attack and damage rolls with transmuted adamantite weapon"},
  "Amulet":{"acBonus":1,"saveBonus":1,"desc":"+1 AC and saves vs one specific feared being"},
  "Ancestral Blessing - Oriental":{"saveBonus":1,"desc":"+1 to all saving throws"},
  "Aranen's Divinial Armor":{"acBonus":2,"desc":"AC and HP bonus to warriors of same alignment in metal armor (tied to caster level)"},
  "Archer's Redoubt - Elf":{"acBonus":2,"saveBonus":1,"desc":"Immobile barrier: AC 2 frontal, AC 0 other directions; +1 bonus to all saving throws"},
  "Armor of Darkness":{"acBonus":3,"desc":"Improves AC by 1 per 4 caster levels (round down); reduces nonmagical damage by 1d4 per round (2d4 at 12th level+)"},
  "Astaroth's Augmentation":{"strBonus":1,"desc":"Permanently raises one ability score by 1 point (to max 18); requires quarterly sacrifices to maintain"},
  "Bane of the Defilers":{"thac0Bonus":3,"desc":"+3 to attack rolls vs defilers, double damage vs defilers"},
  "Barkskin":{"acBonus":2,"saveBonus":1,"desc":"AC improves by 2; saving throws vs. non-magic attacks +1"},
  "Battle Song":{"thac0Bonus":1,"dmgBonus":1,"saveBonus":1,"desc":"+1 attack, +1 damage, +1 saves, +2 ability checks"},
  "Beast Claw":{"thac0Bonus":2,"desc":"+2 attack bonus with claws (also grants STR 18/76 for weapon attacks)"},
  "Beast Tattoo - Elf":{"strBonus":1,"desc":"+1 to one ability score associated with tattooed animal (e.g. STR for bear)"},
  "Berserk":{"saveBonus":2,"desc":"Berserked warriors gain +2 bonus to all saving throws vs. spell while under the spell effect"},
  "Bird Of Prey - Old Empire":{"thac0Bonus":2,"desc":"Bird of prey attacks every other round with +2 THAC0 bonus over caster base; deals 2d4+2 damage"},
  "Black Talon":{"thac0Bonus":1,"desc":"+1 to attack rolls with transformed arm/talon"},
  "Blazing Sword - Halfling":{"thac0Bonus":1,"dmgBonus":2,"desc":"+1 to hit and +2 to damage (Blazing Sword); or +3 hit/+5 dmg one blow (Great Blow)"},
  "Blessed Craftsmanship -Dwarf":{"desc":"+3 bonus to nonweapon proficiency checks for artisan crafting during spell duration"},
  "Blessing of Vhaeraun - Drow":{"thac0Bonus":3,"desc":"+3 attack bonus on one single attack (one-time use)"},
  "Blood Mantle":{"acBonus":3,"desc":"+3 bonus to Armor Class; +3 saves vs. fire/cold; -3 saves vs. lightning/electricity"},
  "Body Blades":{"acBonus":2,"desc":"+2 AC bonus from blade spines covering the body"},
  "Boon of Fortune":{"thac0Bonus":2,"dmgBonus":2,"desc":"+2 attack and damage bonus with proficient weapons; +2 bonus to all ability checks; can wield unfamiliar weapons as if proficient"},
  "Boon of Lathander":{"thac0Bonus":1,"saveBonus":1,"desc":"For 6 rounds: recipient gets +1 to attack rolls and saving throws, plus an extra attack per round"},
  "Bramblestaff":{"thac0Bonus":2,"desc":"+2 to attack rolls; inflicts double damage for spell duration; can hit creatures requiring magical weapons"},
  "Champion's Strength":{"desc":"Champion gains THAC0 and damage bonuses contributed by group members (non-magical bonuses only)"},
  "Chant":{"thac0Bonus":1,"dmgBonus":1,"saveBonus":1,"desc":"+1 attack, +1 damage, +1 saves for allies in area (maintained by chanting)"},
  "Chaos Ward":{"acBonus":1,"saveBonus":2,"desc":"+1 AC melee, +2 AC and saves vs missiles/ranged spells"},
  "Charm of Isis -Old Empire":{"desc":"Charm provides +1 per 3 caster levels (max +5) to AC or saving throws (not both), while worn against skin"},
  "Circle of Protection from Spirits":{"acBonus":2,"desc":"+2 AC bonus vs spirit attacks for those inside the circle"},
  "Circle of Stone - Dwarf":{"saveBonus":4,"thac0Bonus":3,"desc":"All in circle gain +4 to saving throws; dwarves gain +3 to attack rolls and can hit foes normally immune to non-magical weapons"},
  "Coat of Mist":{"acBonus":2,"saveBonus":2,"desc":"+2 AC and +2 saves vs fire/sun attacks (requires natural mist conditions)"},
  "Crawling Darkness":{"acBonus":4,"thac0Bonus":2,"desc":"+4 AC bonus and +2 to attack rolls from writhing darkness shroud"},
  "Dark Aura":{"thac0Bonus":3,"dmgBonus":3,"desc":"Caster gets +3 to attack and damage; evil creatures in aura get +1 to attack/damage; good creatures get -1 penalty"},
  "Deadly Dance":{"acBonus":2,"desc":"Recipient gains +2 Dexterity and perfect balance for duration; the Dex bonus improves AC and related rolls"},
  "Defensive Harmony":{"acBonus":1,"desc":"Affected creatures gain a defensive AC bonus through coordinated group tactics; bonus improves as more allies participate"},
  "Dragon Scales":{"acBase":4,"desc":"Grants caster base AC 4 (sets base AC to 4, only helps if unarmored or wearing worse than AC 4); dragon scales covering body for duration"},
  "Draw Upon Holy Might":{"strLvlBonus":true,"desc":"+1 to one ability score (STR, DEX, CON, or CHA) per 3 caster levels"},
  "Dust Shield - Old Empire":{"acBonus":3,"desc":"When configured as arm shield: +3 bonus to Armor Class while spell is active"},
  "Ebony Hand":{"thac0Bonus":1,"desc":"+1 to attack rolls per 3 levels past 1st (max +4 at 10th) for touch-delivered harmful spells"},
  "Emotion Control":{"saveBonus":2,"desc":"+2 bonus to saving throws vs. spook, taunt, irritation, know alignment, scare, emotion, fear, phantasmal killer when cast on self"},
  "Endurance of Ilmater":{"saveBonus":2,"desc":"Doubles recipient hit points (bonus hp absorbed first); all Str/Con checks auto-succeed; +2 to saving throws; system shock and disease checks auto-succeed"},
  "Everchanging Self":{"acBonus":4,"desc":"AC improves 4 pts; -1 penalty attack rolls; -2 penalty damage rolls; -3 Dex"},
  "Faith Armor":{"acBase":0,"desc":"Sets caster base AC to 0 regardless of worn armor (best possible base AC); also grants immunity to one chosen wizard school or priest sphere"},
  "Favor":{"desc":"Recipient gains 1d6 bonus to saving throws for duration; also grants one divine intervention"},
  "Favor of Tymora":{"saveBonus":4,"desc":"Grants +4/+3/+2/+1 saving throw bonuses to next four saving throws (decreasing with each use until exhausted)"},
  "Find Companion":{"desc":"Priest gains +1 bonus to all surprise rolls while companion is nearby (heightened senses of the companion)"},
  "Fire Purge":{"saveBonus":4,"desc":"Creatures in area get +4 to saving throws vs. fire attacks; magical fires deal only 50% damage; normal fires cannot burn"},
  "Flame Wall":{"saveBonus":2,"desc":"+2 bonus to saving throws vs. magical fire; protection from nonmagical fire up to 2000 F; reduces magical fire damage by 1/2"},
  "Fortitude of Uthgar":{"saveBonus":1,"desc":"+1 magical defense adjustment vs mind-affecting spells (charm, fear, etc.)"},
  "Frenzy of the Celts":{"saveBonus":1,"thac0Bonus":1,"desc":"+1 to all saving throws and attack rolls; move 50% further; never check morale while under spell"},
  "Giantsize - Halfling":{"strBonus":7,"desc":"Halfling STR becomes 19 for duration"},
  "Greater Touchsickle":{"thac0Bonus":2,"dmgBonus":2,"desc":"+2 attack and +2 damage with enchanted hand (sickle +2)"},
  "Grounding":{"saveBonus":2,"desc":"+2 saving throws vs. electrical attacks"},
  "Grounding*":{"saveBonus":2,"desc":"+2 saving throws vs. electrical attacks in warded area"},
  "Hand of the Sorcerer-King":{"saveBonus":2,"desc":"+2 bonus to all saving throws vs. magical spells"},
  "Health Blessing":{"saveBonus":4,"desc":"Recipients gain +4 bonus to saving throws vs. poison and death magic; immune to nonmagical disease for duration"},
  "Heroism":{"thac0Bonus":2,"desc":"Recipient fights as higher level; gains bonus hit points and better THAC0"},
  "Holy Flail":{"thac0Bonus":2,"desc":"Holy flail created from holy symbol or touched weapon grants +2 attack bonus for the duration"},
  "Humansize - Halfling":{"strBonus":2,"desc":"Halfling grows to human size and gains +2 Strength for duration"},
  "Ice Spikes":{"thac0Bonus":2,"desc":"Ice spikes on fist improve THAC0 by 2 for melee strikes with that fist"},
  "Image of the Sorcerer-Kings":{"saveBonus":2,"desc":"+2 bonus to saving throws vs. spells cast at the caster"},
  "Impregnable Mind":{"saveBonus":4,"desc":"+4 bonus to saving throws vs. mind-affecting magic"},
  "Interdiction":{"acBonus":1,"saveBonus":2,"thac0Bonus":1,"dmgBonus":1,"desc":"Allies of caster within area gain +2 to saving throws, +1 to attack rolls, +1 to damage rolls, and AC improves by 1; enemies suffer -2 to saves, -1 AC, -1 attack, -1 damage"},
  "Jungle Avatar":{"acBonus":2,"dmgBonus":6,"desc":"Polymorph into giant crocodilian: AC improves 2; +6 damage from STR; 20% magic resistance"},
  "Kami Absorption":{"desc":"+6 to one chosen stat (Str, Int, Wis, Dex, Con, Cha, THAC0, AC, or MV)"},
  "Leaf into Dagger":{"thac0Bonus":2,"desc":"Dagger +2 to hit; considered magical; weightless"},
  "Mace of Xvim":{"thac0Bonus":3,"dmgBonus":2,"desc":"+3 attack bonus and 1d12+2 damage with conjured magical mace for duration"},
  "Magi' .I, ~~ ~~ ~ ~":{"acBonus":4,"desc":"Enchants caster vestment to AC 5 (+1 per 3 levels beyond 5th, max AC 1), best AC applies, not cumulative"},
  "Manythings":{"acBonus":2,"desc":"Improves caster AC by 2 and deals 1d4 damage to creatures making bodily contact"},
  "Mental Prowess":{"saveBonus":6,"desc":"+6 to saving throws vs. mind-affecting spells and spell-like abilities for all in area"},
  "Metal Skin":{"acBase":2,"desc":"Sets base AC to 2 (not a bonus — only helps if current AC is worse than 2); movement halved; acts last in combat"},
  "Might of the Sorcerer-Kings":{"thac0Bonus":2,"dmgBonus":2,"desc":"+2 attack and +2 damage bonus for duration; recipient loses 1 hp when spell ends"},
  "Mists of Ghaunadaur - Drow":{"acBonus":2,"desc":"Caster is surrounded by violet mists, granting +2 AC bonus and foiling vision-based attacks"},
  "Mystic Lash":{"thac0Bonus":3,"desc":"+3 bonus to attack rolls with the mystic lash"},
  "Natural Attunement":{"saveBonus":1,"desc":"+2 bonus to surprise rolls, +1 initiative bonus, +1 saving throw bonus for duration; also grants tracking abilities"},
  "Om -Vedic":{"saveBonus":4,"desc":"+4 on saving throws with Wisdom bonuses; immune to sleep and charm while chanting"},
  "Oxen Strength":{"strLvlBonus":true,"acBase":8,"desc":"Druid gains +1 Strength per level (max 18/00) and sets base unarmored AC to 8 (does not stack with armor — only benefits unarmored characters or those with AC worse than 8). Strength bonus increases all related attack/damage modifiers."},
  "Prayer":{"thac0Bonus":1,"dmgBonus":1,"saveBonus":1,"desc":"Allies in area gain +1 to attack rolls, damage rolls, and saving throws; enemies suffer -1 penalties to same"},
  "Protection":{"saveBonus":1,"desc":"+1/3 levels (max +3 at 9th) to saving throws vs. charm spells and related effects"},
  "Protection From Animals":{"saveBonus":2,"desc":"-2 penalty on attack rolls of normal/giant mammals vs. protected creature; +2 bonus to saving throws vs. such creature attacks"},
  "Protection From Chaos":{"acBonus":2,"saveBonus":2,"desc":"Chaotic creatures suffer -2 to attack rolls; recipient gains +2 to saves vs. chaotic creatures; blocks mental control"},
  "Protection From Electricity":{"saveBonus":4,"desc":"+4 bonus to saves vs. electrical attacks; damage halved"},
  "Protection From Electricity, 10' Radius":{"saveBonus":4,"desc":"+4 bonus to saving throws vs. electrical attacks; electrical damage halved"},
  "Protection From Evil, 10' Radius":{"acBonus":2,"saveBonus":2,"desc":"-2 to evil creatures' attack rolls; +2 to saving throws for all within 10-ft. radius"},
  "Protection From Lightning":{"saveBonus":4,"desc":"+4 to saves vs. electrical attacks (on others); full immunity for caster until 10 pts/level absorbed"},
  "Protection From Prime":{"acBonus":2,"saveBonus":2,"desc":"Prime Material beings suffer -2 to attacks; +2 saves vs. Prime Material beings; blocks mental control (planar beings only, not on Prime)"},
  "Protection From Prime, 10’ Radius":{"acBonus":2,"saveBonus":2,"desc":"-2 penalty to Prime attackers' rolls; +2 to saving throws within 10-ft. radius (non-Prime plane only)"},
  "Protection From Serpents - Shaman":{"saveBonus":1,"desc":"+1 saving throw bonus vs. injected poisons; -2 attack penalty for giant/magical/intelligent snakes attacking protected creature"},
  "Protection From Spirits":{"saveBonus":2,"desc":"Recipients gain +2 on saving throws vs. lesser spirit magical attacks; +1 vs. greater spirit magical attacks"},
  "Recitation":{"thac0Bonus":2,"saveBonus":2,"desc":"+2 to attack rolls and saves for allies (+3 for same-faith); -2 penalty to enemies"},
  "Resist Acid and Corrosion":{"saveBonus":3,"desc":"Subject gains +3 bonus on saving throws vs. acid/corrosive attacks and takes half damage"},
  "Reversed Form: Create Mirage":{"acBase":6,"desc":"Barkskin effect: sets base AC to 6, improving by 1 per 4 caster levels; +1 bonus on non-magic saving throws"},
  "Right of Might - Old Empire":{"strBonus":3,"desc":"STR +1d6 (average 3) plus proportional damage increase from size growth"},
  "Ruby Axe - Gnome":{"thac0Bonus":1,"dmgBonus":1,"desc":"Caster axe gains +1 attack and +1 damage (scaling to +2 attack/+3 damage at higher levels); caster must wield it"},
  "Sand Blade":{"dmgBonus":2,"desc":"+2 damage bonus on enchanted sand blade"},
  "Seeking Mote":{"thac0Bonus":4,"desc":"+4 bonus to attack roll; deals 2d4+2 damage; follows target like magic missile"},
  "Segojan's Armor - Gnome":{"acBase":6,"desc":"Sets base AC to 6 (scale mail equivalent); negates magic missiles; acts as real armor so incompatible with bracers of defense or armor spell"},
  "Shades of Rhondang - Gnome":{"thac0Bonus":1,"dmgBonus":1,"desc":"+1 to hit and damage with hammer (higher vs. specific creature types)"},
  "Shadow Sword":{"thac0Bonus":1,"desc":"Shadow sword functions as magical sword +1 in caster's hand"},
  "Shillelagh":{"thac0Bonus":1,"desc":"+1 to attack roll; 2d4 damage vs. man-sized, 1d4+1 vs. larger; considered magical weapon"},
  "Silverbeard -Dwarf":{"acBonus":1,"desc":"+1 AC bonus if armored; AC 8 (7 with shield) if unarmored"},
  "Smiting":{"thac0Bonus":1,"dmgBonus":1,"desc":"+1 to hit and damage per 4 caster levels (max +5) on blunt weapon"},
  "Soul Forge - Dwarf":{"acBonus":1,"saveBonus":1,"desc":"+1 AC and +1 to saving throws vs evil creatures"},
  "Sparkling Sword - Halfling":{"thac0Bonus":1,"dmgBonus":1,"desc":"+1 to hit and damage (Sparkle); or +2 hit/+3 dmg one attack (Smite)"},
  "Spell Shield":{"saveBonus":3,"desc":"+3 bonus to all saving throws vs. spell; immunity to illusion/enchantment spells"},
  "Spiritual Hammer":{"thac0Bonus":1,"desc":"Hammer strikes with +1 bonus per 6 caster levels; counts as magical weapon"},
  "Steelskin - Gnome":{"acBonus":1,"desc":"+1 AC bonus per 3 priest levels (max +5); reduces recipient Dexterity to 2/3 normal"},
  "Stone Strength":{"strBonus":2,"desc":"+2 STR while active"},
  "Stoneskin - Dwarf":{"desc":"Immunity to physical attacks; blocks 1d4+1 per 2 levels attacks"},
  "Strength - Dwarf":{"strBonus":1,"desc":"Increases STR by 1d4-1d8 points depending on class"},
  "Strength - Shukenja":{"strBonus":1,"desc":"Increases STR by 1d4-1d8 points depending on class"},
  "Strength of One":{"desc":"All touched lawful creatures gain STR bonus equal to strongest group member's STR bonus to damage"},
  "Sunblade":{"thac0Bonus":2,"dmgBonus":2,"desc":"+2 to attacks and damage; double damage vs. sunlight-vulnerable creatures"},
  "Superheroism":{"desc":"Temporarily raises recipient's effective experience level, granting bonus HD and combat ability"},
  "Unfailing Endurance":{"desc":"+4 bonus to saves vs. weakness, fatigue, and enfeeblement effects"},
  "Wolfjaws":{"thac0Bonus":1,"desc":"+1 attack bonus with jaws or other weapon while spell is in effect; 2d4 damage with jaws, 2 attacks/round"},
  "Woodiron":{"thac0Bonus":1,"dmgBonus":1,"desc":"+1 to hit and damage for wooden weapons; wooden shields become +1 AC"},
};

// Legacy hardcoded durations — kept as fallback for 3 original buff spells
var SPELL_DURATIONS={
  "Stone Strength":function(l){return l*10;},   // 1 turn/level
  "Barkskin":      function(l){return 4+l;},    // 4 rds + 1/level
  "Oxen Strength": function(l){return l;}       // 1 round/level
};

// Parse an AD&D 2E duration string → rounds (integer), null (permanent/ongoing), or 0 (unknown/special)
// AD&D: 1 turn = 10 rounds, 1 hour = 60 rounds, 1 day = 600 rounds
function parseDuration(durStr,lvl){
  if(!durStr)return 0;
  var s=durStr.toLowerCase().trim();
  if(!s||s==="special"||s==="varies"||s==="see text"||s==="see below"||s==="0")return 0;
  if(s==="permanent"||s==="instantaneous"||s==="until discharged"||
     s==="until triggered"||s==="until used"||s==="until expended"||
     s==="indefinite")return null;
  var m;
  // "X rounds/level"
  m=s.match(/^(\d+)\s*rounds?\/level/);if(m)return +m[1]*lvl;
  // "X turns/level"
  m=s.match(/^(\d+)\s*turns?\/level/);if(m)return +m[1]*lvl*10;
  // "X hours/level"
  m=s.match(/^(\d+)\s*hours?\/level/);if(m)return +m[1]*lvl*60;
  // "X days/level"
  m=s.match(/^(\d+)\s*days?\/level/);if(m)return +m[1]*lvl*600;
  // "X + Y rounds/level"
  m=s.match(/^(\d+)\s*\+\s*(\d+)\s*rounds?\/level/);if(m)return +m[1]+ +m[2]*lvl;
  // "X + Y turns/level"
  m=s.match(/^(\d+)\s*\+\s*(\d+)\s*turns?\/level/);if(m)return +m[1]*10+ +m[2]*10*lvl;
  // fixed rounds
  m=s.match(/^(\d+)\s*rounds?\b/);if(m)return +m[1];
  // fixed turns
  m=s.match(/^(\d+)\s*turns?\b/);if(m)return +m[1]*10;
  // fixed hours
  m=s.match(/^(\d+)\s*hours?\b/);if(m)return +m[1]*60;
  // plain integer → rounds
  m=s.match(/^(\d+)$/);if(m)return +m[1];
  // "X + Y round/level" compound via split
  if(s.indexOf("+")>=0){
    return s.split("+").reduce(function(acc,p){var v=parseDuration(p.trim(),lvl);return acc+(v||0);},0);
  }
  return 0;
}

// Format casting time for display (bare number = segments in AD&D 2E)
function formatCastingTime(ct){
  if(!ct)return "";
  if(/^\d+$/.test(ct.trim()))return ct.trim()+" seg.";
  return ct.trim();
}

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

// ======== STARTER KITS ========
function mkItem(name,qty,weight,cost,notes){
  return {id:name.replace(/\s/g,'_')+'_'+qty,name:name,qty:qty,weight:weight,cost:cost,notes:notes||""};
}
var STARTER_KITS={
  traveler:[
    mkItem("Backpack",1,2,"2gp"),
    mkItem("Bedroll",1,5,"1sp"),
    mkItem("Winter Blanket",1,3,"5sp"),
    mkItem("Waterskin",1,1,"1gp"),
    mkItem("Trail Rations (1 week)",1,10,"3gp"),
    mkItem("Rope, Hemp (50 ft)",1,20,"1gp"),
    mkItem("Hooded Lantern",1,2,"7gp"),
    mkItem("Oil, Flask",2,1,"2sp","Each"),
    mkItem("Flint and Steel",1,0,"1gp"),
    mkItem("Knife",1,0.5,"5sp"),
    mkItem("Belt Pouch, Small",1,0,"7sp"),
    mkItem("Torch",3,1,"1cp","Each"),
    mkItem("Cloak",1,1,"1sp"),
    mkItem("Boots, Soft",1,5,"1sp"),
    mkItem("Sack, Large",1,1,"2sp"),
  ],
  scholar:[
    mkItem("Backpack",1,2,"2gp"),
    mkItem("Parchment, Sheet",10,0,"3sp","Each"),
    mkItem("Quill",3,0,"1cp","Each"),
    mkItem("Writing Ink, Vial",2,0,"8gp","Each"),
    mkItem("Map/Scroll Case",2,0.5,"8sp","Each"),
    mkItem("Candle",5,0,"1cp","Each"),
    mkItem("Flint and Steel",1,0,"1gp"),
    mkItem("Hooded Lantern",1,2,"7gp"),
    mkItem("Oil, Flask",2,1,"2sp","Each"),
    mkItem("Knife",1,0.5,"5sp"),
    mkItem("Belt Pouch, Small",1,0,"7sp"),
    mkItem("Waterskin",1,1,"1gp"),
    mkItem("Trail Rations (3 days)",1,3,"1gp"),
    mkItem("Rope, Hemp (50 ft)",1,20,"1gp"),
    mkItem("Whetstone",1,1,"2cp"),
  ],
  dungeoneer:[
    mkItem("Backpack",1,2,"2gp"),
    mkItem("Torch",6,1,"1cp","Each"),
    mkItem("Hooded Lantern",1,2,"7gp"),
    mkItem("Oil, Flask",4,1,"2sp","Each"),
    mkItem("Flint and Steel",1,0,"1gp"),
    mkItem("Rope, Hemp (50 ft)",1,20,"1gp"),
    mkItem("Grappling Hook",1,4,"8gp"),
    mkItem("Hammer, Small",1,2,"5sp"),
    mkItem("Iron Spike",10,0.5,"1sp","Each"),
    mkItem("Mirror, Small Metal",1,0,"10gp"),
    mkItem("Crowbar",1,5,"2gp"),
    mkItem("Waterskin",1,1,"1gp"),
    mkItem("Trail Rations (1 week)",1,10,"3gp"),
    mkItem("Belt Pouch, Small",1,0,"7sp"),
    mkItem("Sack, Large",1,1,"2sp"),
  ],
};
var KIT_LABELS={traveler:"Traveler",scholar:"Scholar",dungeoneer:"Dungeoneer"};

// ======== PHB EQUIPMENT DATABASE ========
// {name, category, cost, weight (lb per unit)}
var PHB_EQUIPMENT=[
  // ── Weapons ──────────────────────────────────────────────────────────────
  {name:"Arquebus",category:"Weapons",cost:"500gp",weight:10},
  {name:"Bardiche",category:"Weapons",cost:"7gp",weight:7},
  {name:"Bastard Sword",category:"Weapons",cost:"25gp",weight:10},
  {name:"Broad Sword",category:"Weapons",cost:"10gp",weight:7},
  {name:"Club",category:"Weapons",cost:"5sp",weight:3},
  {name:"Composite Long Bow",category:"Weapons",cost:"100gp",weight:3},
  {name:"Composite Short Bow",category:"Weapons",cost:"75gp",weight:2},
  {name:"Crossbow, Heavy",category:"Weapons",cost:"50gp",weight:14},
  {name:"Crossbow, Light",category:"Weapons",cost:"35gp",weight:7},
  {name:"Dagger",category:"Weapons",cost:"2gp",weight:1},
  {name:"Dart",category:"Weapons",cost:"5sp",weight:0.5},
  {name:"Footman's Flail",category:"Weapons",cost:"15gp",weight:15},
  {name:"Footman's Mace",category:"Weapons",cost:"8gp",weight:10},
  {name:"Footman's Pick",category:"Weapons",cost:"8gp",weight:6},
  {name:"Glaive-Guisarme",category:"Weapons",cost:"10gp",weight:10},
  {name:"Guisarme",category:"Weapons",cost:"5gp",weight:8},
  {name:"Guisarme-Voulge",category:"Weapons",cost:"8gp",weight:15},
  {name:"Halberd",category:"Weapons",cost:"10gp",weight:15},
  {name:"Hand Axe",category:"Weapons",cost:"1gp",weight:5},
  {name:"Harpoon",category:"Weapons",cost:"20gp",weight:6},
  {name:"Horseman's Flail",category:"Weapons",cost:"8gp",weight:5},
  {name:"Horseman's Mace",category:"Weapons",cost:"5gp",weight:6},
  {name:"Horseman's Pick",category:"Weapons",cost:"5gp",weight:4},
  {name:"Javelin",category:"Weapons",cost:"5sp",weight:2},
  {name:"Khopesh",category:"Weapons",cost:"10gp",weight:7},
  {name:"Knife",category:"Weapons",cost:"5sp",weight:0.5},
  {name:"Lance, Heavy",category:"Weapons",cost:"15gp",weight:15},
  {name:"Lance, Light",category:"Weapons",cost:"6gp",weight:5},
  {name:"Lance, Medium",category:"Weapons",cost:"10gp",weight:10},
  {name:"Long Bow",category:"Weapons",cost:"75gp",weight:3},
  {name:"Long Sword",category:"Weapons",cost:"15gp",weight:4},
  {name:"Lucern Hammer",category:"Weapons",cost:"7gp",weight:15},
  {name:"Military Fork",category:"Weapons",cost:"5gp",weight:7},
  {name:"Morning Star",category:"Weapons",cost:"10gp",weight:12},
  {name:"Quarterstaff",category:"Weapons",cost:"5sp",weight:4},
  {name:"Ranseur",category:"Weapons",cost:"4gp",weight:7},
  {name:"Scimitar",category:"Weapons",cost:"15gp",weight:4},
  {name:"Scourge",category:"Weapons",cost:"1gp",weight:2},
  {name:"Short Bow",category:"Weapons",cost:"30gp",weight:2},
  {name:"Short Sword",category:"Weapons",cost:"10gp",weight:3},
  {name:"Sickle",category:"Weapons",cost:"6sp",weight:3},
  {name:"Sling",category:"Weapons",cost:"5cp",weight:0},
  {name:"Sling Bullet (10)",category:"Weapons",cost:"2sp",weight:5},
  {name:"Spear",category:"Weapons",cost:"5sp",weight:5},
  {name:"Spetum",category:"Weapons",cost:"5gp",weight:7},
  {name:"Throwing Axe",category:"Weapons",cost:"1gp",weight:5},
  {name:"Trident",category:"Weapons",cost:"15gp",weight:5},
  {name:"Two-Handed Sword",category:"Weapons",cost:"50gp",weight:15},
  {name:"Voulge",category:"Weapons",cost:"2gp",weight:12},
  {name:"Warhammer",category:"Weapons",cost:"2gp",weight:10},
  {name:"Whip",category:"Weapons",cost:"1gp",weight:2},
  {name:"Arrow, Flight (12)",category:"Weapons",cost:"75sp",weight:1},
  {name:"Arrow, Sheaf (12)",category:"Weapons",cost:"1gp",weight:1.5},
  {name:"Bolt, Hand Quarrel (10)",category:"Weapons",cost:"1gp",weight:1},
  // ── Armor ─────────────────────────────────────────────────────────────────
  {name:"Padded Armor",category:"Armor",cost:"4gp",weight:10},
  {name:"Leather Armor",category:"Armor",cost:"5gp",weight:15},
  {name:"Studded Leather",category:"Armor",cost:"20gp",weight:25},
  {name:"Hide Armor",category:"Armor",cost:"15gp",weight:30},
  {name:"Brigandine",category:"Armor",cost:"120gp",weight:35},
  {name:"Ring Mail",category:"Armor",cost:"100gp",weight:40},
  {name:"Scale Mail",category:"Armor",cost:"120gp",weight:40},
  {name:"Chain Mail",category:"Armor",cost:"75gp",weight:40},
  {name:"Splint Mail",category:"Armor",cost:"80gp",weight:40},
  {name:"Banded Mail",category:"Armor",cost:"200gp",weight:35},
  {name:"Plate Mail",category:"Armor",cost:"400gp",weight:50},
  {name:"Field Plate",category:"Armor",cost:"2000gp",weight:60},
  {name:"Full Plate",category:"Armor",cost:"4000gp",weight:70},
  {name:"Helm, Basinet",category:"Armor",cost:"8gp",weight:5},
  {name:"Helm, Great",category:"Armor",cost:"30gp",weight:10},
  {name:"Shield, Small",category:"Armor",cost:"3gp",weight:3},
  {name:"Shield, Medium",category:"Armor",cost:"7gp",weight:10},
  {name:"Shield, Body",category:"Armor",cost:"30gp",weight:15},
  // ── Adventuring Gear ──────────────────────────────────────────────────────
  {name:"Backpack",category:"Gear",cost:"2gp",weight:2},
  {name:"Barrel, Small",category:"Gear",cost:"2gp",weight:30},
  {name:"Bedroll",category:"Gear",cost:"1sp",weight:5},
  {name:"Belt Pouch, Large",category:"Gear",cost:"1gp",weight:0},
  {name:"Belt Pouch, Small",category:"Gear",cost:"7sp",weight:0},
  {name:"Block and Tackle",category:"Gear",cost:"5gp",weight:5},
  {name:"Candle",category:"Gear",cost:"1cp",weight:0},
  {name:"Chain (per ft)",category:"Gear",cost:"4gp",weight:3},
  {name:"Chest, Light",category:"Gear",cost:"2gp",weight:25},
  {name:"Chest, Medium",category:"Gear",cost:"5gp",weight:50},
  {name:"Crampons",category:"Gear",cost:"4gp",weight:2},
  {name:"Crowbar",category:"Gear",cost:"2gp",weight:5},
  {name:"Fishhook",category:"Gear",cost:"1sp",weight:0},
  {name:"Fishing Net (10 ft sq)",category:"Gear",cost:"4gp",weight:5},
  {name:"Flint and Steel",category:"Gear",cost:"1gp",weight:0},
  {name:"Glass Bottle",category:"Gear",cost:"10gp",weight:1},
  {name:"Grappling Hook",category:"Gear",cost:"8gp",weight:4},
  {name:"Hammer, Small",category:"Gear",cost:"5sp",weight:2},
  {name:"Holy Symbol, Wood",category:"Gear",cost:"1gp",weight:0},
  {name:"Holy Symbol, Silver",category:"Gear",cost:"25gp",weight:0},
  {name:"Holy Water (vial)",category:"Gear",cost:"25gp",weight:1},
  {name:"Hourglass",category:"Gear",cost:"25gp",weight:1},
  {name:"Iron Pot",category:"Gear",cost:"5sp",weight:10},
  {name:"Iron Spike",category:"Gear",cost:"1sp",weight:0.5},
  {name:"Ladder (10 ft)",category:"Gear",cost:"5gp",weight:20},
  {name:"Lantern, Bullseye",category:"Gear",cost:"12gp",weight:3},
  {name:"Lantern, Hooded",category:"Gear",cost:"7gp",weight:2},
  {name:"Lock, Good",category:"Gear",cost:"100gp",weight:1},
  {name:"Magnifying Glass",category:"Gear",cost:"100gp",weight:0},
  {name:"Map/Scroll Case",category:"Gear",cost:"8sp",weight:0.5},
  {name:"Merchant's Scale",category:"Gear",cost:"2gp",weight:1},
  {name:"Mirror, Small Metal",category:"Gear",cost:"10gp",weight:0},
  {name:"Oil, Flask",category:"Gear",cost:"2sp",weight:1},
  {name:"Oil, Greek Fire",category:"Gear",cost:"10gp",weight:2},
  {name:"Parchment (sheet)",category:"Gear",cost:"3sp",weight:0},
  {name:"Paper (sheet)",category:"Gear",cost:"2sp",weight:0},
  {name:"Piton",category:"Gear",cost:"3cp",weight:0.5},
  {name:"Quill",category:"Gear",cost:"1cp",weight:0},
  {name:"Quiver",category:"Gear",cost:"1gp",weight:1},
  {name:"Rations, Iron (1 week)",category:"Gear",cost:"5gp",weight:5},
  {name:"Rations, Standard (1 week)",category:"Gear",cost:"3gp",weight:10},
  {name:"Rope, Hemp (50 ft)",category:"Gear",cost:"1gp",weight:20},
  {name:"Rope, Silk (50 ft)",category:"Gear",cost:"10gp",weight:8},
  {name:"Sack, Large",category:"Gear",cost:"2sp",weight:1},
  {name:"Sack, Small",category:"Gear",cost:"5cp",weight:0},
  {name:"Sealing Wax",category:"Gear",cost:"1gp",weight:1},
  {name:"Signet Ring",category:"Gear",cost:"5gp",weight:0},
  {name:"Tent, Large (10 persons)",category:"Gear",cost:"25gp",weight:20},
  {name:"Tent, Small (1 person)",category:"Gear",cost:"5gp",weight:5},
  {name:"Torch",category:"Gear",cost:"1cp",weight:1},
  {name:"Waterskin",category:"Gear",cost:"1gp",weight:1},
  {name:"Whetstone",category:"Gear",cost:"2cp",weight:1},
  {name:"Winter Blanket",category:"Gear",cost:"5sp",weight:3},
  {name:"Writing Ink (vial)",category:"Gear",cost:"8gp",weight:0},
  // ── Clothing ──────────────────────────────────────────────────────────────
  {name:"Belt",category:"Clothing",cost:"3sp",weight:1},
  {name:"Boots, Hard",category:"Clothing",cost:"2gp",weight:5},
  {name:"Boots, Soft",category:"Clothing",cost:"1gp",weight:3},
  {name:"Cloak",category:"Clothing",cost:"1sp",weight:1},
  {name:"Gloves",category:"Clothing",cost:"1gp",weight:0.5},
  {name:"Hat",category:"Clothing",cost:"5sp",weight:0.5},
  {name:"Robe",category:"Clothing",cost:"9sp",weight:2},
  {name:"Shoes",category:"Clothing",cost:"1sp",weight:2},
  {name:"Surcoat",category:"Clothing",cost:"2sp",weight:1},
  {name:"Tabard",category:"Clothing",cost:"6sp",weight:1},
  {name:"Tunic",category:"Clothing",cost:"8sp",weight:1},
  // ── Food & Lodging ────────────────────────────────────────────────────────
  {name:"Ale, Gallon",category:"Food",cost:"2sp",weight:8},
  {name:"Bread, Loaf",category:"Food",cost:"2cp",weight:0.5},
  {name:"Meat, Meal",category:"Food",cost:"3sp",weight:0.5},
  {name:"Wine, Common (pitcher)",category:"Food",cost:"2cp",weight:3},
  {name:"Wine, Fine (bottle)",category:"Food",cost:"10gp",weight:2},
  // ── Tack & Transport ──────────────────────────────────────────────────────
  {name:"Bit and Bridle",category:"Tack",cost:"15sp",weight:3},
  {name:"Cart Harness",category:"Tack",cost:"2gp",weight:10},
  {name:"Horseshoes & Shoeing",category:"Tack",cost:"10gp",weight:4},
  {name:"Saddle, Riding",category:"Tack",cost:"10gp",weight:30},
  {name:"Saddle, Pack",category:"Tack",cost:"5gp",weight:15},
  {name:"Saddle Bags",category:"Tack",cost:"4gp",weight:8},
  {name:"Saddle Blanket",category:"Tack",cost:"3sp",weight:3},
];
// Auto-pick kit by class group
function defaultKitForClass(cls){
  var g=(CLASSES[cls]||{}).group;
  if(g==="Warrior")return "dungeoneer";
  if(g==="Wizard")return "scholar";
  if(g==="Priest")return "scholar";
  return "traveler";
}

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
  var _edition=useState('2e'),edition=_edition[0],setEdition=_edition[1];
  var _spells1e=useState([]),spells1e=_spells1e[0],setSpells1e=_spells1e[1];
  var _spells1eLoaded=useState(false),spells1eLoaded=_spells1eLoaded[0],setSpells1eLoaded=_spells1eLoaded[1];
  // Sync compSpells when spell data prop loads
  useEffect(function(){if(SPELL_DATA&&SPELL_DATA.length>0)setCompSpells(SPELL_DATA);},[SPELL_DATA]);
  // Fetch 1E spell list lazily the first time 1E mode is activated
  useEffect(function(){
    if(edition!=='1e'||spells1eLoaded)return;
    fetch('/1e-spells.xlsx')
      .then(function(r){return r.arrayBuffer();})
      .then(function(buf){
        var wb=XLSX.read(buf,{type:'array'});var all=[];
        wb.SheetNames.forEach(function(n){
          if(n.toLowerCase().indexOf('summary')>=0)return;
          var rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:''});
          rows.forEach(function(row){
            var c1e=row.Class?row.Class.toLowerCase():(n.toLowerCase().indexOf('illusionist')>=0?'illusionist':'mage');
            all.push(Object.assign({},row,{_type:'Wizard',_1eClass:c1e}));
          });
        });
        setSpells1e(all);setSpells1eLoaded(true);
      })
      .catch(function(){setSpells1eLoaded(true);});
  },[edition,spells1eLoaded]);
  var _memo=useState([]),memorized=_memo[0],setMemorized=_memo[1];
  var _notes=useState(""),notes=_notes[0],setNotes=_notes[1];
  // AI state
  var _aiQuery=useState(""),aiQuery=_aiQuery[0],setAiQuery=_aiQuery[1];
  var _aiResult=useState(""),aiResult=_aiResult[0],setAiResult=_aiResult[1];
  var _aiLoading=useState(false),aiLoading=_aiLoading[0],setAiLoading=_aiLoading[1];
  var _aiMode=useState("spells"),aiMode=_aiMode[0],setAiMode=_aiMode[1];
  var _aiHighlight=useState([]),aiHighlight=_aiHighlight[0],setAiHighlight=_aiHighlight[1];
  var _aiThinking=useState(""),aiThinking=_aiThinking[0],setAiThinking=_aiThinking[1];
  var _aiThinkingOpen=useState(false),aiThinkingOpen=_aiThinkingOpen[0],setAiThinkingOpen=_aiThinkingOpen[1];
  var _genPrompt=useState(""),genPrompt=_genPrompt[0],setGenPrompt=_genPrompt[1];
  var _genResult=useState(null),genResult=_genResult[0],setGenResult=_genResult[1];
  var _genLoading=useState(false),genLoading=_genLoading[0],setGenLoading=_genLoading[1];
  var _genKit=useState("traveler"),genKit=_genKit[0],setGenKit=_genKit[1];
  var _suggestLoading=useState(false),suggestLoading=_suggestLoading[0],setSuggestLoading=_suggestLoading[1];
  // Inventory
  var _inventory=useState([]),inventory=_inventory[0],setInventory=_inventory[1];
  var _invSearch=useState(""),invSearch=_invSearch[0],setInvSearch=_invSearch[1];
  var _invForm=useState(null),invForm=_invForm[0],setInvForm=_invForm[1];
  var _invBrowse=useState(false),invBrowse=_invBrowse[0],setInvBrowse=_invBrowse[1];
  var _invBrowseQ=useState(""),invBrowseQ=_invBrowseQ[0],setInvBrowseQ=_invBrowseQ[1];
  var _invBrowseCat=useState(""),invBrowseCat=_invBrowseCat[0],setInvBrowseCat=_invBrowseCat[1];
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
  var _itemsSub=useState("tome"),itemsSub=_itemsSub[0],setItemsSub=_itemsSub[1];
  // Gear (custom items) state
  var _gearItems=useState([]),gearItems=_gearItems[0],setGearItems=_gearItems[1];
  var _gearForm=useState(null),gearForm=_gearForm[0],setGearForm=_gearForm[1];
  var BLANK_GEAR={id:null,name:"",type:"Ring",source:"",desc:"",tiered:false,tiers:[],activeTier:0,effects:{str:0,dex:0,con:0,int:0,wis:0,cha:0,ac:0,acMode:"bonus",thac0:0,dmg:0,saves:0,savesTypes:[],hp:0,bonusDmgDice:0,bonusDmgDie:6,bonusDmgType:"",specialDmgMode:"bonus"}};
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
  var _dmPwCurrent=useState(""),dmPwCurrent=_dmPwCurrent[0],setDmPwCurrent=_dmPwCurrent[1];
  // CP state
  var _cpBudget=useState(120),cpBudget=_cpBudget[0],setCpBudget=_cpBudget[1];
  var _cpMajor=useState([]),cpMajor=_cpMajor[0],setCpMajor=_cpMajor[1];
  var _cpMinor=useState([]),cpMinor=_cpMinor[0],setCpMinor=_cpMinor[1];
  var _cpSchools=useState([]),cpSchools=_cpSchools[0],setCpSchools=_cpSchools[1];
  var _cpAbil=useState([]),cpAbil=_cpAbil[0],setCpAbil=_cpAbil[1];
  var _cpLim=useState([]),cpLim=_cpLim[0],setCpLim=_cpLim[1];
  var _wizardPresetNote=useState(""),wizardPresetNote=_wizardPresetNote[0],setWizardPresetNote=_wizardPresetNote[1];
  // Active CP sub-tab ('priest'|'monk'|'wizard'|null=auto)
  var _cpSubTab=useState(null),cpSubTab=_cpSubTab[0],setCpSubTab=_cpSubTab[1];
  // Spell-like granted powers: [{id, spell, level, spellType, freq}]
  var _cpSpellPowers=useState([]),cpSpellPowers=_cpSpellPowers[0],setCpSpellPowers=_cpSpellPowers[1];
  // Per-day ability uses: {[key]: usesUsedToday}
  var _cpDayUses=useState({}),cpDayUses=_cpDayUses[0],setCpDayUses=_cpDayUses[1];
  // Proficiency slot tracking
  var _wpUsed=useState(0),wpUsed=_wpUsed[0],setWpUsed=_wpUsed[1];
  var _nwpUsed=useState(0),nwpUsed=_nwpUsed[0],setNwpUsed=_nwpUsed[1];
  // Form state for adding a new granted power (not persisted)
  var _cpPwSpell=useState(""),cpPwSpell=_cpPwSpell[0],setCpPwSpell=_cpPwSpell[1];
  var _cpPwLevel=useState(1),cpPwLevel=_cpPwLevel[0],setCpPwLevel=_cpPwLevel[1];
  var _cpPwType=useState("priest"),cpPwType=_cpPwType[0],setCpPwType=_cpPwType[1];
  var _cpPwFreq=useState("week"),cpPwFreq=_cpPwFreq[0],setCpPwFreq=_cpPwFreq[1];
  var fr=useRef(null);
  var loadFileRef=useRef(null);
  // Spell effect overrides (global, DM-managed, persisted in Supabase)
  var _spellOverrides=useState({}),spellOverrides=_spellOverrides[0],setSpellOverrides=_spellOverrides[1];
  // Spell editor UI state
  var _spellEdSearch=useState(""),spellEdSearch=_spellEdSearch[0],setSpellEdSearch=_spellEdSearch[1];
  var _spellEdSel=useState(null),spellEdSel=_spellEdSel[0],setSpellEdSel=_spellEdSel[1];
  var _spellEdForm=useState(null),spellEdForm=_spellEdForm[0],setSpellEdForm=_spellEdForm[1];
  var _spellEdStatus=useState(""),spellEdStatus=_spellEdStatus[0],setSpellEdStatus=_spellEdStatus[1];
  var _spellEdSubTab=useState("gear"),spellEdSubTab=_spellEdSubTab[0],setSpellEdSubTab=_spellEdSubTab[1];
  // Character slots (multi-character tabs): [{id, name}]
  var _charSlots=useState([]),charSlots=_charSlots[0],setCharSlots=_charSlots[1];
  var _activeSlotId=useState(null),activeSlotId=_activeSlotId[0],setActiveSlotId=_activeSlotId[1];
  var slotSnapsRef=useRef({}); // {[slotId]: characterSnapshot} — updated without re-render
  var henchArchiveRef=useRef({}); // {[slotId]: {snapshot, name, pcId}} — closed henchman snapshots
  var didRestoreRef=useRef(false); // guard against StrictMode double-run of restore effect
  var _slotCtxMenu=useState(null),slotCtxMenu=_slotCtxMenu[0],setSlotCtxMenu=_slotCtxMenu[1]; // {slotId, x, y}

  // Cloud / auth state
  var _cloudId=useState(null),cloudId=_cloudId[0],setCloudId=_cloudId[1];
  var _cloudStatus=useState(""),cloudStatus=_cloudStatus[0],setCloudStatus=_cloudStatus[1];
  var _pdfParsing=useState(false),pdfParsing=_pdfParsing[0],setPdfParsing=_pdfParsing[1];
  // Auth
  var _authUser=useState(null),authUser=_authUser[0],setAuthUser=_authUser[1];
  var _authEmail=useState(""),authEmail=_authEmail[0],setAuthEmail=_authEmail[1];
  var _authPassword=useState(""),authPassword=_authPassword[0],setAuthPassword=_authPassword[1];
  var _authConfirmPw=useState(""),authConfirmPw=_authConfirmPw[0],setAuthConfirmPw=_authConfirmPw[1];
  var _authMode=useState("signin"),authMode=_authMode[0],setAuthMode=_authMode[1];
  var _authError=useState(""),authError=_authError[0],setAuthError=_authError[1];
  var _authLoading=useState(false),authLoading=_authLoading[0],setAuthLoading=_authLoading[1];
  var _authIsRecovery=useState(false),authIsRecovery=_authIsRecovery[0],setAuthIsRecovery=_authIsRecovery[1];
  // Account modal (character list)
  var _acctOpen=useState(false),acctOpen=_acctOpen[0],setAcctOpen=_acctOpen[1];
  var _acctChars=useState([]),acctChars=_acctChars[0],setAcctChars=_acctChars[1];
  var _acctLoading=useState(false),acctLoading=_acctLoading[0],setAcctLoading=_acctLoading[1];
  var _acctStatus=useState(""),acctStatus=_acctStatus[0],setAcctStatus=_acctStatus[1];
  var _acctSearch=useState(""),acctSearch=_acctSearch[0],setAcctSearch=_acctSearch[1];
  // Monk martial arts state
  var _monkStyleForm=useState("Hard"),monkStyleForm=_monkStyleForm[0],setMonkStyleForm=_monkStyleForm[1];
  var _monkStyleMethod=useState("Strike"),monkStyleMethod=_monkStyleMethod[0],setMonkStyleMethod=_monkStyleMethod[1];
  var _monkStyleName=useState(""),monkStyleName=_monkStyleName[0],setMonkStyleName=_monkStyleName[1];
  var _monkManeuvers=useState([]),monkManeuvers=_monkManeuvers[0],setMonkManeuvers=_monkManeuvers[1];
  // Portrait
  var _charPortrait=useState(null),charPortrait=_charPortrait[0],setCharPortrait=_charPortrait[1];
  var _portraitLoading=useState(false),portraitLoading=_portraitLoading[0],setPortraitLoading=_portraitLoading[1];
  var _portraitPrompt=useState(""),portraitPrompt=_portraitPrompt[0],setPortraitPrompt=_portraitPrompt[1];
  var _portraitPromptOpen=useState(false),portraitPromptOpen=_portraitPromptOpen[0],setPortraitPromptOpen=_portraitPromptOpen[1];
  var _portraitError=useState(""),portraitError=_portraitError[0],setPortraitError=_portraitError[1];
  var portraitAbortRef=useRef(null);

  // Auto-save to localStorage on every change; also keeps current slot snapshot in sync
  useEffect(function(){
    try{
      var snap={charName,race,cls,kit,level,xp,hp,align,stats,strPct,memorized,notes,
        cpBudget,cpMajor,cpMinor,cpSchools,cpAbil,cpLim,cpSpellPowers,dmOverride,totemAnimal,shapeUsesLeft,shapeFailed,gearItems,cpDayUses,wpUsed,nwpUsed,
        inventory,cloudId,edition,
        monkStyleForm,monkStyleMethod,monkStyleName,monkManeuvers,
        charPortrait};
      localStorage.setItem("cf_autosave",JSON.stringify(snap));
      if(activeSlotId){
        slotSnapsRef.current[activeSlotId]=snap;
        var slotsToSave=charSlots.map(function(s){
          return {id:s.id,name:s.id===activeSlotId?(charName||"Unnamed"):s.name,type:s.type||null,pcId:s.pcId||null,dead:s.dead||false,snapshot:slotSnapsRef.current[s.id]||null};
        });
        localStorage.setItem("cf_char_slots",JSON.stringify({activeSlotId:activeSlotId,slots:slotsToSave}));
        localStorage.setItem("cf_hench_archive",JSON.stringify(henchArchiveRef.current));
      }
    }catch(_){}
  },[charName,race,cls,kit,level,xp,hp,align,stats,strPct,memorized,notes,
     cpBudget,cpMajor,cpMinor,cpSchools,cpAbil,cpLim,cpSpellPowers,dmOverride,totemAnimal,shapeUsesLeft,shapeFailed,gearItems,cpDayUses,wpUsed,nwpUsed,
     inventory,cloudId,edition,
     monkStyleForm,monkStyleMethod,monkStyleName,monkManeuvers,
     charPortrait,
     charSlots,activeSlotId]);

  // Restore character slots on first load (falls back to single slot from cf_autosave)
  useEffect(function(){
    if(didRestoreRef.current)return;
    didRestoreRef.current=true;
    try{
      var slotsRaw=localStorage.getItem("cf_char_slots");
      if(slotsRaw){
        var parsed=JSON.parse(slotsRaw);
        var slots=parsed.slots||[];
        var activeId=parsed.activeSlotId;
        if(slots.length&&activeId){
          slots.forEach(function(s){if(s.snapshot)slotSnapsRef.current[s.id]=s.snapshot;});
          var archRaw=localStorage.getItem("cf_hench_archive");
          if(archRaw)try{henchArchiveRef.current=JSON.parse(archRaw);}catch(_){}
          setCharSlots(slots.map(function(s){return {id:s.id,name:s.name,type:s.type||null,pcId:s.pcId||null,dead:s.dead||false};}));
          setActiveSlotId(activeId);
          var active=slots.find(function(s){return s.id===activeId;});
          if(active&&active.snapshot)applyCharacterData(active.snapshot);
          return;
        }
      }
      // Legacy: single slot from cf_autosave
      var raw=localStorage.getItem("cf_autosave");
      var snap=raw?JSON.parse(raw):null;
      var id="slot_"+Date.now();
      var name=snap?(snap.charName||"Unnamed"):"Unnamed";
      if(snap)slotSnapsRef.current[id]=snap;
      setCharSlots([{id:id,name:name}]);
      setActiveSlotId(id);
      if(snap)applyCharacterData(snap);
    }catch(_){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Load spell effect overrides on startup
  useEffect(function(){
    if(supabase) getSpellOverrides().then(setSpellOverrides);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Listen for Supabase auth state changes
  useEffect(function(){
    if(!supabase)return;
    supabase.auth.getUser().then(function(r){setAuthUser(r.data.user||null);});
    var {data:{subscription}}=supabase.auth.onAuthStateChange(function(event,session){
      var user=session?session.user:null;
      if(event==="PASSWORD_RECOVERY"){
        // Supabase fired a password-reset link click — open the set-new-password form
        setAuthIsRecovery(true);
        setAuthPassword("");setAuthConfirmPw("");setAuthError("");
        setAuthMode("newpassword");
        setAcctOpen(true);
      }else{
        setAuthUser(user||null);
      }
      // Always revoke DM access when the signed-in user changes or signs out
      setDmPwVerified(false);setDmChangePw(false);
      setDmPwInput("");setDmPwConfirm("");setDmPwCurrent("");setDmPwError("");
      setDmPwHashExists(null);setGearLibItems([]);
    });
    return function(){subscription.unsubscribe();};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Derived
  var raceData=RACES[race]||RACES.Human;
  var classData=CLASSES[cls]||CLASSES.Druid;
  var isPriest=classData.group==="Priest";
  var isWizard=classData.group==="Wizard";
  var isMonk=classData.group==="Monk";
  var monkCaps=isMonk?MONK_CAPS[Math.min(level,17)]:null;
  // CP ability mechanical effects (computed before base stat derivation)
  var cpThac0Type=classData.thac0;
  if(cpAbil.indexOf('Combat bonus (warrior THAC0)')>=0) cpThac0Type='war';
  else if(cpAbil.indexOf('Combat bonus (rogue THAC0)')>=0&&cpThac0Type==='wiz') cpThac0Type='rog';
  else if(cpAbil.indexOf('Combat bonus (priest THAC0)')>=0&&cpThac0Type==='wiz') cpThac0Type='pri';
  var cpWarriorCon=cpAbil.indexOf('Warrior Con bonus')>=0||cpAbil.indexOf('Warrior Con + Str')>=0||cpAbil.indexOf('Constitution adjustment (warrior)')>=0;
  var cpWarriorStr=cpAbil.indexOf('Warrior Con + Str')>=0;
  var adjStats={};
  ["Str","Dex","Con","Int","Wis","Cha"].forEach(function(a){adjStats[a]=stats[a]+(raceData.adj[a]||0);});
  var thac0=getThac0(cpThac0Type,level);
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
  var conB=conHP(adjStats.Con,cpWarriorCon?'Warrior':classData.group);
  var wisAdj=wisDefense(adjStats.Wis);
  var wisImm=wisImmunity(adjStats.Wis);
  var wisSpellFail=wisFailure(adjStats.Wis);
  var dexMis=dexMissile(adjStats.Dex);
  var slots=classData.spells==="priest"?(PRIEST_SLOTS[Math.min(level,14)]||[]):classData.spells==="wizard"?(WIZARD_SLOTS[Math.min(level,14)]||[]):[];
  var wBonus=classData.spells==="priest"?wisBonus(adjStats.Wis):[];
  var cpBonusSpellSlot=isWizard&&(cpAbil.indexOf('Bonus spells (any school)')>=0||cpAbil.indexOf('Bonus spells (one school)')>=0)?1:0;
  var adjSlots=slots.map(function(s,i){return s+(wBonus[i]||0)+cpBonusSpellSlot;});
  // CP-derived effective hit die (upgrades and limitations)
  var effectiveHD=classData.hd;
  if(cpAbil.indexOf('Hit point bonus (d10)')>=0) effectiveHD=10;
  if(cpAbil.indexOf('Improved Hit Die (d8)')>=0&&effectiveHD<8) effectiveHD=8;
  if(cpAbil.indexOf('Improved Hit Die (d6)')>=0&&effectiveHD<6) effectiveHD=6;
  if(cpLim.indexOf('Reduced HP (d6)')>=0) effectiveHD=Math.min(effectiveHD,6);
  if(cpLim.indexOf('Reduced HP (d4)')>=0) effectiveHD=Math.min(effectiveHD,4);
  if(cpLim.indexOf('Reduced HP (d3)')>=0) effectiveHD=Math.min(effectiveHD,3);
  // AC improvement: +1 per 4 levels
  var cpAcBonus=cpAbil.indexOf('AC improvement')>=0?Math.floor(level/4):0;
  // ── Wizard CP mechanical effects ─────────────────────────────────────────
  var cpArmorGrant=isWizard?(cpAbil.indexOf('Armor: Any')>=0?3:cpAbil.indexOf('Armor: Leather/studded')>=0?2:cpAbil.indexOf('Armor: Padded')>=0?1:0):0;
  var cpWeaponGrant=isWizard?(cpAbil.indexOf('Weapon: Any')>=0?2:cpAbil.indexOf('Weapon: Cleric/thief list')>=0?1:0):0;
  var cpSaveMod=isWizard?(cpAbil.indexOf('School knowledge +2/-2 saves')>=0?2:cpAbil.indexOf('School knowledge +1/-1 saves')>=0?1:0):0;
  var cpDispelCharges=isWizard?(cpAbil.indexOf('Dispel (3/day)')>=0?3:cpAbil.indexOf('Dispel (1/day)')>=0?1:0):0;
  var cpPriestlyWizard=isWizard?(cpAbil.indexOf('Priestly wizard (major sphere)')>=0?'major':cpAbil.indexOf('Priestly wizard (minor sphere)')>=0?'minor':''):'';
  var cpEnhancedLevel=isWizard&&cpAbil.indexOf('Enhanced casting level')>=0;
  // Per-day ability list (used for tracker UI)
  var cpDayAbilList=(function(){
    var list=[];
    if(cpAbil.indexOf('Dispel (1/day)')>=0) list.push({key:'Dispel',label:'Dispel Magic',max:1});
    if(cpAbil.indexOf('Dispel (3/day)')>=0) list.push({key:'Dispel',label:'Dispel Magic',max:3});
    if(cpAbil.indexOf('Detect magic')>=0&&isWizard) list.push({key:'DetectMagic',label:'Detect Magic',max:Math.floor(level/2)||1});
    if(cpAbil.indexOf('Read magic')>=0&&isWizard) list.push({key:'ReadMagic',label:'Read Magic',max:Math.floor(level/2)||1});
    if(cpEnhancedLevel) list.push({key:'EnhancedLevel',label:'Enhanced Casting',max:1});
    if(cpAbil.indexOf('Detect evil')>=0) list.push({key:'DetectEvil',label:'Detect Evil',max:1});
    if(cpAbil.indexOf('Detect undead')>=0) list.push({key:'DetectUndead',label:'Detect Undead',max:1});
    if(cpAbil.indexOf('Know alignment')>=0) list.push({key:'KnowAlign',label:'Know Alignment',max:level});
    return list;
  })();
  // Proficiency slot totals
  var profRates=PROF_RATES[classData.group]||PROF_RATES["Wizard"];
  var totalWP=profRates.wpInit+Math.floor((level-1)/profRates.wpRate);
  var totalNWP=profRates.nwpInit+Math.floor((level-1)/profRates.nwpRate);
  if(cpAbil.indexOf('Weapon specialization')>=0&&isWizard) totalWP+=1;
  if(cpAbil.indexOf('Proficiency group crossovers')>=0&&isWizard) totalNWP+=0;

  // Equipped custom gear bonuses
  function getActiveEffects(g){
    if(g.tiered&&g.tiers&&g.tiers.length>0){var t=g.tiers[g.activeTier||0];return(t&&t.effects)||{};}
    return g.effects||{};
  }
  var equipped=gearItems.filter(function(g){return g.equipped;});
  var gearStr=equipped.reduce(function(s,g){return s+(getActiveEffects(g).str||0);},0);
  var gearDex=equipped.reduce(function(s,g){return s+(getActiveEffects(g).dex||0);},0);
  var gearCon=equipped.reduce(function(s,g){return s+(getActiveEffects(g).con||0);},0);
  var gearInt=equipped.reduce(function(s,g){return s+(getActiveEffects(g).int||0);},0);
  var gearWis=equipped.reduce(function(s,g){return s+(getActiveEffects(g).wis||0);},0);
  var gearCha=equipped.reduce(function(s,g){return s+(getActiveEffects(g).cha||0);},0);
  var gearAC=equipped.reduce(function(s,g){var ae=getActiveEffects(g);if((ae.acMode||'bonus')==='base')return s;return s+(ae.ac||0);},0);
  var gearThac0=equipped.reduce(function(s,g){return s+(getActiveEffects(g).thac0||0);},0);
  var gearDmg=equipped.reduce(function(s,g){return s+(getActiveEffects(g).dmg||0);},0);
  var SAVE_KEYS=['Para','Rod','Pet','Breath','Spell'];
  var gearSavesBySave={Para:0,Rod:0,Pet:0,Breath:0,Spell:0};
  equipped.forEach(function(g){var ae=getActiveEffects(g);var bonus=ae.saves||0;if(!bonus)return;var types=ae.savesTypes||[];var targets=types.length?types:SAVE_KEYS;targets.forEach(function(k){gearSavesBySave[k]+=bonus;});});
  var gearSaves=SAVE_KEYS.reduce(function(a,k){return Math.max(a,gearSavesBySave[k]);},0);
  var gearHP=equipped.reduce(function(s,g){return s+(getActiveEffects(g).hp||0);},0);
  var gearBaseAC=null;equipped.forEach(function(g){var ae=getActiveEffects(g);if((ae.acMode||'bonus')==='base'&&ae.ac>0){if(gearBaseAC===null||ae.ac<gearBaseAC)gearBaseAC=ae.ac;}});
  // Apply gear stat bonuses on top of racial adjustments
  adjStats.Str+=gearStr; adjStats.Dex+=gearDex; adjStats.Con+=gearCon;
  adjStats.Int+=gearInt; adjStats.Wis+=gearWis; adjStats.Cha+=gearCha;
  // exStr and strB computed after gear so gear STR bonuses are included
  var exStr=(isWarrior||cpWarriorStr)&&adjStats.Str===18&&strPct>0;
  var strB=exStr?strExBonus(strPct):strBonus(adjStats.Str);

  // Merge DM overrides onto BUFF_SPELLS (overrides win field-by-field)
  var effectiveBuff={};
  Object.keys(BUFF_SPELLS).forEach(function(k){
    effectiveBuff[k]=spellOverrides[k]?Object.assign({},BUFF_SPELLS[k],spellOverrides[k]):BUFF_SPELLS[k];
  });
  Object.keys(spellOverrides).forEach(function(k){ if(!effectiveBuff[k]) effectiveBuff[k]=spellOverrides[k]; });

  // Active spell buffs
  var buffStr=0,buffStrLvl=0,buffAC=0,buffACBase=null,buffSave=0,buffThac0=0,buffDmg=0,activeBuffs=[];
  activeCasts.forEach(function(m){
    var sp=effectiveBuff[m["Spell Name"]];
    if(sp){
      activeBuffs.push(m["Spell Name"]);
      if(sp.strBonus)    buffStr+=sp.strBonus;
      if(sp.strLvlBonus) buffStrLvl+=level;
      if(sp.acBonus)     buffAC+=sp.acBonus;
      // acBase sets a floor on unarmored AC (like Bracers of Defense — takes best)
      if(sp.acBase!=null){ if(buffACBase===null||sp.acBase<buffACBase) buffACBase=sp.acBase; }
      if(sp.saveBonus)   buffSave+=sp.saveBonus;
      if(sp.thac0Bonus)  buffThac0+=sp.thac0Bonus;
      if(sp.dmgBonus)    buffDmg+=sp.dmgBonus;
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
  // Base AC: best (lowest) among armor, spell-set base (acBase), and natural 10
  var baseAC=gearBaseAC!==null?(buffACBase!==null?Math.min(gearBaseAC,buffACBase):gearBaseAC):(buffACBase!==null?buffACBase:10);
  // Monks: natural AC from level table (no DEX modifier, no armor); Ironskin maneuver gives +2
  var monkIronskin=isMonk&&monkManeuvers.indexOf("Ironskin")>=0;
  var monkStyleAC=(isMonk&&monkStyleForm&&monkStyleMethod&&STYLE_FORM_DATA[monkStyleForm]&&STYLE_METHOD_DATA[monkStyleMethod])?(10-(STYLE_FORM_DATA[monkStyleForm].acMod+STYLE_METHOD_DATA[monkStyleMethod].acMod)):null;
  var effAC=isMonk?(function(){
    var nat=monkCaps?monkCaps.ac:10;
    var best=monkStyleAC!==null?Math.min(nat,monkStyleAC):nat;
    return best-(monkIronskin?2:0)-buffAC-cpAcBonus;
  })():baseAC+dexAC(adjStats.Dex)-buffAC-gearAC-cpAcBonus;
  // Monks: no STR bonus to hit; THAC0 improves with level (rogue table already set)
  var effThac0=isMonk?(thac0-gearThac0-buffThac0):(thac0-effStrB.hit-gearThac0-buffThac0);
  var effSaves={};
  Object.keys(saves).forEach(function(k){effSaves[k]=saves[k]-(gearSavesBySave[k]||0)-buffSave;});
  if(cpSaveMod>0) effSaves=Object.assign({},effSaves,{Spell:Math.max(1,effSaves.Spell-cpSaveMod)});
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
  cpSpellPowers.forEach(function(p){cpSpent+=spellPowerCost(p.level,p.spellType,p.freq);});
  var cpRefund=0;
  cpLim.forEach(function(l){cpRefund+=(activeLimits[l]||{r:0}).r;});
  var cpRemaining=cpBudget-cpSpent+cpRefund;
  // Max granted powers allowed: 1 per 2 levels (1 at 1st, 1 at 3rd, 1 at 5th, ...)
  var maxGrantedPowers=Math.ceil(level/2);

  // Class change handler - reset CP and set appropriate budget
  function changeClass(newCls) {
    setCls(newCls);
    var cd=CLASSES[newCls]||{};
    setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);setCpSpellPowers([]);setCpSubTab(null);
    if(cd.group==="Priest")setCpBudget(120);
    else if(cd.group==="Wizard")setCpBudget(40);
    else setCpBudget(0);
    // Reset to 2E when switching away from a class that supports 1E mode
    if(newCls!=="Mage"&&newCls!=="Illusionist")setEdition('2e');
    if(newCls!=="Druid"){setKit("");setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);setDmOverride(false);}
  }

  function loadPreset(name){
    var p=PRIEST_PRESETS[name];if(!p)return;
    setCpMajor(p.major.slice());setCpMinor(p.minor.slice());
    setCpAbil(p.abilities.slice());setCpLim(p.limitations.slice());
  }
  function loadWizardPreset(name){
    var p=WIZARD_PRESETS[name];if(!p)return;
    setCpSchools(p.schools.slice());setCpAbil(p.abilities.slice());setCpLim(p.limitations.slice());
    setWizardPresetNote(p.note||"");
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
    var legacyFn=SPELL_DURATIONS[s["Spell Name"]];
    var autoRounds=legacyFn?legacyFn(level):(parseDuration(s["Duration"]||"",level)||0);
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
  function newDay(){
    setCpDayUses({});
    setCombatRound(1);
    setActiveCasts([]);
  }

  // Spell filtering based on CP selections
  var activeSpellDb=(edition==='1e'&&isWizard)?spells1e:compSpells;
  var availableSpells=activeSpellDb.filter(function(s){
    // 1E mode: Class column uses "MU", "MU/I", "Illusionist"
    // Mage sees MU + MU/I; Illusionist sees Illusionist + MU/I
    if(edition==='1e'&&isWizard){
      var c1e=s._1eClass||'';
      if(cls==='Mage'&&c1e!=='mu'&&c1e!=='mu/i')return false;
      if(cls==='Illusionist'&&c1e!=='illusionist'&&c1e!=='mu/i')return false;
      if(spellLvlFilter&&s.Level!=parseInt(spellLvlFilter))return false;
      if(spellFilter){var q=spellFilter.toLowerCase();return(s["Spell Name"]||"").toLowerCase().indexOf(q)>=0;}
      return true;
    }
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

  // Reset character to blank state
  function resetToBlank(){
    setCharName("");setRace("Human");setCls("Druid");setKit("");setLevel(1);setXP(0);setHP(8);setAlign("True Neutral");
    setStats({Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});setStrPct(0);setMemorized([]);setActiveCasts([]);setCombatRound(1);setCastingSpell(null);setNotes("");
    setCpBudget(120);setCpMajor([]);setCpMinor([]);setCpSchools([]);setCpAbil([]);setCpLim([]);setCpSpellPowers([]);
    setDmOverride(false);setTotemAnimal("");setShapeUsesLeft(0);setShapeFailed(0);
    setCpDayUses({});setWpUsed(0);setNwpUsed(0);setGearItems([]);setInventory([]);setCloudId(null);setEdition('2e');setCharPortrait(null);
  }

  // ── Character slot (tab) operations ─────────────────────────────────────────
  function newCharSlot(){
    if(activeSlotId) slotSnapsRef.current[activeSlotId]=getCharacterSnapshot();
    var id="slot_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
    var curName=charName||"Unnamed";
    setCharSlots(function(prev){
      return prev.map(function(s){return s.id===activeSlotId?Object.assign({},s,{name:curName}):s;}).concat([{id:id,name:"Unnamed"}]);
    });
    setActiveSlotId(id);
    resetToBlank();
  }

  function switchCharSlot(id){
    if(id===activeSlotId)return;
    if(activeSlotId) slotSnapsRef.current[activeSlotId]=getCharacterSnapshot();
    var curName=charName||"Unnamed";
    setCharSlots(function(prev){
      return prev.map(function(s){return s.id===activeSlotId?Object.assign({},s,{name:curName}):s;});
    });
    setActiveSlotId(id);
    // Clear AI spell search results so prepare buttons don't bleed across characters
    setAiHighlight([]);setAiResult("");setAiThinking("");setAiThinkingOpen(false);
    var snap=slotSnapsRef.current[id];
    if(snap) applyCharacterData(snap);
  }

  function closeCharSlot(id){
    if(charSlots.length<=1)return;
    // Archive henchman snapshot so it can be reopened with its PC
    var closingSlot=charSlots.find(function(s){return s.id===id;});
    if(closingSlot&&closingSlot.type==='henchman'){
      var archSnap=id===activeSlotId?getCharacterSnapshot():slotSnapsRef.current[id];
      if(archSnap){
        var archiveName=id===activeSlotId?(charName||closingSlot.name):closingSlot.name;
        henchArchiveRef.current[id]={snapshot:archSnap,name:archiveName,pcId:closingSlot.pcId||null};
        try{localStorage.setItem("cf_hench_archive",JSON.stringify(henchArchiveRef.current));}catch(_){}
      }
    }
    if(id===activeSlotId){
      var idx=charSlots.findIndex(function(s){return s.id===id;});
      var neighborId=charSlots[idx===0?1:idx-1].id;
      setActiveSlotId(neighborId);
      var snap=slotSnapsRef.current[neighborId];
      if(snap) applyCharacterData(snap);
    }
    setCharSlots(function(prev){return prev.filter(function(s){return s.id!==id;});});
    delete slotSnapsRef.current[id];
  }

  function openHenchmen(pcId){
    var curIds=new Set(charSlots.map(function(s){return s.id;}));
    var toOpen=[];
    Object.keys(henchArchiveRef.current).forEach(function(hid){
      var h=henchArchiveRef.current[hid];
      if(h.pcId===pcId&&!curIds.has(hid)){
        slotSnapsRef.current[hid]=h.snapshot;
        toOpen.push({id:hid,name:h.name,type:'henchman',pcId:pcId,dead:false});
        delete henchArchiveRef.current[hid];
      }
    });
    if(toOpen.length===0)return;
    try{localStorage.setItem("cf_hench_archive",JSON.stringify(henchArchiveRef.current));}catch(_){}
    setCharSlots(function(prev){
      var prevIds=new Set(prev.map(function(s){return s.id;}));
      return prev.concat(toOpen.filter(function(h){return !prevIds.has(h.id);}));
    });
  }

  function setSlotType(id,type,pcId){
    // When linking a henchman, capture the PC's cloudId as a stable cross-session reference
    var pcCloudId=null;
    if(type==='henchman'&&pcId){
      var pcSnap=pcId===activeSlotId?getCharacterSnapshot():slotSnapsRef.current[pcId];
      if(pcSnap)pcCloudId=pcSnap.cloudId||null;
    }
    setCharSlots(function(prev){
      return prev.map(function(s){return s.id===id?Object.assign({},s,{type:type||null,pcId:pcId||null,slotPcRef:pcCloudId}):s;});
    });
  }

  function setSlotDead(id,dead){
    setCharSlots(function(prev){
      return prev.map(function(s){return s.id===id?Object.assign({},s,{dead:dead||false}):s;});
    });
  }

  // Keep resetCharacter as alias (called in a few other places)
  function resetCharacter(){ newCharSlot(); }

  function exportPDF() {
    var equippedForPDF=equipped.map(function(g){
      var ae=getActiveEffects(g);
      return {name:g.name,type:g.type,source:g.source||'',desc:g.desc||'',
        tierLabel:g.tiered&&g.tiers&&g.tiers.length?(g.tiers[g.activeTier||0]||{}).label||'':'',
        effects:ae};
    });
    // Pre-compute CP ability/limitation descriptions (same logic as Sheet tab)
    var cpAbilDescs=cpAbil.map(function(a){
      var desc=CP_ABILITY_DESC[a]||a;
      if(a==='AC improvement') desc='AC Improvement: +'+(cpAcBonus||0)+' AC (level '+level+'; +1/4 levels)';
      if(a==='Lay on hands') desc='Lay on Hands: heal '+(level*2)+' HP/day';
      if(a==='Hit point bonus (d10)') desc='Hit Point Bonus: d10 HD (base d'+classData.hd+')';
      if(a==='Warrior Con bonus') desc='Warrior Con Bonus: CON adj '+(conB>=0?'+':'')+conB+'/die';
      if(a==='Warrior Con + Str') desc='Warrior CON + STR: CON adj '+(conB>=0?'+':'')+conB+'/die; exceptional STR';
      if(a==='Combat bonus (warrior THAC0)') desc='Combat Bonus: THAC0 as Warrior ('+thac0+')';
      if(a==='Combat bonus (rogue THAC0)')  desc='Combat Bonus: THAC0 as Rogue ('+thac0+')';
      if(a==='Combat bonus (priest THAC0)') desc='Combat Bonus: THAC0 as Priest ('+thac0+')';
      if(a==='Constitution adjustment (warrior)') desc='Warrior CON Bonus: CON adj '+(conB>=0?'+':'')+conB+'/die';
      if(a==='Weapon specialization') desc='Weapon Specialization: +1 attack, +2 damage in chosen weapon';
      if(isWizard){
        if(a==='Improved Hit Die (d8)')      desc='Improved Hit Die: d8 HD (base d'+classData.hd+')';
        if(a==='Improved Hit Die (d6)')      desc='Improved Hit Die: d6 HD (base d'+classData.hd+')';
        if(a==='Enhanced casting level')     desc='Enhanced Casting Level: 1d4 levels higher (once/day; level '+level+')';
        if(a==='Dispel (1/day)')             desc='Dispel Magic: 1×/day, 30 yd range, as '+level+'th-level caster';
        if(a==='Dispel (3/day)')             desc='Dispel Magic: 3×/day, 30 yd range, as '+level+'th-level caster';
        if(a==='Detect magic')               desc='Detect Magic: '+(Math.floor(level/2)||1)+'×/day as the spell';
        if(a==='Read magic')                 desc='Read Magic: '+(Math.floor(level/2)||1)+'×/day, any magical script';
        if(a==='School knowledge +1/-1 saves') desc='School Knowledge: +1 saves vs school; −1 opp saves vs your spells (Spell: '+effSaves.Spell+')';
        if(a==='School knowledge +2/-2 saves') desc='School Knowledge: +2 saves vs school; −2 opp saves vs your spells (Spell: '+effSaves.Spell+')';
        if(a==='Bonus spells (one school)')  desc='Bonus Spells: +1 slot per level from one school';
        if(a==='Bonus spells (any school)')  desc='Bonus Spells: +1 slot per level, any spell';
        if(a==='Priestly wizard (minor sphere)') desc='Priestly Wizard: minor sphere (cast as level '+Math.floor(level/2)+')';
        if(a==='Priestly wizard (major sphere)') desc='Priestly Wizard: major sphere (full level '+level+')';
        if(a==='Followers') desc='Followers: 20-200 men-at-arms + 1d6 apprentices at 8th level';
        if(a==='Armor: Padded')              desc='Armor Access: padded armor while casting (no shields)';
        if(a==='Armor: Leather/studded')     desc='Armor Access: leather/studded leather while casting (no shields)';
        if(a==='Armor: Any')                 desc='Armor Access: any armor while casting (no shields)';
        if(a==='Weapon: Cleric/thief list')  desc='Weapon Access: cleric and thief weapon lists';
        if(a==='Weapon: Any')                desc='Weapon Access: any weapon (non-prof penalties apply)';
        if(a==='Immunity (one spell)')       desc='Immunity: complete immunity to one chosen spell';
      }
      return {name:a,desc:desc};
    });
    var cpLimDescs=cpLim.map(function(l){
      var desc=l;
      if(l==='Reduced HP (d6)') desc='Reduced HP: d6 Hit Die (base d'+classData.hd+')';
      if(l==='Reduced HP (d4)') desc='Reduced HP: d4 Hit Die (base d'+classData.hd+')';
      if(isWizard){
        if(l==='Reduced HP (d3)')   desc='Reduced HP: d3 Hit Die (currently d'+effectiveHD+')';
        if(l==='Learning penalty -15%') desc='Learning Penalty: −15% to learn spells (all schools except one)';
        if(l==='Learning penalty -25%') desc='Learning Penalty: −25% to learn spells (all schools except one)';
        if(l==='Reduced spell knowledge') desc='Reduced Spell Knowledge: max spells/level = half normal';
        if(l==='Reduced spell progression') desc='Reduced Spell Progression: one fewer spell memorized per level';
        if(l==='Slower casting time +3')     desc='Slower Casting: +3 segments to all casting times';
        if(l==='Talisman required')          desc='Talisman Required: must have talisman on person to cast';
        if(l==='Hazardous spells')           desc='Hazardous Spells: save or 1 dmg/spell level; insanity risk';
        if(l==='Awkward casting')            desc='Awkward Casting: must cast obviously (no ambush/stealth)';
        if(l==='Difficult memorization')     desc='Difficult Memorization: special location + 250 gp/level';
        if(l==='Behavior/taboo')             desc='Behavior/Taboo: must observe code or lose all memorized spells';
        if(l==='Supernatural constraint')    desc='Supernatural Constraint: DM-assigned vulnerability';
        if(l==='Weapons: No proficiency')    desc='Weapons: may never have weapon proficiency';
        if(l==='Weapons: Cannot wield')      desc='Weapons: may never wield — violation ends spellcasting for 1 month';
        if(l==='Environmental condition (specific)') desc='Environmental Condition: can only cast in specific circumstances';
        if(l==='Environmental condition (common)')   desc='Environmental Condition: can only cast in common situations';
        if(l==='Environmental condition (everyday)') desc='Environmental Condition: major everyday casting restriction';
      }
      return {name:l,desc:desc};
    });
    exportCharacterSheet({
      charName, race, cls, kit, level, xp, hp, align,
      stats, adjStats, thac0, saves,
      effAC, effThac0, effSaves, effHP, effStrB, effStrPct,
      gearBaseAC, gearAC, gearThac0, gearHP,
      strB, conB, strPct, exStr, effectiveHD,
      totalWP, totalNWP, wpUsed, nwpUsed,
      adjSlots, memorized, notes,
      cpBudget, cpSpent, cpRefund,
      cpMajor, cpMinor, cpSchools, cpAbil, cpLim,
      cpAbilDescs, cpLimDescs,
      isPriest, isWizard, classData, raceData,
      equippedGear: equippedForPDF,
      inventory, activeBuffs,
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
  var HIDDEN_FIELDS=new Set(["Spell Name","Level","Category","Sphere","School","Damage Dice","_type",
    "Duration","Range","Casting Time","Area of Effect","Components","Saving Throw",
    "Description","Damage Type","Source"]);
  // Render a wiki-style spell info card (Duration, Range, etc. then description)
  function SpellCard({s,dim,txt,g}){
    var CARD_FIELDS=[
      ["Duration",      s["Duration"]],
      ["Range",         s["Range"]],
      ["Casting Time",  s["Casting Time"]?formatCastingTime(s["Casting Time"]):null],
      ["Area of Effect",s["Area of Effect"]],
      ["Components",    s["Components"]],
      ["Saving Throw",  s["Saving Throw"]],
    ].filter(function(f){return f[1]&&f[1]!==""&&f[1]!=="Unknown";});
    var extras=spellExtraFields(s);
    return <div style={{fontSize:"11px",color:"#b8b4a8",lineHeight:"1.7"}}>
      {CARD_FIELDS.length>0&&<div style={{background:"#060610",border:"1px solid #1e2e1e",borderRadius:"4px",padding:"6px 10px",marginBottom:"8px"}}>
        {CARD_FIELDS.map(function(f){return <div key={f[0]} style={{display:"flex",gap:"8px",lineHeight:"1.6"}}>
          <span style={{color:"#607060",fontFamily:"monospace",minWidth:"90px",flexShrink:0,fontSize:"10px"}}>{f[0]}:</span>
          <span style={{fontStyle:"normal",color:"#a0c0a0",fontSize:"11px"}}>{f[1]}</span>
        </div>;})}
      </div>}
      <div style={{fontStyle:"italic",lineHeight:"1.6",color:"#b8b4a8"}}>{s.Description}</div>
      {extras.length>0&&<div style={{marginTop:"6px",borderTop:"1px solid #1e2e1e",paddingTop:"4px"}}>
        {extras.map(function(k){return <div key={k} style={{marginBottom:"2px"}}><span style={{color:dim,fontFamily:"monospace",marginRight:"6px"}}>{k}:</span><span style={{fontStyle:"normal",color:txt}}>{String(s[k])}</span></div>;})}
      </div>}
    </div>;
  }
  function spellExtraFields(s){
    return Object.keys(s).filter(function(k){return !HIDDEN_FIELDS.has(k)&&s[k]!==""&&s[k]!==null&&s[k]!==undefined;});
  }
  async function doSpellSearch(){
    if(!aiQuery.trim()||aiLoading)return;
    setAiLoading(true);setAiResult("");setAiHighlight([]);setAiThinking("");setAiThinkingOpen(false);
    // Build class-filtered spell list
    var searchDb=edition==='1e'&&isWizard
      ?spells1e.filter(function(s){
          return cls==='Illusionist'?(s._1eClass==='illusionist'||s._1eClass==='mu/i'):(s._1eClass==='mu'||s._1eClass==='mu/i');
        })
      :SPELL_DATA;
    // Narrow to levels this character can actually cast — fewer spells = richer descriptions
    var maxCastable=adjSlots.reduce(function(mx,n,i){return n>0?i+1:mx;},0);
    if(maxCastable>0)searchDb=searchDb.filter(function(s){return (parseInt(s.Level)||0)<=maxCastable;});
    var charContext={cls,level,race,adjSlots,memorized,notes};
    try{
      await streamSpellSearch(
        aiQuery, searchDb, charContext,
        function(chunk){setAiResult(function(p){return p+chunk;});},
        function(full){setAiHighlight(extractSpellNames(full));setAiLoading(false);},
        function(thinking){setAiThinking(function(p){return p+thinking;});}
      );
    }catch(e){setAiResult("Error: "+e.message);setAiLoading(false);}
  }
  function prepareFromAI(spell){
    setMemorized(function(prev){
      return prev.concat([Object.assign({},spell,{prepId:Date.now()+"_"+Math.random()})]);
    });
  }
  async function doGenChar(){
    if(!genPrompt.trim()||genLoading)return;
    setGenLoading(true);setGenResult(null);
    try{
      var r=await generateCharacter(genPrompt);
      setGenResult(r);
      // Auto-pick starter kit based on generated class if user hasn't overridden
      if(r&&!r.error&&r.cls)setGenKit(defaultKitForClass(r.cls));
    }catch(e){setGenResult({error:e.message});}
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
    // Apply starter kit inventory — stamp each item with a unique id
    var kitItems=(STARTER_KITS[genKit]||[]).map(function(item){
      return Object.assign({},item,{id:Date.now()+"_"+Math.random().toString(36).slice(2)+"_"+item.name.replace(/\s/g,'')});
    });
    setInventory(kitItems);
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
    var activeSlot=charSlots.find(function(s){return s.id===activeSlotId;});
    return {charName,race,cls,kit,level,xp,hp,align,stats,strPct,memorized,notes,
      cpBudget,cpMajor,cpMinor,cpSchools,cpAbil,cpLim,cpSpellPowers,dmOverride,totemAnimal,shapeUsesLeft,shapeFailed,gearItems,cpDayUses,wpUsed,nwpUsed,inventory,cloudId,
      monkStyleForm,monkStyleMethod,monkStyleName,monkManeuvers,
      edition,charPortrait,
      slotType:activeSlot?activeSlot.type||null:null,
      slotPcRef:activeSlot?activeSlot.slotPcRef||null:null,
      _version:1};
  }
  // Unconditionally sets ALL character state — no conditionals so no bleed between tabs
  function applyCharacterData(d){
    if(!d)return;
    setCharName(d.charName||"");
    if(d.race&&RACES[d.race])setRace(d.race); else setRace("Human");
    if(d.cls&&CLASSES[d.cls])changeClass(d.cls); else changeClass("Druid");
    setKit(d.kit||"");
    setLevel(parseInt(d.level)||1);
    setXP(parseInt(d.xp)||0);
    setHP(parseInt(d.hp)||1);
    setAlign(d.align||"True Neutral");
    setStats(d.stats?{Str:d.stats.Str||10,Dex:d.stats.Dex||10,Con:d.stats.Con||10,Int:d.stats.Int||10,Wis:d.stats.Wis||10,Cha:d.stats.Cha||10}:{Str:10,Dex:10,Con:10,Int:10,Wis:10,Cha:10});
    setStrPct(parseInt(d.strPct)||0);
    setMemorized(d.memorized||[]);
    setNotes(d.notes||"");
    setCpBudget(d.cpBudget||120);
    setCpMajor(d.cpMajor||[]);
    setCpMinor(d.cpMinor||[]);
    setCpSchools(d.cpSchools||[]);
    setCpAbil(d.cpAbil||[]);
    setCpLim(d.cpLim||[]);
    setCpSpellPowers(d.cpSpellPowers||[]);
    setDmOverride(d.dmOverride||false);
    setTotemAnimal(d.totemAnimal||"");
    setShapeUsesLeft(parseInt(d.shapeUsesLeft)||0);
    setShapeFailed(parseInt(d.shapeFailed)||0);
    setGearItems(d.gearItems||[]);
    setCpDayUses(d.cpDayUses||{});
    setWpUsed(parseInt(d.wpUsed)||0);
    setNwpUsed(parseInt(d.nwpUsed)||0);
    setInventory(d.inventory||[]);
    setCloudId(d.cloudId||null);
    setEdition(d.edition||'2e');
    setMonkStyleForm(d.monkStyleForm||"Hard");
    setMonkStyleMethod(d.monkStyleMethod||"Strike");
    setMonkStyleName(d.monkStyleName||"");
    setMonkManeuvers(d.monkManeuvers||[]);
    setCharPortrait(d.charPortrait||null);
    // Clear transient combat/session state that doesn't travel with the character
    setActiveCasts([]);setCombatRound(1);setCastingSpell(null);
    setTab("stats");
  }

  // ── Portrait upload / AI generation ──────────────────────────────────────
  function handlePortraitUpload(e){
    var file=e.target.files[0];if(!file)return;
    var rd=new FileReader();
    rd.onload=function(ev){setCharPortrait(ev.target.result);};
    rd.readAsDataURL(file);
    e.target.value="";
  }
  async function generatePortrait(opts){
    // Use custom prompt if the user typed one; otherwise auto-build from character
    var prompt=portraitPrompt.trim();
    if(!prompt){
      var r=(opts&&opts.race)||race;
      var c=(opts&&opts.cls)||cls;
      var k=(opts&&opts.kit)||kit;
      var a=(opts&&opts.align)||align;
      var n=(opts&&opts.notes)||notes;
      var descParts=[r,c];
      if(k)descParts.push(k);
      if(a)descParts.push(a);
      if(n)descParts.push(n.slice(0,150));
      prompt="Fantasy character portrait, "+descParts.join(", ")+", AD&D tabletop RPG style, detailed face, dramatic lighting, oil painting, high quality";
      setPortraitPrompt(prompt);
    }
    setPortraitPromptOpen(true);
    setPortraitLoading(true);
    setPortraitError("");
    if(portraitAbortRef.current)portraitAbortRef.current.abort();
    var controller=new AbortController();
    portraitAbortRef.current=controller;
    var timer=setTimeout(function(){controller.abort();},60000);
    try{
      var resp=await fetch("/api/generate-portrait",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({prompt:prompt}),
        signal:controller.signal
      });
      var data=await resp.json();
      if(!resp.ok||data.error)throw new Error(data.error||"HTTP "+resp.status);
      setCharPortrait(data.dataUrl);
    }catch(err){
      if(err.name!=="AbortError")setPortraitError("Generation failed — try again");
    }finally{
      clearTimeout(timer);
      setPortraitLoading(false);
    }
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
      reader.onload=function(ev){try{var d=JSON.parse(ev.target.result);applyCharacterData(d);if(d.slotType&&activeSlotId)setSlotType(activeSlotId,d.slotType,null);setCloudStatus("Loaded from file");}catch(_){setCloudStatus("Error: invalid JSON");}};
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
  async function doSendReset(){
    if(!authEmail.trim())return;
    setAuthLoading(true);setAuthError("");
    try{
      await resetPasswordForEmail(authEmail.trim());
      setAuthError("Reset email sent — check your inbox.");
    }catch(e){setAuthError(e.message);}
    setAuthLoading(false);
  }
  async function doSetNewPassword(){
    if(!authPassword.trim())return;
    if(authPassword!==authConfirmPw){setAuthError("Passwords do not match.");return;}
    setAuthLoading(true);setAuthError("");
    try{
      await updatePassword(authPassword);
      setAuthIsRecovery(false);
      setAuthPassword("");setAuthConfirmPw("");
      setAuthMode("signin");
      setAuthError("Password updated — you are now signed in.");
      supabase.auth.getUser().then(function(r){setAuthUser(r.data.user||null);refreshAcctChars();});
    }catch(e){setAuthError(e.message);}
    setAuthLoading(false);
  }
  async function doSignOut(){
    try{await signOut();}catch(_){}
    setAuthUser(null);setCloudId(null);setAcctChars([]);setAcctStatus("");
    setDmPwVerified(false);setDmChangePw(false);
    setDmPwInput("");setDmPwConfirm("");setDmPwCurrent("");setDmPwError("");
    setDmPwHashExists(null);setGearLibItems([]);
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
      // If this is a PC, update all open henchmen so their slotPcRef points to the fresh cloudId
      var savedSlot=charSlots.find(function(s){return s.id===activeSlotId;});
      if(savedSlot&&savedSlot.type==='pc'){
        setCharSlots(function(prev){
          return prev.map(function(s){
            return(s.type==='henchman'&&s.pcId===activeSlotId)?Object.assign({},s,{slotPcRef:rec.id}):s;
          });
        });
      }
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
  async function autoOpenCloudHenchmen(pcCloudId,pcSlotId){
    if(!supabase||!pcCloudId)return;
    try{
      var userRes=await supabase.auth.getUser();
      var user=userRes.data&&userRes.data.user;
      if(!user)return;
      var res=await supabase.from("characters").select("id,name,data")
        .eq("user_id",user.id).filter("data->>slotPcRef","eq",pcCloudId);
      var henchChars=res.data||[];
      henchChars.forEach(function(hc){
        var hSnap=Object.assign({},hc.data,{cloudId:hc.id});
        var hId="slot_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
        slotSnapsRef.current[hId]=hSnap;
        setCharSlots(function(prev){
          // Skip if already open (same cloudId already in a slot's snapshot)
          var alreadyOpen=prev.some(function(s){
            var sn=slotSnapsRef.current[s.id];
            return sn&&sn.cloudId===hc.id;
          });
          if(alreadyOpen)return prev;
          return prev.concat([{id:hId,name:hSnap.charName||"Unnamed",type:"henchman",pcId:pcSlotId,dead:false,slotPcRef:pcCloudId}]);
        });
      });
    }catch(e){console.warn("[CF] Could not auto-open henchmen:",e);}
  }
  async function loadAcctChar(id){
    setAcctOpen(false);setCloudStatus("Loading…");
    try{
      var rec=await loadCharacterById(id);
      var snap=Object.assign({},rec.data,{cloudId:id});
      // Save current slot state before opening new one
      if(activeSlotId) slotSnapsRef.current[activeSlotId]=getCharacterSnapshot();
      var curName=charName||"Unnamed";
      var newId="slot_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
      slotSnapsRef.current[newId]=snap;
      setCharSlots(function(prev){
        return prev.map(function(s){return s.id===activeSlotId?Object.assign({},s,{name:curName}):s;})
          .concat([{id:newId,name:snap.charName||"Unnamed",type:snap.slotType||null,pcId:null,dead:false,slotPcRef:snap.slotPcRef||null}]);
      });
      setActiveSlotId(newId);
      applyCharacterData(snap);
      // Auto-open henchmen if this is a PC with a cloud link
      if(snap.slotType==='pc')autoOpenCloudHenchmen(id,newId);
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
  var tabs=["stats","combat","spells","✦ CP","sheet","notes","inv","items","✦ AI"];

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
      {/* Character slot tabs */}
      {charSlots.length>0&&<div style={{display:"flex",alignItems:"stretch",background:"#06060c",borderBottom:"1px solid "+brd,overflowX:"auto",flexShrink:0,minHeight:"30px"}}>
        {charSlots.slice().sort(function(a,b){return (a.dead?1:0)-(b.dead?1:0);}).map(function(s){
          var isActive=s.id===activeSlotId;
          var displayName=isActive?(charName||"Unnamed"):s.name;
          var isPC=s.type==='pc';
          var isHench=s.type==='henchman';
          var isDead=!!s.dead;
          var pcSlot=isHench?charSlots.find(function(p){return p.id===s.pcId;}):null;
          // Visual accent: dead = dark red, PC = gold, Henchman = blue-grey
          var accentColor=isDead?"#6a2020":isPC?"#c09030":isHench?"#5080a0":g;
          var bottomBorder=isActive?"2px solid "+accentColor:"2px solid transparent";
          var nameColor=isDead?(isActive?"#8a5050":"#554040"):isActive?g:isPC?"#d4a840":isHench?"#7090b0":dim;
          var sid=s.id;
          return <div key={sid} onClick={function(){switchCharSlot(sid);}}
            onContextMenu={function(e){e.preventDefault();var r=e.currentTarget.getBoundingClientRect();setSlotCtxMenu({slotId:sid,x:r.left,y:r.bottom});}}
            style={{display:"flex",alignItems:"center",gap:"5px",padding:"0 4px 0 10px",background:isActive?(isDead?"#1a0a0a":"#12111a"):"transparent",borderRight:"1px solid "+brd,borderBottom:bottomBorder,marginBottom:"-1px",cursor:isActive?"default":"pointer",flexShrink:0,maxWidth:"200px",minWidth:"60px",boxSizing:"border-box",opacity:isDead?0.65:1}}>
            {isDead&&<span style={{fontSize:"9px",color:"#8a4040",flexShrink:0}}>☠</span>}
            {!isDead&&isPC&&<span style={{fontSize:"9px",color:"#c09030",flexShrink:0}}>♦</span>}
            {!isDead&&isHench&&<span style={{fontSize:"9px",color:"#5080a0",flexShrink:0}} title={pcSlot?"Henchman of "+pcSlot.name:"Henchman"}>→</span>}
            <span style={{fontSize:"11px",color:nameColor,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,padding:"5px 0",textDecoration:isDead?"line-through":"none"}}>{displayName}</span>
            <button onClick={function(e){e.stopPropagation();var r=e.currentTarget.getBoundingClientRect();setSlotCtxMenu({slotId:sid,x:r.left,y:r.bottom});}}
              title="Tag / manage this character"
              style={{background:"transparent",border:"none",color:dim,cursor:"pointer",padding:"1px 3px",fontSize:"13px",lineHeight:1,flexShrink:0,opacity:0.6}}>⋯</button>
            {charSlots.length>1&&<button onClick={function(e){e.stopPropagation();closeCharSlot(s.id);}}
              style={{background:"transparent",border:"none",color:dim,cursor:"pointer",padding:"1px 2px",fontSize:"12px",lineHeight:1,flexShrink:0,opacity:0.7}}>×</button>}
          </div>;
        })}
        <button onClick={newCharSlot} title="New character tab"
          style={{background:"transparent",border:"none",color:dim,cursor:"pointer",padding:"0 13px",fontSize:"16px",flexShrink:0,borderLeft:"1px solid "+brd}}>+</button>
      </div>}
      {/* Tab right-click context menu */}
      {slotCtxMenu&&(function(){
        var menuSlot=charSlots.find(function(s){return s.id===slotCtxMenu.slotId;});
        if(!menuSlot)return null;
        var pcSlots=charSlots.filter(function(s){return s.type==='pc'&&s.id!==menuSlot.id;});
        var archivedHenchCount=menuSlot.type==='pc'?Object.values(henchArchiveRef.current).filter(function(h){return h.pcId===menuSlot.id;}).length:0;
        return <div style={{position:"fixed",inset:0,zIndex:1100}} onClick={function(){setSlotCtxMenu(null);}}>
          <div style={{position:"fixed",left:slotCtxMenu.x,top:slotCtxMenu.y,background:"#12111a",border:"1px solid #2a2a4a",borderRadius:"6px",padding:"6px 0",minWidth:"200px",boxShadow:"0 4px 16px rgba(0,0,0,0.7)",zIndex:1101}} onClick={function(e){e.stopPropagation();}}>
            <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px",padding:"4px 14px 6px",borderBottom:"1px solid #2a2a4a"}}>{(menuSlot.id===activeSlotId?charName:menuSlot.name)||"Unnamed"}</div>
            <button onClick={function(){setSlotType(slotCtxMenu.slotId,'pc',null);setSlotCtxMenu(null);}}
              style={{display:"block",width:"100%",textAlign:"left",padding:"7px 14px",background:menuSlot.type==='pc'?"#1a1a2a":"transparent",color:menuSlot.type==='pc'?"#d4a840":g,border:"none",cursor:"pointer",fontSize:"12px",fontFamily:"monospace"}}>♦ Mark as PC</button>
            {archivedHenchCount>0&&<button onClick={function(){openHenchmen(menuSlot.id);setSlotCtxMenu(null);}}
              style={{display:"block",width:"100%",textAlign:"left",padding:"7px 14px 7px 22px",background:"transparent",color:"#7090b0",border:"none",cursor:"pointer",fontSize:"12px",fontFamily:"monospace"}}>→ Open Henchmen ({archivedHenchCount})</button>}
            {pcSlots.length>0&&<div>
              <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px",padding:"6px 14px 3px"}}>HENCHMAN OF</div>
              {pcSlots.map(function(pc){
                var pcName=pc.id===activeSlotId?charName:pc.name;
                var isLinked=menuSlot.type==='henchman'&&menuSlot.pcId===pc.id;
                return <button key={pc.id} onClick={function(){setSlotType(slotCtxMenu.slotId,'henchman',pc.id);setSlotCtxMenu(null);}}
                  style={{display:"block",width:"100%",textAlign:"left",padding:"6px 14px 6px 22px",background:isLinked?"#1a1a2a":"transparent",color:isLinked?"#7090b0":g,border:"none",cursor:"pointer",fontSize:"12px",fontFamily:"monospace"}}>
                  {isLinked?"✓ ":""}{pcName||"Unnamed"}
                </button>;
              })}
            </div>}
            {menuSlot.type&&<button onClick={function(){setSlotType(slotCtxMenu.slotId,null,null);setSlotCtxMenu(null);}}
              style={{display:"block",width:"100%",textAlign:"left",padding:"7px 14px",background:"transparent",color:"#a06060",border:"none",borderTop:"1px solid #2a2a4a",cursor:"pointer",fontSize:"12px",fontFamily:"monospace",marginTop:"4px"}}>✕ Clear tag</button>}
            <div style={{borderTop:"1px solid #2a2a4a",marginTop:"4px"}}>
              {!menuSlot.dead?(
                <button onClick={function(){setSlotDead(slotCtxMenu.slotId,true);setSlotCtxMenu(null);}}
                  style={{display:"block",width:"100%",textAlign:"left",padding:"7px 14px",background:"transparent",color:"#b04040",border:"none",cursor:"pointer",fontSize:"12px",fontFamily:"monospace"}}>☠ Mark as Dead</button>
              ):(
                <button onClick={function(){setSlotDead(slotCtxMenu.slotId,false);setSlotCtxMenu(null);}}
                  style={{display:"block",width:"100%",textAlign:"left",padding:"7px 14px",background:"transparent",color:"#60b060",border:"none",cursor:"pointer",fontSize:"12px",fontFamily:"monospace"}}>✦ Resurrect</button>
              )}
            </div>
          </div>
        </div>;
      })()}

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
          <button onClick={newCharSlot} style={{padding:"6px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:"#2a1a1a",color:"#a07d7d",border:"1px solid #4e2e2e"}}>NEW</button>
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
          {!authUser||authIsRecovery?(
            /* ── Sign in / sign up / reset / new-password forms ── */
            <div>
              {authMode==="newpassword"?(
                /* Set new password after clicking reset link */
                <div>
                  <div style={{fontSize:"12px",color:dim,fontFamily:"monospace",marginBottom:"14px"}}>Enter your new password below.</div>
                  <input type="password" value={authPassword} onChange={function(e){setAuthPassword(e.target.value);setAuthError("");}}
                    onKeyDown={function(e){if(e.key==="Enter")doSetNewPassword();}}
                    placeholder="New password" autoComplete="new-password"
                    style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",background:"#0a0a12",border:"1px solid "+(authError&&!authError.includes("updated")?"#e08080":brd),borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"8px"}}/>
                  <input type="password" value={authConfirmPw} onChange={function(e){setAuthConfirmPw(e.target.value);setAuthError("");}}
                    onKeyDown={function(e){if(e.key==="Enter")doSetNewPassword();}}
                    placeholder="Confirm new password" autoComplete="new-password"
                    style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",background:"#0a0a12",border:"1px solid "+(authError&&authError.includes("match")?"#e08080":brd),borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"8px"}}/>
                  {authError&&<div style={{fontSize:"11px",color:authError.includes("updated")?"#7db87d":"#e08080",fontFamily:"monospace",marginBottom:"8px"}}>{authError}</div>}
                  <button onClick={doSetNewPassword} disabled={authLoading||!authPassword.trim()||!authConfirmPw.trim()}
                    style={{width:"100%",padding:"9px",background:authLoading?"#1a1a28":"#1e1a2e",color:authLoading?dim:g,border:"1px solid "+(authLoading?brd:"#3a2a5a"),borderRadius:"4px",cursor:authLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"12px"}}>
                    {authLoading?"Updating…":"Set New Password"}
                  </button>
                </div>
              ):authMode==="reset"?(
                /* Request password reset email */
                <div>
                  <div style={{fontSize:"12px",color:dim,fontFamily:"monospace",marginBottom:"14px"}}>Enter your email and we'll send you a reset link.</div>
                  <input type="email" value={authEmail} onChange={function(e){setAuthEmail(e.target.value);setAuthError("");}}
                    onKeyDown={function(e){if(e.key==="Enter")doSendReset();}}
                    placeholder="Email" autoComplete="username"
                    style={{width:"100%",boxSizing:"border-box",padding:"8px 10px",background:"#0a0a12",border:"1px solid "+(authError&&!authError.includes("sent")?"#e08080":brd),borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"8px"}}/>
                  {authError&&<div style={{fontSize:"11px",color:authError.includes("sent")?"#7db87d":"#e08080",fontFamily:"monospace",marginBottom:"8px"}}>{authError}</div>}
                  <button onClick={doSendReset} disabled={authLoading||!authEmail.trim()}
                    style={{width:"100%",padding:"9px",background:authLoading?"#1a1a28":"#1e1a2e",color:authLoading?dim:g,border:"1px solid "+(authLoading?brd:"#3a2a5a"),borderRadius:"4px",cursor:authLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"12px",marginBottom:"10px"}}>
                    {authLoading?"Sending…":"Send Reset Email"}
                  </button>
                  <button onClick={function(){setAuthMode("signin");setAuthError("");}}
                    style={{width:"100%",padding:"6px",background:"transparent",color:dim,border:"1px solid #1a1a2a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px"}}>
                    Back to Sign In
                  </button>
                </div>
              ):(
                /* Sign in / Sign up */
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
                    style={{width:"100%",padding:"9px",background:authLoading?"#1a1a28":"#1e1a2e",color:authLoading?dim:g,border:"1px solid "+(authLoading?brd:"#3a2a5a"),borderRadius:"4px",cursor:authLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"12px",marginBottom:authMode==="signin"?"8px":"0"}}>
                    {authLoading?"Working…":authMode==="signin"?"Sign In":"Create Account"}
                  </button>
                  {authMode==="signin"&&<button onClick={function(){setAuthMode("reset");setAuthError("");}}
                    style={{width:"100%",padding:"5px",background:"transparent",color:dim,border:"none",cursor:"pointer",fontFamily:"monospace",fontSize:"10px",textAlign:"right"}}>
                    Forgot password?
                  </button>}
                </div>
              )}
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
              <div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>HD: d{effectiveHD}{effectiveHD!==classData.hd&&<span style={{color:"#80c0e0"}}> (base d{classData.hd})</span>} | {classData.group} | CP: {isPriest?120:isWizard?40:0}</div>
            </Card>
            {(cls==='Mage'||cls==='Illusionist')&&<Card brd={brd} surf={surf}><Lbl dim={dim}>EDITION</Lbl>
              <div style={{display:"flex",gap:"4px"}}>
                {['2e','1e'].map(function(ed){var on=edition===ed;
                  return <button key={ed} onClick={function(){setEdition(ed);}}
                    style={{flex:1,padding:"4px 8px",background:on?"#1a2a18":surf,color:on?g:dim,
                      border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",cursor:"pointer",
                      fontFamily:"monospace",fontSize:"11px"}}>
                    {ed==='1e'?'AD&D 1E':'AD&D 2E'}
                  </button>;
                })}
              </div>
              {edition==='1e'&&!spells1eLoaded&&<div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>Loading 1E spells…</div>}
              {edition==='1e'&&spells1eLoaded&&spells1e.length===0&&<div style={{fontSize:"10px",color:"#e08060",marginTop:"4px",fontFamily:"monospace"}}>⚠ 1e-spells.xlsx not found in /public</div>}
              {edition==='1e'&&spells1e.length>0&&<div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>{spells1e.filter(function(s){return cls==='Illusionist'?(s._1eClass==='illusionist'||s._1eClass==='mu/i'):(s._1eClass==='mu'||s._1eClass==='mu/i');}).length} spells loaded</div>}
            </Card>}
            {/* Portrait card */}
            <Card brd={brd} surf={surf}><Lbl dim={dim}>PORTRAIT</Lbl>
              <div style={{width:portraitPromptOpen?"250px":"110px"}}>
                {charPortrait
                  ?<img src={charPortrait} alt="portrait" style={{width:"110px",height:"110px",objectFit:"cover",borderRadius:"4px",border:"1px solid "+brd,display:"block",marginBottom:"6px"}} />
                  :<div style={{width:"110px",height:"110px",background:"#0a0a12",border:"1px dashed "+brd,borderRadius:"4px",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:"6px",fontSize:"9px",color:dim,fontFamily:"monospace",textAlign:"center",lineHeight:"1.4"}}>
                    {portraitLoading?"Generating…":"No portrait"}
                  </div>
                }
                <div style={{display:"flex",gap:"4px",marginBottom:"4px"}}>
                  <label style={{flex:1,padding:"3px 0",background:"#0a0a1a",border:"1px solid "+brd,borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px",color:dim,textAlign:"center",display:"block"}}>
                    Upload
                    <input type="file" accept="image/*" onChange={handlePortraitUpload} style={{display:"none"}} />
                  </label>
                  <button onClick={function(){generatePortrait({});}} disabled={portraitLoading}
                    style={{flex:1,padding:"3px 0",background:portraitLoading?"transparent":"#0a0a1a",color:portraitLoading?dim:"#80a0e0",border:"1px solid "+(portraitLoading?brd:"#2a3a5a"),borderRadius:"3px",cursor:portraitLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"9px"}}>
                    {portraitLoading?"…":"AI Gen"}
                  </button>
                </div>
                {portraitLoading&&<button onClick={function(){if(portraitAbortRef.current)portraitAbortRef.current.abort();setPortraitLoading(false);setPortraitError("Cancelled");}}
                  style={{width:"110px",marginBottom:"4px",padding:"2px 0",background:"transparent",color:"#e08060",border:"1px solid #5a3020",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>
                  ✕ Cancel
                </button>}
                {portraitError&&!portraitLoading&&<div style={{fontSize:"9px",color:"#e08060",fontFamily:"monospace",marginBottom:"4px",wordBreak:"break-word"}}>{portraitError}</div>}
                {(charPortrait||portraitPrompt)&&<button onClick={function(){setPortraitPromptOpen(function(p){return !p;});}}
                  style={{width:"110px",marginBottom:"4px",padding:"2px 0",background:"transparent",color:portraitPromptOpen?"#80a0e0":dim,border:"1px solid "+(portraitPromptOpen?"#2a3a5a":brd),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>
                  {portraitPromptOpen?"▲ hide prompt":"▼ edit prompt"}
                </button>}
                {portraitPromptOpen&&<div>
                  <textarea value={portraitPrompt} onChange={function(e){setPortraitPrompt(e.target.value);}}
                    placeholder="Describe the portrait — leave blank to auto-build from character stats"
                    style={{width:"100%",height:"80px",padding:"6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"10px",fontFamily:"monospace",outline:"none",resize:"vertical",lineHeight:"1.4",boxSizing:"border-box"}} />
                  <div style={{display:"flex",gap:"4px",marginTop:"4px"}}>
                    <button onClick={function(){generatePortrait({});}} disabled={portraitLoading}
                      style={{flex:1,padding:"3px 0",background:portraitLoading?"transparent":"#1a1a2a",color:portraitLoading?dim:"#80a0e0",border:"1px solid "+(portraitLoading?brd:"#2a3a5a"),borderRadius:"3px",cursor:portraitLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"9px"}}>
                      {portraitLoading?"Generating…":"Regenerate"}
                    </button>
                    <button onClick={function(){setPortraitPrompt("");setPortraitError("");}}
                      style={{padding:"3px 8px",background:"transparent",color:dim,border:"1px solid "+brd,borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>
                      Reset
                    </button>
                    {portraitLoading&&<button onClick={function(){if(portraitAbortRef.current)portraitAbortRef.current.abort();setPortraitLoading(false);setPortraitError("Cancelled");}}
                      style={{padding:"3px 8px",background:"transparent",color:"#e08060",border:"1px solid #5a3020",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>
                      Cancel
                    </button>}
                  </div>
                </div>}
                {charPortrait&&<button onClick={function(){setCharPortrait(null);setPortraitPrompt("");setPortraitPromptOpen(false);}}
                  style={{marginTop:"4px",width:"110px",padding:"2px 0",background:"transparent",color:dim,border:"1px solid "+brd,borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>Clear</button>}
              </div>
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
      var hd=effectiveHD||6;
      var total=0;
      for(var i=0;i<level;i++){total+=Math.floor(Math.random()*hd)+1+conB;}
      setHP(Math.max(level,total));
    }} title={"Roll "+level+"d"+effectiveHD+(conB!==0?"+"+(conB*level):"")}
      style={{background:"#1a2a1a",color:"#7a7",border:"1px solid #3a5a3a",borderRadius:"4px",padding:"2px 6px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace",whiteSpace:"nowrap"}}>
      ROLL {level}d{effectiveHD}{conB!==0&&(conB>0?"+":"")+conB+"/die"}
    </button>
  </div>
  <div style={{fontSize:"10px",color:dim,marginTop:"4px",fontFamily:"monospace"}}>Con: {conB>=0?"+":""}{conB}/die | d{effectiveHD} HD{effectiveHD!==classData.hd&&<span style={{color:"#80c0e0"}}> (CP: d{classData.hd}→d{effectiveHD})</span>}</div>
</Card>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>ALIGNMENT</Lbl>
              <select value={align} onChange={function(e){setAlign(e.target.value);}} style={ss(brd,txt)}>{["Lawful Good","Lawful Neutral","Lawful Evil","Neutral Good","True Neutral","Neutral Evil","Chaotic Good","Chaotic Neutral","Chaotic Evil"].map(function(a){return <option key={a}>{a}</option>;})}</select>
            </Card>
            <Card brd={brd} surf={surf}><Lbl dim={dim}>PROFICIENCIES</Lbl>
              <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                {[{label:"Weapon",used:wpUsed,total:totalWP,set:setWpUsed},{label:"Non-Weapon",used:nwpUsed,total:totalNWP,set:setNwpUsed}].map(function(p){
                  var over=p.used>p.total;
                  return <div key={p.label} style={{display:"flex",alignItems:"center",gap:"5px"}}>
                    <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",minWidth:"72px"}}>{p.label}</span>
                    <span style={{fontSize:"14px",fontWeight:"bold",color:over?"#e06060":p.used===p.total?"#e0c060":g,fontFamily:"monospace",minWidth:"42px",textAlign:"center"}}>{p.used}/{p.total}</span>
                    <button onClick={function(){p.set(function(v){return Math.max(0,v-1);});}} style={{background:"transparent",border:"1px solid #3a3a5a",color:p.used>0?g:dim,borderRadius:"3px",width:"18px",height:"18px",cursor:p.used>0?"pointer":"default",fontSize:"12px",lineHeight:"1",padding:"0"}}>−</button>
                    <button onClick={function(){p.set(function(v){return v+1;});}} style={{background:"transparent",border:"1px solid #3a3a5a",color:"#80c080",borderRadius:"3px",width:"18px",height:"18px",cursor:"pointer",fontSize:"12px",lineHeight:"1",padding:"0"}}>+</button>
                  </div>;
                })}
              </div>
              <div style={{fontSize:"9px",color:dim,fontFamily:"monospace",marginTop:"4px"}}>{classData.group} · WP +1/lv{profRates.wpRate} · NWP +1/lv{profRates.nwpRate}</div>
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
            <SB label={cpThac0Type!==classData.thac0?"THAC0*":"THAC0"} value={effThac0} color="#e0c080" sub={"Hit: "+(effStrB.hit>=0?"+":"")+effStrB.hit+(gearThac0?" Gear:"+(gearThac0>0?"+":"")+gearThac0:"")+(cpThac0Type!==classData.thac0?" CP:"+cpThac0Type:"")} />
            <SB label={(buffAC>0||cpAcBonus>0)?"AC*":"AC"} value={effAC} color="#80a0e0" sub={(gearBaseAC!==null?"Armor: "+gearBaseAC+" ":"")+"Dex: "+dexAC(adjStats.Dex)+(gearAC?" Gear:"+(gearAC>0?"+":"")+gearAC:"")+(cpAcBonus?" CP:+"+cpAcBonus:"")} />
            <SB label="HP" value={effHP} color="#e08080" sub={"d"+effectiveHD+(effectiveHD!==classData.hd?" (CP)":"")+(gearHP?" +"+gearHP+" gear":"")} />
            <SB label="DMG ADJ" value={(effStrB.dmg+gearDmg>=0?"+":"")+(effStrB.dmg+gearDmg)} color="#e0a080" sub={effStrPct>0?"18/"+(effStrPct===100?"00":String(effStrPct).padStart(2,"0")):exStr?"18/"+(strPct===100?"00":String(strPct).padStart(2,"0")):"Str "+effStr} />
          </div>
          <Lbl dim={dim}>SAVING THROWS</Lbl>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"8px",marginBottom:"20px"}}>
            {Object.keys(effSaves).map(function(s){var n={Para:"Para/Poison",Rod:"Rod/Staff",Pet:"Petrify",Breath:"Breath",Spell:cpSaveMod>0&&isWizard?"Spell*":"Spell"};
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
            <button onClick={newDay} title="Reset combat + restore all per-day abilities" style={{marginLeft:"auto",background:"#1a1a28",color:"#80a0c0",border:"1px solid #2a2a4a",padding:"3px 10px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace"}}>🌅 New Day</button>
          </div>
          {/* ── Daily Abilities ── */}
          {cpDayAbilList.length>0&&<div style={{marginBottom:"10px",border:"1px solid #2a2a4a",borderRadius:"6px",overflow:"hidden"}}>
            <div style={{background:"#0d0d1e",padding:"5px 12px",fontSize:"10px",color:"#80a0c0",fontFamily:"monospace",letterSpacing:"1px"}}>DAILY ABILITIES</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px",padding:"8px 12px"}}>
              {cpDayAbilList.map(function(ab){
                var used=cpDayUses[ab.key]||0;
                var remaining=ab.max-used;
                var depleted=remaining<=0;
                return <div key={ab.key} style={{display:"flex",alignItems:"center",gap:"6px",padding:"4px 10px",background:depleted?"#1a0a0a":"#0d1222",border:"1px solid "+(depleted?"#4a2020":"#2a2a4a"),borderRadius:"4px"}}>
                  <span style={{fontSize:"11px",color:depleted?"#a06060":"#bbb",fontFamily:"monospace"}}>{ab.label}</span>
                  <span style={{fontSize:"13px",color:depleted?"#e06060":g,fontWeight:"bold",fontFamily:"monospace",minWidth:"36px",textAlign:"center"}}>{remaining}/{ab.max}</span>
                  <button onClick={function(){if(used<ab.max)setCpDayUses(function(p){var n=Object.assign({},p);n[ab.key]=(n[ab.key]||0)+1;return n;});}} disabled={depleted} style={{background:"transparent",border:"none",color:depleted?dim:"#e06060",cursor:depleted?"not-allowed":"pointer",fontSize:"14px",padding:"0 2px",lineHeight:1}} title="Use one charge">−</button>
                  <button onClick={function(){if(used>0)setCpDayUses(function(p){var n=Object.assign({},p);n[ab.key]=Math.max(0,(n[ab.key]||0)-1);return n;});}} disabled={used<=0} style={{background:"transparent",border:"none",color:used<=0?dim:"#7db87d",cursor:used<=0?"not-allowed":"pointer",fontSize:"14px",padding:"0 2px",lineHeight:1}} title="Restore one charge">+</button>
                </div>;
              })}
            </div>
          </div>}

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
                {aOpen&&<div style={{padding:"4px 14px 8px 44px"}}>
                  <SpellCard s={c} dim={dim} txt={txt} g={g} />
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
              var durLabel=s["Duration"]?(" · "+s["Duration"]):(SPELL_DURATIONS[s["Spell Name"]]?(" · "+SPELL_DURATIONS[s["Spell Name"]](level)+" rds"):"");
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
                {isCasting&&(function(){
                  var ct=s["Casting Time"]?formatCastingTime(s["Casting Time"]):null;
                  var dur=s["Duration"]||null;
                  var rng=s["Range"]||null;
                  var fields=[[ct&&"CT",ct],[dur&&"Duration",dur],[rng&&"Range",rng]].filter(function(f){return f[0]&&f[1];});
                  if(!fields.length)return null;
                  return <div style={{padding:"0 12px 6px 44px"}}>
                    <div style={{background:"#060610",border:"1px solid #1e3e1e",borderRadius:"4px",padding:"4px 10px",fontSize:"10px",fontFamily:"monospace",display:"flex",gap:"16px",flexWrap:"wrap"}}>
                      {fields.map(function(f){return <span key={f[0]}><span style={{color:"#607060"}}>{f[0]}: </span><span style={{color:"#a0c0a0"}}>{f[1]}</span></span>;})}
                    </div>
                  </div>;
                })()}
                {pOpen&&<div style={{padding:"4px 14px 8px 44px"}}>
                  <SpellCard s={s} dim={dim} txt={txt} g={g} />
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
                {isOpen&&<div style={{padding:"6px 14px 10px 58px"}}>
                  <SpellCard s={s} dim={dim} txt={txt} g={g} />
                </div>}
              </div>;
            })}
            {availableSpells.length>150&&<div style={{padding:"12px",textAlign:"center",color:dim,fontSize:"12px"}}>Showing 150 of {availableSpells.length}</div>}
          </div>
        </div>}

        {/* ═══ CP TAB ═══ */}
        {tab==="CP"&&(function(){
          // Derive active sub-tab: explicit selection or auto from class
          var activeSub=cpSubTab||(isPriest?'priest':isWizard?'wizard':isMonk?'monk':'priest');
          var SUB_TABS=[
            {id:'priest',label:'Priest',classMatch:isPriest,classNames:'Cleric / Druid'},
            {id:'monk',  label:'Monk',  classMatch:isMonk,   classNames:'Monk'},
            {id:'wizard',label:'Wizard',classMatch:isWizard, classNames:'Mage / Illusionist'},
          ];
          // Per-sub-tab abilities/limits for display (browsing any tab is allowed)
          var subAbil=activeSub==='wizard'?WIZARD_ABILITIES:PRIEST_ABILITIES;
          var subLim=activeSub==='wizard'?WIZARD_LIMITS:PRIEST_LIMITS;
          // Only editable when viewing your own class's tab
          var subEditable=(activeSub==='priest'&&isPriest)||(activeSub==='wizard'&&isWizard);
          return <div>
            {/* Budget bar — always shows this character's actual CP */}
            {(isPriest||isWizard)&&<div style={{background:surf,border:"1px solid "+brd,borderRadius:"8px",padding:"14px",marginBottom:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
                <div><span style={{fontSize:"13px",color:g,fontWeight:"bold",fontVariant:"small-caps"}}>CP Budget</span><span style={{fontSize:"10px",color:dim,fontFamily:"monospace",marginLeft:"8px"}}>{isPriest?"Priest (120 base)":"Wizard (40 base)"}</span></div>
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
            </div>}

            {/* Sub-tab navigation */}
            <div style={{display:"flex",gap:"4px",marginBottom:"14px",borderBottom:"1px solid "+brd,paddingBottom:"10px"}}>
              {SUB_TABS.map(function(st){
                var isActive=activeSub===st.id;
                var hasData=st.id==='priest'?(cpMajor.length+cpMinor.length+cpAbil.filter(function(a){return PRIEST_ABILITIES[a];}).length):st.id==='wizard'?cpSchools.length+cpAbil.filter(function(a){return WIZARD_ABILITIES[a];}).length:0;
                return <button key={st.id} onClick={function(){setCpSubTab(st.id);}} style={{
                  padding:"7px 18px",borderRadius:"6px 6px 0 0",cursor:"pointer",fontSize:"12px",fontFamily:"monospace",fontWeight:isActive?"bold":"normal",
                  background:isActive?(st.classMatch?"#1a2a18":st.id==='monk'?"#1a1a2a":"#2a1a2a"):surf,
                  color:isActive?(st.classMatch?g:st.id==='monk'?"#80a0e0":"#c060a0"):dim,
                  border:"1px solid "+(isActive?(st.classMatch?"#3a5a3a":st.id==='monk'?"#2a3a5a":"#5a2a5a"):brd),
                  borderBottom:isActive?"1px solid "+(st.classMatch?"#1a2a18":st.id==='monk'?"#1a1a2a":"#2a1a2a"):"1px solid "+brd,
                  position:"relative",marginBottom:isActive?"-1px":"0",
                }}>
                  {st.label}
                  {st.classMatch&&<span style={{marginLeft:"5px",fontSize:"9px",color:"#60e060"}}>●</span>}
                  {hasData>0&&!st.classMatch&&<span style={{marginLeft:"5px",fontSize:"9px",color:"#e08060"}}>●</span>}
                </button>;
              })}
            </div>

            {/* ── PRIEST SUB-TAB ── */}
            {activeSub==='priest'&&<div>
              {!isPriest&&<div style={{padding:"10px 14px",marginBottom:"12px",background:"#1a1010",border:"1px solid #4a2a2a",borderRadius:"6px",fontSize:"11px",color:"#c08080"}}>
                ⚠ Viewing only — select Cleric or Druid on the Stats tab to make this section editable.
              </div>}
              {/* Presets */}
              <div style={{marginBottom:"12px",display:"flex",gap:"6px",flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>PRESETS:</span>
                {Object.keys(PRIEST_PRESETS).map(function(n){return <button key={n} disabled={!isPriest} onClick={function(){loadPreset(n);}} style={{padding:"4px 12px",borderRadius:"4px",cursor:isPriest?"pointer":"not-allowed",fontSize:"10px",fontFamily:"monospace",background:"#1a1a28",color:isPriest?g:dim,border:"1px solid "+brd,opacity:isPriest?1:0.5}}>{n} ({PRIEST_PRESETS[n].cost})</button>;})}
                <button disabled={!isPriest} onClick={function(){setCpMajor([]);setCpMinor([]);setCpAbil([]);setCpLim([]);setCpSpellPowers([]);}} style={{padding:"4px 12px",borderRadius:"4px",cursor:isPriest?"pointer":"not-allowed",fontSize:"10px",fontFamily:"monospace",background:"#2a1a1a",color:isPriest?"#e08080":dim,border:"1px solid #4a2a2a",opacity:isPriest?1:0.5}}>CLEAR</button>
              </div>
              {/* Spheres */}
              <div style={{marginBottom:"12px"}}>
                <Lbl dim={dim}>SPHERES OF ACCESS <span style={{color:g}}>(Table 6)</span></Lbl>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"4px"}}>
                  {SPHERE_NAMES.map(function(sp){var c=SPHERE_COSTS[sp];var isMaj=cpMajor.indexOf(sp)>=0;var isMin=cpMinor.indexOf(sp)>=0;
                    return <div key={sp} style={{display:"flex",alignItems:"center",gap:"4px",padding:"3px 8px",background:isMaj?"#1a2a18":isMin?"#18202a":surf,border:"1px solid "+(isMaj?"#3a5a3a":isMin?"#2a3a5a":brd),borderRadius:"4px",fontSize:"11px",opacity:isPriest?1:0.5}}>
                      <span style={{flex:1,color:isMaj?g:isMin?"#80c0e0":dim}}>{sp}</span>
                      <button disabled={!isPriest} onClick={function(){if(isMaj){setCpMajor(cpMajor.filter(function(x){return x!==sp;}));}else{setCpMinor(cpMinor.filter(function(x){return x!==sp;}));setCpMajor(cpMajor.concat([sp]));}}} style={{padding:"1px 5px",fontSize:"9px",fontFamily:"monospace",borderRadius:"3px",cursor:isPriest?"pointer":"not-allowed",background:isMaj?"#2a4a2a":"#1a1a28",color:isMaj?"#7a7":dim,border:"1px solid "+(isMaj?"#4a6a4a":brd)}}>M{c.M}</button>
                      <button disabled={!isPriest} onClick={function(){if(isMin){setCpMinor(cpMinor.filter(function(x){return x!==sp;}));}else{setCpMajor(cpMajor.filter(function(x){return x!==sp;}));setCpMinor(cpMinor.concat([sp]));}}} style={{padding:"1px 5px",fontSize:"9px",fontFamily:"monospace",borderRadius:"3px",cursor:isPriest?"pointer":"not-allowed",background:isMin?"#1a2a4a":"#1a1a28",color:isMin?"#80c0e0":dim,border:"1px solid "+(isMin?"#2a4a6a":brd)}}>m{c.m}</button>
                      {(isMaj||isMin)&&isPriest&&<button onClick={function(){setCpMajor(cpMajor.filter(function(x){return x!==sp;}));setCpMinor(cpMinor.filter(function(x){return x!==sp;}));}} style={{padding:"1px 3px",fontSize:"9px",color:"#a66",background:"transparent",border:"none",cursor:"pointer"}}>✕</button>}
                    </div>;
                  })}
                </div>
              </div>
              {/* Spell-like Granted Powers */}
              <div style={{marginBottom:"12px"}}>
                <Lbl dim={dim}>SPELL-LIKE GRANTED POWERS <span style={{color:g,fontWeight:"normal"}}>(max {maxGrantedPowers} at level {level})</span></Lbl>
                {cpSpellPowers.length>0&&<div style={{marginBottom:"8px",display:"flex",flexDirection:"column",gap:"4px"}}>
                  {cpSpellPowers.map(function(pw){
                    var cost=spellPowerCost(pw.level,pw.spellType,pw.freq);
                    var freqLabel=pw.freq==='week'?'1/week':pw.freq==='continuous'?'continuous':pw.freq+'/day';
                    return <div key={pw.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"5px 10px",background:"#12182a",border:"1px solid #2a3a5a",borderRadius:"4px",fontSize:"11px",opacity:isPriest?1:0.5}}>
                      <span style={{flex:1,color:txt}}>{pw.spell}</span>
                      <span style={{color:dim,fontFamily:"monospace"}}>L{pw.level} {pw.spellType}</span>
                      <span style={{color:"#80c0e0",fontFamily:"monospace"}}>{freqLabel}</span>
                      <span style={{color:"#e08060",fontFamily:"monospace",minWidth:"40px",textAlign:"right"}}>{cost} CP</span>
                      {isPriest&&<button onClick={function(){setCpSpellPowers(cpSpellPowers.filter(function(x){return x.id!==pw.id;}));}} style={{background:"transparent",border:"none",color:"#a66",cursor:"pointer",padding:"0 4px",fontSize:"13px"}}>✕</button>}
                    </div>;
                  })}
                  {cpSpellPowers.length>maxGrantedPowers&&<div style={{fontSize:"10px",color:"#e06060",fontFamily:"monospace"}}>⚠ Exceeds limit: {cpSpellPowers.length}/{maxGrantedPowers} at level {level}</div>}
                </div>}
                {isPriest&&(function(){
                  var previewCost=spellPowerCost(cpPwLevel,cpPwType,cpPwFreq);
                  var atLimit=cpSpellPowers.length>=maxGrantedPowers;
                  var FREQ_OPTS=[['week','1/week (+0)'],['1','1/day (+5)'],['2','2/day (+6)'],['3','3/day (+7)'],['continuous','Continuous (+10)']];
                  return <div style={{display:"flex",flexWrap:"wrap",gap:"6px",alignItems:"center",padding:"8px",background:surf,border:"1px solid "+brd,borderRadius:"4px"}}>
                    <input value={cpPwSpell} onChange={function(e){setCpPwSpell(e.target.value);}} placeholder="Spell name" style={{flex:1,minWidth:"140px",padding:"4px 8px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px",outline:"none"}} />
                    <select value={cpPwLevel} onChange={function(e){setCpPwLevel(parseInt(e.target.value));}} style={{padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px"}}>
                      {[1,2,3,4,5].map(function(l){return <option key={l} value={l}>L{l}</option>;})}
                    </select>
                    <select value={cpPwType} onChange={function(e){setCpPwType(e.target.value);}} style={{padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px"}}>
                      <option value="priest">Priest (+{cpPwLevel} CP)</option>
                      <option value="wizard">Wizard (+{cpPwLevel*2} CP)</option>
                    </select>
                    <select value={cpPwFreq} onChange={function(e){setCpPwFreq(e.target.value);}} style={{padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px"}}>
                      {FREQ_OPTS.map(function(o){return <option key={o[0]} value={o[0]}>{o[1]}</option>;})}
                    </select>
                    <span style={{fontFamily:"monospace",fontSize:"12px",color:"#e08060",minWidth:"46px",textAlign:"right"}}>= {previewCost} CP</span>
                    <button disabled={!cpPwSpell.trim()||atLimit} onClick={function(){
                      if(!cpPwSpell.trim())return;
                      setCpSpellPowers(cpSpellPowers.concat([{id:Date.now()+"_"+Math.random().toString(36).slice(2),spell:cpPwSpell.trim(),level:cpPwLevel,spellType:cpPwType,freq:cpPwFreq}]));
                      setCpPwSpell("");setCpPwLevel(1);setCpPwType("priest");setCpPwFreq("week");
                    }} style={{padding:"4px 12px",borderRadius:"4px",cursor:(!cpPwSpell.trim()||atLimit)?"not-allowed":"pointer",background:(!cpPwSpell.trim()||atLimit)?"#1a1a28":"#1a2a4a",color:(!cpPwSpell.trim()||atLimit)?dim:"#80c0e0",border:"1px solid "+((!cpPwSpell.trim()||atLimit)?brd:"#2a4a6a"),fontSize:"11px"}}>+ Add</button>
                  </div>;
                })()}
                <div style={{marginTop:"4px",fontSize:"10px",color:dim,fontFamily:"monospace"}}>
                  Base 10 CP · +1/level priest, +2/level wizard · +5 for 1/day, +1 per extra use · +10 continuous
                </div>
              </div>
              {/* Priest Abilities */}
              <div style={{marginBottom:"12px"}}>
                <Lbl dim={dim}>ABILITIES</Lbl>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
                  {Object.keys(PRIEST_ABILITIES).map(function(a){var d=PRIEST_ABILITIES[a];var on=cpAbil.indexOf(a)>=0;
                    return <label key={a} style={{display:"flex",alignItems:"center",gap:"6px",padding:"3px 8px",cursor:isPriest?"pointer":"default",fontSize:"11px",background:on?"#1a2a18":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:dim,opacity:isPriest?1:0.5}}>
                      <input type="checkbox" checked={on} disabled={!isPriest} onChange={function(){toggle(cpAbil,setCpAbil,a);}} style={{accentColor:g}} />
                      <span style={{flex:1}}>{a}</span>
                      <span style={{fontFamily:"monospace",fontSize:"10px",color:"#e08060"}}>{d.c}</span>
                    </label>;
                  })}
                </div>
              </div>
              {/* Priest Limitations */}
              <div style={{marginBottom:"12px"}}>
                <Lbl dim={dim}>LIMITATIONS <span style={{color:"#60a060"}}>(refund CP)</span></Lbl>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
                  {Object.keys(PRIEST_LIMITS).map(function(l){var d=PRIEST_LIMITS[l];var on=cpLim.indexOf(l)>=0;
                    return <label key={l} style={{display:"flex",alignItems:"center",gap:"6px",padding:"3px 8px",cursor:isPriest?"pointer":"default",fontSize:"11px",background:on?"#1a2818":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:dim,opacity:isPriest?1:0.5}}>
                      <input type="checkbox" checked={on} disabled={!isPriest} onChange={function(){toggle(cpLim,setCpLim,l);}} style={{accentColor:"#60a060"}} />
                      <span style={{flex:1}}>{l}</span>
                      <span style={{fontFamily:"monospace",fontSize:"10px",color:"#60a060"}}>-{d.r}</span>
                    </label>;
                  })}
                </div>
              </div>
            </div>}

            {/* ── MONK SUB-TAB ── */}
            {activeSub==='monk'&&(function(){
              if(!isMonk)return <div style={{padding:"10px 14px",marginBottom:"12px",background:"#1a1010",border:"1px solid #4a2a2a",borderRadius:"6px",fontSize:"11px",color:"#c08080"}}>
                ⚠ Viewing only — select Monk on the Stats tab to make this section editable.
              </div>;
              var sf=STYLE_FORM_DATA[monkStyleForm]||STYLE_FORM_DATA["Hard"];
              var sm=STYLE_METHOD_DATA[monkStyleMethod]||STYLE_METHOD_DATA["Strike"];
              var styleAC=10-(sf.acMod+sm.acMod);
              var styleAT=sf.atMod+sm.atMod;
              var styleDmg=dmgModToDie(sf.dmgMod+sm.dmgMod);
              var mainMethodManeuvers=MONK_MANEUVERS[monkStyleMethod]||[];
              var mentalManeuvers=MONK_MANEUVERS["Mental"]||[];
              var otherMethods=Object.keys(MONK_MANEUVERS).filter(function(m){return m!==monkStyleMethod&&m!=="Mental";});
              function toggleMan(name){setMonkManeuvers(monkManeuvers.indexOf(name)>=0?monkManeuvers.filter(function(x){return x!==name;}):monkManeuvers.concat([name]));}
              var monkMove=monkCaps?monkCaps.move:15;
              return <div>
                {!isMonk&&<div style={{padding:"10px 14px",marginBottom:"12px",background:"#1a1010",border:"1px solid #4a2a2a",borderRadius:"6px",fontSize:"11px",color:"#c08080"}}>
                  ⚠ Viewing only — select Monk on the Stats tab to make this section editable.
                </div>}
                {/* Requirements banner */}
                <div style={{background:"#0d0d1a",border:"1px solid #2a2a5a",borderRadius:"6px",padding:"10px 14px",marginBottom:"14px",fontSize:"11px",fontFamily:"monospace",color:dim}}>
                  <span style={{color:"#80a0e0",fontWeight:"bold"}}>REQUIREMENTS: </span>
                  <span style={{color:adjStats.Str>=15?"#60e060":"#e06060"}}>STR {adjStats.Str}/15</span>{" · "}
                  <span style={{color:adjStats.Wis>=15?"#60e060":"#e06060"}}>WIS {adjStats.Wis}/15</span>{" · "}
                  <span style={{color:adjStats.Dex>=15?"#60e060":"#e06060"}}>DEX {adjStats.Dex}/15</span>{" · "}
                  <span style={{color:adjStats.Con>=11?"#60e060":"#e06060"}}>CON {adjStats.Con}/11</span>
                  <span style={{marginLeft:"16px",color:"#6080a0"}}>Alignment: Lawful only</span>
                </div>

                {/* Level summary */}
                <div style={{background:"#0d1a14",border:"1px solid #2a4a3a",borderRadius:"6px",padding:"10px 14px",marginBottom:"14px",fontSize:"11px",fontFamily:"monospace"}}>
                  <span style={{color:g,fontWeight:"bold"}}>Level {level} — {MONK_LEVEL_TITLES[level]||"Monk"}</span>
                  {"  "}
                  <span style={{color:dim}}>Natural AC: <span style={{color:"#80a0e0"}}>{monkCaps?monkCaps.ac:10}</span></span>
                  {"  "}
                  <span style={{color:dim}}>Move: <span style={{color:"#80a0e0"}}>{monkMove}"</span></span>
                  {"  "}
                  <span style={{color:dim}}>Surprise: <span style={{color:"#80a0e0"}}>{monkCaps?(typeof monkCaps.surprise==="number"?monkCaps.surprise+"%":"Normal"):"Normal"}</span></span>
                  {monkCaps&&monkCaps.addAT&&<span style={{color:dim}}>{"  "}Extra AT: <span style={{color:"#e08060"}}>{monkCaps.addAT}</span></span>}
                  {monkCaps&&monkCaps.addDmg&&<span style={{color:dim}}>{"  "}Add Dmg: <span style={{color:"#e08060"}}>{monkCaps.addDmg}</span></span>}
                  {level>=2&&MONK_LEVEL_ABILITIES[level]&&<div style={{marginTop:"6px",color:"#c0d8f0",lineHeight:"1.5"}}>{MONK_LEVEL_ABILITIES[level]}</div>}
                </div>

                {/* Style builder */}
                <Lbl dim={dim}>MARTIAL ARTS STYLE</Lbl>
                {/* Quick-select common styles */}
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"10px"}}>
                  {Object.keys(COMMON_STYLES).map(function(sn){
                    var cs=COMMON_STYLES[sn];
                    var active=monkStyleName===sn;
                    return <button key={sn} onClick={function(){
                      setMonkStyleForm(cs.form);setMonkStyleMethod(cs.method);setMonkStyleName(sn);
                    }} style={{padding:"4px 10px",fontSize:"11px",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",
                      background:active?"#1a2a18":surf,border:"1px solid "+(active?"#3a5a3a":brd),color:active?g:dim}}>
                      {sn}
                    </button>;
                  })}
                  <span style={{color:dim,fontSize:"10px",alignSelf:"center",fontFamily:"monospace"}}>— or build custom:</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",marginBottom:"10px"}}>
                  <label style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                    <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px"}}>FORM</span>
                    <select value={monkStyleForm} onChange={function(e){setMonkStyleForm(e.target.value);setMonkStyleName("");}} style={{padding:"5px",background:"#0a0a14",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px"}}>
                      {Object.keys(STYLE_FORM_DATA).map(function(f){return <option key={f}>{f}</option>;})}
                    </select>
                  </label>
                  <label style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                    <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px"}}>METHOD</span>
                    <select value={monkStyleMethod} onChange={function(e){setMonkStyleMethod(e.target.value);setMonkStyleName("");}} style={{padding:"5px",background:"#0a0a14",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px"}}>
                      {Object.keys(STYLE_METHOD_DATA).map(function(m){return <option key={m}>{m}</option>;})}
                    </select>
                  </label>
                  <label style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                    <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px"}}>STYLE NAME</span>
                    <input value={monkStyleName} onChange={function(e){setMonkStyleName(e.target.value);}} placeholder="e.g. Tiger Claw" style={{padding:"5px",background:"#0a0a14",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px"}} />
                  </label>
                </div>
                {/* Computed style stats */}
                <div style={{display:"flex",gap:"12px",padding:"8px 12px",background:"#0a1420",border:"1px solid #1a3a5a",borderRadius:"6px",marginBottom:"14px",fontFamily:"monospace",fontSize:"11px",flexWrap:"wrap"}}>
                  <span style={{color:dim}}>Style AC: <span style={{color:"#80a0e0",fontWeight:"bold"}}>{styleAC}</span></span>
                  <span style={{color:dim}}>Attacks/round: <span style={{color:"#80a0e0",fontWeight:"bold"}}>{styleAT}</span></span>
                  <span style={{color:dim}}>Damage: <span style={{color:"#80a0e0",fontWeight:"bold"}}>1d{styleDmg}</span></span>
                  <span style={{color:dim}}>Body part: <span style={{color:"#80a0e0",fontWeight:"bold"}}>{sm.bodyPart}</span></span>
                  <span style={{color:"#60e060"}}>Natural AC: {monkCaps?monkCaps.ac:10} → active: {Math.min(styleAC,monkCaps?monkCaps.ac:10)+(monkManeuvers.indexOf("Ironskin")>=0?-2:0)}</span>
                </div>

                {/* Primary method maneuvers */}
                <Lbl dim={dim}>{monkStyleMethod.toUpperCase()} MANEUVERS <span style={{color:dim,fontWeight:"normal"}}>(primary method)</span></Lbl>
                <div style={{display:"grid",gridTemplateColumns:"1fr",gap:"4px",marginBottom:"12px"}}>
                  {mainMethodManeuvers.map(function(mn){
                    var on=monkManeuvers.indexOf(mn.name)>=0;
                    var prevLocked=mn.rank>1&&!mainMethodManeuvers.filter(function(x){return x.rank<mn.rank;}).every(function(x){return monkManeuvers.indexOf(x.name)>=0;});
                    return <label key={mn.name} style={{display:"flex",alignItems:"flex-start",gap:"8px",padding:"5px 8px",cursor:prevLocked?"not-allowed":"pointer",fontSize:"11px",background:on?"#1a2a18":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:prevLocked?dim+"80":dim,opacity:prevLocked?0.5:1}}>
                      <input type="checkbox" checked={on} disabled={prevLocked} onChange={function(){toggleMan(mn.name);}} style={{accentColor:g,marginTop:"1px",flexShrink:0}} />
                      <span style={{flex:1}}>
                        <span style={{color:on?g:dim,fontWeight:"bold"}}>{mn.name}</span>
                        <span style={{fontSize:"9px",color:dim,marginLeft:"6px"}}>rank {mn.rank} · {mn.type}</span>
                        <br/><span style={{fontSize:"10px",color:on?"#9ab890":dim}}>{mn.desc}</span>
                      </span>
                    </label>;
                  })}
                </div>

                {/* Mental & Physical Training (available to all styles) */}
                <Lbl dim={dim}>MENTAL & PHYSICAL TRAINING <span style={{color:dim,fontWeight:"normal"}}>(any style)</span></Lbl>
                <div style={{display:"grid",gridTemplateColumns:"1fr",gap:"4px",marginBottom:"12px"}}>
                  {/* Missile Deflection is always free for monks */}
                  <div style={{padding:"5px 8px",fontSize:"11px",background:"#1a1a2a",border:"1px solid #2a3a5a",borderRadius:"4px",color:"#80a0e0"}}>
                    ★ Missile Deflection — always free for monks (rank 4 · soft) — save vs. paralyzation to dodge each nonmagical missile
                  </div>
                  {mentalManeuvers.map(function(mn){
                    var on=monkManeuvers.indexOf(mn.name)>=0;
                    var prevLocked=mn.rank>1&&!mentalManeuvers.filter(function(x){return x.rank<mn.rank;}).every(function(x){return monkManeuvers.indexOf(x.name)>=0;});
                    return <label key={mn.name} style={{display:"flex",alignItems:"flex-start",gap:"8px",padding:"5px 8px",cursor:prevLocked?"not-allowed":"pointer",fontSize:"11px",background:on?"#1a2a18":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:prevLocked?dim+"80":dim,opacity:prevLocked?0.5:1}}>
                      <input type="checkbox" checked={on} disabled={prevLocked} onChange={function(){toggleMan(mn.name);}} style={{accentColor:g,marginTop:"1px",flexShrink:0}} />
                      <span style={{flex:1}}>
                        <span style={{color:on?g:dim,fontWeight:"bold"}}>{mn.name}</span>
                        <span style={{fontSize:"9px",color:dim,marginLeft:"6px"}}>rank {mn.rank} · {mn.type}</span>
                        <br/><span style={{fontSize:"10px",color:on?"#9ab890":dim}}>{mn.desc}</span>
                      </span>
                    </label>;
                  })}
                </div>

                {/* Cross-training maneuvers from other methods */}
                <Lbl dim={dim}>CROSS-TRAINING <span style={{color:dim,fontWeight:"normal"}}>(other methods — limited slots)</span></Lbl>
                {otherMethods.map(function(method){
                  var mlist=MONK_MANEUVERS[method]||[];
                  return <div key={method} style={{marginBottom:"10px"}}>
                    <div style={{fontSize:"10px",color:"#6080a0",fontFamily:"monospace",letterSpacing:"1px",marginBottom:"4px"}}>{method.toUpperCase()}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
                      {mlist.map(function(mn){
                        var on=monkManeuvers.indexOf(mn.name)>=0;
                        return <label key={mn.name} style={{display:"flex",alignItems:"flex-start",gap:"6px",padding:"4px 7px",cursor:"pointer",fontSize:"10px",background:on?"#1a2a18":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:dim}}>
                          <input type="checkbox" checked={on} onChange={function(){toggleMan(mn.name);}} style={{accentColor:g,marginTop:"1px",flexShrink:0}} />
                          <span>
                            <span style={{color:on?g:dim}}>{mn.name}</span>
                            <span style={{fontSize:"9px",color:dim}}> (r{mn.rank})</span>
                            <br/><span style={{fontSize:"9px",color:on?"#9ab890":dim}}>{mn.desc}</span>
                          </span>
                        </label>;
                      })}
                    </div>
                  </div>;
                })}
              </div>;
            })()}

            {/* ── WIZARD SUB-TAB ── */}
            {activeSub==='wizard'&&<div>
              {isWizard&&edition==='1e'&&<div style={{padding:"30px",textAlign:"center",color:dim,fontSize:"12px",marginTop:"8px"}}>
                CP customization is a 2E mechanic.<br/>Switch to AD&D 2E on the Stats tab to use it.
              </div>}
              {!isWizard&&<div style={{padding:"10px 14px",marginBottom:"12px",background:"#1a1010",border:"1px solid #4a2a2a",borderRadius:"6px",fontSize:"11px",color:"#c08080"}}>
                ⚠ Viewing only — select Mage or Illusionist on the Stats tab to make this section editable.
              </div>}
              {/* All wizard CP content — hidden in 1E mode */}
              {(!isWizard||edition!=='1e')&&<div>
                {/* Specialist Presets */}
                <div style={{marginBottom:"12px",display:"flex",flexWrap:"wrap",alignItems:"center",gap:"6px"}}>
                  <span style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>PRESETS:</span>
                  {Object.keys(WIZARD_PRESETS).map(function(n){return <button key={n} disabled={!isWizard} onClick={function(){loadWizardPreset(n);}} style={{padding:"4px 12px",borderRadius:"4px",cursor:isWizard?"pointer":"not-allowed",fontSize:"10px",fontFamily:"monospace",background:"#1a1a28",color:isWizard?g:dim,border:"1px solid "+brd,opacity:isWizard?1:0.5}}>{n} ({WIZARD_PRESETS[n].cost})</button>;})}
                </div>
                {wizardPresetNote&&<div style={{padding:"8px 12px",marginBottom:"10px",background:"#0e1a0e",border:"1px solid #2a4a2a",borderRadius:"6px",fontSize:"11px",color:"#90b890",fontFamily:"monospace",lineHeight:"1.6",whiteSpace:"pre-wrap"}}>{wizardPresetNote}</div>}
                {/* Schools */}
                <div style={{marginBottom:"12px"}}>
                  <Lbl dim={dim}>SCHOOLS OF MAGIC <span style={{color:g}}>(5 CP each, Universal is free)</span></Lbl>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"6px"}}>
                    {WIZARD_SCHOOLS.map(function(sch){var on=cpSchools.indexOf(sch)>=0;
                      return <label key={sch} style={{display:"flex",alignItems:"center",gap:"8px",padding:"6px 10px",cursor:isWizard?"pointer":"default",fontSize:"12px",background:on?"#1a2a18":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?g:dim,opacity:isWizard?1:0.5}}>
                        <input type="checkbox" checked={on} disabled={!isWizard} onChange={function(){toggle(cpSchools,setCpSchools,sch);}} style={{accentColor:g}} />
                        <span style={{flex:1}}>{sch}</span><span style={{fontFamily:"monospace",fontSize:"10px",color:"#e08060"}}>5 CP</span>
                      </label>;
                    })}
                  </div>
                  <div style={{marginTop:"4px",fontSize:"10px",color:dim,fontFamily:"monospace"}}>{cpSchools.length} schools = {cpSchools.length*5} CP (+ Universal free)</div>
                </div>
                {/* Wizard Abilities */}
                <div style={{marginBottom:"12px"}}>
                  <Lbl dim={dim}>ABILITIES</Lbl>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
                    {Object.keys(WIZARD_ABILITIES).map(function(a){var d=WIZARD_ABILITIES[a];var on=cpAbil.indexOf(a)>=0;
                      var isClassFeat=d.c===0;
                      return <label key={a} style={{display:"flex",alignItems:"center",gap:"6px",padding:"3px 8px",cursor:isWizard?"pointer":"default",fontSize:"11px",background:on?(isClassFeat?"#1a1e28":"#1a2a18"):surf,border:"1px solid "+(on?(isClassFeat?"#3a4a68":"#3a5a3a"):brd),borderRadius:"4px",color:on?txt:dim,opacity:isWizard?1:0.5}}>
                        <input type="checkbox" checked={on} disabled={!isWizard} onChange={function(){toggle(cpAbil,setCpAbil,a);}} style={{accentColor:isClassFeat?"#6080c0":g}} />
                        <span style={{flex:1}}>{a}</span>
                        <span style={{fontFamily:"monospace",fontSize:"10px",color:isClassFeat?"#6080c0":"#e08060"}}>{isClassFeat?"—":d.c}</span>
                      </label>;
                    })}
                  </div>
                </div>
                {/* Wizard Limitations */}
                <div style={{marginBottom:"12px"}}>
                  <Lbl dim={dim}>LIMITATIONS <span style={{color:"#60a060"}}>(refund CP)</span></Lbl>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
                    {Object.keys(WIZARD_LIMITS).map(function(l){var d=WIZARD_LIMITS[l];var on=cpLim.indexOf(l)>=0;
                      return <label key={l} style={{display:"flex",alignItems:"center",gap:"6px",padding:"3px 8px",cursor:isWizard?"pointer":"default",fontSize:"11px",background:on?"#1a2818":surf,border:"1px solid "+(on?"#3a5a3a":brd),borderRadius:"4px",color:on?txt:dim,opacity:isWizard?1:0.5}}>
                        <input type="checkbox" checked={on} disabled={!isWizard} onChange={function(){toggle(cpLim,setCpLim,l);}} style={{accentColor:"#60a060"}} />
                        <span style={{flex:1}}>{l}</span>
                        <span style={{fontFamily:"monospace",fontSize:"10px",color:"#60a060"}}>-{d.r}</span>
                      </label>;
                    })}
                  </div>
                </div>
              </div>}
            </div>}

            {/* No CP class */}
            {!(isPriest||isWizard||isMonk)&&activeSub!=='monk'&&<div style={{padding:"30px",textAlign:"center",color:dim,fontSize:"12px",marginTop:"8px"}}>
              Select Cleric, Druid, Mage, Illusionist, or Monk to enable CP editing for this character.
            </div>}
          </div>;
        })()}

        {/* ═══ SHEET TAB ═══ */}
        {tab==="sheet"&&<div style={{fontFamily:"'Courier New',monospace",fontSize:"11px",lineHeight:"1.5",color:"#ddd",background:"#0c0c14",border:"1px solid "+brd,borderRadius:"8px",padding:"20px",maxWidth:"700px",margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:"16px",marginBottom:"16px"}}>
            {charPortrait&&<img src={charPortrait} alt="portrait" style={{width:"80px",height:"80px",objectFit:"cover",borderRadius:"4px",border:"1px solid "+brd,flexShrink:0}} />}
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:"18px",color:g,fontWeight:"bold",fontVariant:"small-caps",letterSpacing:"3px"}}>Advanced Dungeons & Dragons</div>
              <div style={{fontSize:"12px",color:dim,letterSpacing:"2px"}}>{edition==='1e'?'1st Edition':'2nd Edition'} — Player Character Record</div>
            </div>
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
          {(function(){
            var DMG_TYPE_COLORS_S={Fire:"#e06030",Cold:"#80d0f0",Electricity:"#f0e040",Acid:"#80d040",Poison:"#90d060",Radiant:"#f0e0a0",Necrotic:"#a060d0",Sonic:"#80c0e0",Force:"#a080e0",Psychic:"#e080e0",Holy:"#f0f0a0",Unholy:"#806090",Magic:"#c090e0",Piercing:"#c0c0c0",Slashing:"#d0a0a0",Bludgeoning:"#c0a080"};
            var itemAbilities=equipped.map(function(g){
              var e=g.effects||{};
              var breath=null;
              if(e.bonusDmgDice&&e.bonusDmgType&&e.specialDmgMode==="breath")
                breath={text:e.bonusDmgDice+"d"+e.bonusDmgDie+" "+e.bonusDmgType,dmgType:e.bonusDmgType};
              else if(e.breathDice&&e.breathType)
                breath={text:e.breathDice+"d"+e.breathDie+" "+e.breathType,dmgType:e.breathType};
              return breath?{name:g.name,breath:breath}:null;
            }).filter(Boolean);
            if(!itemAbilities.length)return null;
            return <div style={{background:"#100a00",border:"1px solid #3a2a10",borderRadius:"4px",padding:"10px",marginBottom:"12px"}}>
              <div style={{color:"#e0a040",fontWeight:"bold",marginBottom:"6px",letterSpacing:"1px",fontSize:"11px"}}>** ITEM ABILITIES **</div>
              {itemAbilities.map(function(ab,i){
                var c=DMG_TYPE_COLORS_S[ab.breath.dmgType]||"#e08040";
                return <div key={i} style={{color:"#c8a870",fontSize:"10px",marginBottom:"4px",lineHeight:"1.4"}}>
                  <span style={{color:"#f0d090",fontWeight:"bold"}}>{ab.name}</span>: Breath Weapon — <span style={{color:c,fontWeight:"bold"}}>{ab.breath.text}</span>
                </div>;
              })}
            </div>;
          })()}
          <div style={{marginBottom:"12px"}}>
            <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>ABILITY SCORES</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"4px",textAlign:"center"}}>
              {["Str","Dex","Con","Int","Wis","Cha"].map(function(a){
                var adj=raceData.adj[a]||0;
                var base=stats[a]+adj;
                var gearBonus=a==="Str"?gearStr:(adjStats[a]-base);
                var spellBonus=a==="Str"?(buffStr+buffStrLvl):0;
                var isBuffed=gearBonus>0||spellBonus>0;
                var disp=a==="Str"?effStr:adjStats[a];
                var pct=a==="Str"?(effStrPct>0?effStrPct:(exStr?strPct:0)):0;
                return <div key={a} style={{border:"1px solid "+(isBuffed?"#2a4a2a":"#333"),padding:"4px",borderRadius:"4px",background:isBuffed?"#0a150a":"transparent"}}>
                  <div style={{fontSize:"9px",color:dim}}>{a.toUpperCase()}</div>
                  <div style={{fontSize:"16px",color:isBuffed?"#7db87d":g,fontWeight:"bold"}}>
                    {a==="Str"&&pct>0?"18/"+(pct===100?"00":String(pct).padStart(2,"0")):disp}
                  </div>
                  {gearBonus>0&&spellBonus>0&&<div style={{fontSize:"8px",color:"#7db87d"}}>+{gearBonus} gear +{spellBonus} spell</div>}
                  {gearBonus>0&&spellBonus===0&&<div style={{fontSize:"8px",color:"#7db87d"}}>+{gearBonus} gear</div>}
                  {spellBonus>0&&gearBonus===0&&<div style={{fontSize:"8px",color:"#7db87d"}}>+{spellBonus} spell</div>}
                  {adj!==0&&<div style={{fontSize:"8px",color:dim}}>({stats[a]}{adj>0?"+":""}{adj})</div>}
                </div>;
              })}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
            <div>
              <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>COMBAT</div>
              <Row l={cpThac0Type!==classData.thac0?"THAC0*":"THAC0"} v={thac0} l2={isMonk?"Wpn Dmg Bonus":"Str Hit"} v2={isMonk?("+"+Math.floor(level/2)):(effStrB.hit>=0?"+":"")+effStrB.hit} />
              <Row l={(buffAC>0||cpAcBonus>0||isMonk)?"AC*":"AC"} v={effAC} l2={isMonk?"Natural AC":"Dex Def"} v2={isMonk?(monkCaps?monkCaps.ac:10):((dexAC(adjStats.Dex)>=0?"+":"")+dexAC(adjStats.Dex))} />
              <Row l="HP" v={hp} l2={isMonk?"Style Dmg":"Dmg Adj"} v2={isMonk?("1d"+(monkStyleForm&&monkStyleMethod?dmgModToDie((STYLE_FORM_DATA[monkStyleForm]||{dmgMod:4}).dmgMod+(STYLE_METHOD_DATA[monkStyleMethod]||{dmgMod:4}).dmgMod):6)):((effStrB.dmg>=0?"+":"")+effStrB.dmg)} />
              <Row l="Hit Dice" v={"d"+effectiveHD+(isMonk?" (2d4 L1)":"")} l2="Con Adj" v2={(conB>=0?"+":"")+conB+"/die"} />
              <Row l="Movement" v={isMonk?(monkCaps?monkCaps.move:15)+'"':12} l2={isMonk?"Style AC":"Dex Missile"} v2={isMonk?(monkStyleForm&&monkStyleMethod?String(10-((STYLE_FORM_DATA[monkStyleForm]||{acMod:1}).acMod+(STYLE_METHOD_DATA[monkStyleMethod]||{acMod:1}).acMod)):"—"):((dexMis>=0?"+":"")+dexMis)} />
              <Row l={"WP ("+wpUsed+"/"+totalWP+")"} v={totalWP-wpUsed===0?"Full":"+"+(totalWP-wpUsed)} l2={"NWP ("+nwpUsed+"/"+totalNWP+")"} v2={totalNWP-nwpUsed===0?"Full":"+"+(totalNWP-nwpUsed)} />
            </div>
            <div>
              <div style={{color:g,fontWeight:"bold",marginBottom:"4px"}}>SAVING THROWS</div>
              {Object.keys(effSaves).map(function(s){var n={Para:"Para/Poison/Death",Rod:"Rod/Staff/Wand",Pet:"Petrify/Poly",Breath:"Breath Weapon",Spell:cpSaveMod>0&&isWizard?"Spell*":"Spell"};
                var wisAdj2=(s==="Spell"||s==="Rod")?wisAdj:0;
                var sv=effSaves[s]-wisAdj2;
                var note=wisAdj2!==0?(wisAdj2>0?"\u2665 ":"\u2666 "):"";
                return <Row key={s} l={note+(n[s]||s)} v={sv} l2="" v2="" />;
              })}
            </div>
          </div>
          {isMonk&&monkCaps&&<div style={{marginBottom:"12px",border:"1px solid #1a3a5a",borderRadius:"6px",padding:"10px 12px"}}>
            <div style={{color:"#80a0e0",fontWeight:"bold",marginBottom:"6px",fontSize:"11px",letterSpacing:"1px"}}>MONK ABILITIES <span style={{color:dim,fontWeight:"normal",letterSpacing:"0"}}>(Level {level} — {MONK_LEVEL_TITLES[level]||""})</span></div>
            {/* Style info */}
            {monkStyleName&&<div style={{marginBottom:"6px",fontSize:"11px",color:txt}}>
              Style: <span style={{color:g,fontWeight:"bold"}}>{monkStyleName}</span>
              <span style={{color:dim,marginLeft:"8px"}}>{monkStyleForm} · {monkStyleMethod}</span>
              <span style={{color:"#80a0e0",marginLeft:"8px"}}>AC {monkStyleAC!==null?monkStyleAC:"—"} · {(STYLE_FORM_DATA[monkStyleForm]||{atMod:0}).atMod+(STYLE_METHOD_DATA[monkStyleMethod]||{atMod:0}).atMod} AT/round · 1d{monkStyleMethod&&monkStyleForm?dmgModToDie((STYLE_FORM_DATA[monkStyleForm]||{dmgMod:4}).dmgMod+(STYLE_METHOD_DATA[monkStyleMethod]||{dmgMod:4}).dmgMod):6} dmg · {(STYLE_METHOD_DATA[monkStyleMethod]||{bodyPart:"Hand"}).bodyPart}</span>
            </div>}
            {monkCaps.addAT&&<div style={{fontSize:"11px",color:"#e08060",marginBottom:"3px"}}>Extra attacks: <span style={{fontWeight:"bold"}}>{monkCaps.addAT}</span>{monkCaps.addDmg&&<span style={{marginLeft:"10px"}}>Bonus damage: <span style={{fontWeight:"bold"}}>{monkCaps.addDmg} per attack</span></span>}</div>}
            <div style={{fontSize:"11px",color:dim,marginBottom:"3px"}}>Movement: <span style={{color:txt}}>{monkCaps.move}"</span>{"  "}Ki uses/day: <span style={{color:txt}}>{level}</span>{"  "}Surprise: <span style={{color:txt}}>{typeof monkCaps.surprise==="number"?monkCaps.surprise+"%":"Normal"}</span></div>
            {/* Thief skills */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"3px",marginTop:"6px",marginBottom:"6px",fontSize:"10px",fontFamily:"monospace"}}>
              {[["Open Locks",monkCaps.openLock],["Find/Remove Traps",monkCaps.findTrap],["Move Silently",monkCaps.moveSilent],["Hide in Shadows",monkCaps.hideShadow],["Hear Noise",monkCaps.hearNoise],["Climb Walls",monkCaps.climbWall]].map(function(r){
                return <div key={r[0]} style={{background:"#0a0a18",border:"1px solid #1a2a4a",borderRadius:"3px",padding:"3px 6px"}}>
                  <div style={{color:dim,fontSize:"9px"}}>{r[0]}</div>
                  <div style={{color:"#80a0e0",fontWeight:"bold"}}>{r[1]}%</div>
                </div>;
              })}
            </div>
            {/* Level abilities */}
            {MONK_LEVEL_ABILITIES[level]&&<div style={{fontSize:"10px",color:"#c0d8f0",borderTop:"1px solid #1a3a5a",paddingTop:"6px",lineHeight:"1.5"}}>{MONK_LEVEL_ABILITIES[level]}</div>}
            {/* Innate abilities from lower levels */}
            {level>=3&&<div style={{fontSize:"10px",color:dim,marginTop:"4px",lineHeight:"1.6"}}>
              {level>=3&&<div>• Speak with Animals</div>}
              {level>=4&&<div>• Fall 20ft safely (near wall) · ESP only {Math.max(2,30-2*(level-4))}% vs. you</div>}
              {level>=5&&<div>• Immune to disease · Immune to haste/slow</div>}
              {level>=6&&<div>• Fall 30ft safely (4ft from wall) · Cataleptic state ({level*2} turns)</div>}
              {level>=7&&<div>• Self-heal {1+(level-7)+2}–{4+(level-7)+1} HP/day</div>}
              {level>=8&&<div>• Speak with Plants · Followers (monastery required)</div>}
              {level>=9&&<div>• Ki improved: ½ dmg on failed save · Charm {Math.max(5,50-5*(level-9))}% effective</div>}
              {level>=10&&<div>• Telepathy/mind blast: defend as INT 18</div>}
              {level>=11&&<div>• Immune to poison</div>}
              {level>=12&&<div>• Immune to geas/quest</div>}
              {level>=13&&<div>• Free special maneuver of choice</div>}
            </div>}
            {/* Selected maneuvers */}
            {(monkManeuvers.length>0||(isMonk))&&<div style={{marginTop:"6px"}}>
              <div style={{fontSize:"9px",color:dim,letterSpacing:"1px",marginBottom:"3px"}}>KNOWN MANEUVERS</div>
              <div style={{fontSize:"10px",color:"#80a0e0"}}>★ Missile Deflection (free){monkManeuvers.length>0&&" · "+monkManeuvers.join(" · ")}</div>
            </div>}
          </div>}
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
          {isPriest&&cpSpellPowers.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:"#80c0e0",fontWeight:"bold",marginBottom:"6px",fontSize:"11px",letterSpacing:"1px"}}>SPELL-LIKE GRANTED POWERS</div>
            {cpSpellPowers.map(function(pw,i){
              var freqLabel=pw.freq==='week'?'1/week':pw.freq==='continuous'?'continuous':pw.freq+'/day';
              var cost=spellPowerCost(pw.level,pw.spellType,pw.freq);
              return <div key={pw.id||i} style={{display:"flex",gap:"10px",fontSize:"11px",marginBottom:"4px",alignItems:"baseline"}}>
                <span style={{color:"#80c0e0",fontFamily:"monospace",minWidth:"16px"}}>✦</span>
                <span style={{color:txt,fontWeight:"bold"}}>{pw.spell}</span>
                <span style={{color:dim,fontFamily:"monospace",fontSize:"10px"}}>L{pw.level} {pw.spellType}</span>
                <span style={{color:"#c0d0a0",fontFamily:"monospace",fontSize:"10px"}}>{freqLabel}</span>
                <span style={{color:"#806040",fontFamily:"monospace",fontSize:"10px",marginLeft:"auto"}}>{cost} CP</span>
              </div>;
            })}
            {cpSpellPowers.length>maxGrantedPowers&&<div style={{fontSize:"10px",color:"#e06060",fontFamily:"monospace",marginTop:"4px"}}>⚠ Exceeds limit ({cpSpellPowers.length}/{maxGrantedPowers} at level {level})</div>}
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
            {cpAbil.map(function(a,i){
              var desc=CP_ABILITY_DESC[a]||a;
              // Priest computed overrides
              if(a==='AC improvement') desc='AC Improvement: +'+(cpAcBonus||0)+' AC (level '+level+'; +1 per 4 levels)';
              if(a==='Lay on hands') desc='Lay on Hands: heal '+(level*2)+' HP/day ('+level+' × 2)';
              if(a==='Hit point bonus (d10)') desc='Hit Point Bonus: d10 HD (base d'+classData.hd+') — re-roll HP to apply';
              if(a==='Warrior Con bonus') desc='Warrior Con Bonus: CON adj '+(conB>=0?'+':'')+conB+'/die (warrior table, CON '+adjStats.Con+')';
              if(a==='Warrior Con + Str') desc='Warrior CON + STR: CON adj '+(conB>=0?'+':'')+conB+'/die; exceptional STR access unlocked';
              // Shared computed overrides
              if(a==='Combat bonus (warrior THAC0)') desc='Combat Bonus: THAC0 as Warrior — currently '+thac0+' at level '+level;
              if(a==='Combat bonus (rogue THAC0)')  desc='Combat Bonus: THAC0 as Rogue — currently '+thac0+' at level '+level;
              if(a==='Combat bonus (priest THAC0)') desc='Combat Bonus: THAC0 as Priest — currently '+thac0+' at level '+level;
              if(a==='Constitution adjustment (warrior)') desc='Warrior CON Bonus: CON adj '+(conB>=0?'+':'')+conB+'/die (warrior table, CON '+adjStats.Con+')';
              if(a==='Weapon specialization') desc='Weapon Specialization: may specialize in one weapon (+1 attack, +2 damage)';
              // Wizard level/stat-dependent descriptions
              if(isWizard){
                if(a==='Improved Hit Die (d8)')      desc='Improved Hit Die: d8 HD (base d'+classData.hd+') — re-roll HP to apply';
                if(a==='Improved Hit Die (d6)')      desc='Improved Hit Die: d6 HD (base d'+classData.hd+') — re-roll HP to apply';
                if(a==='Enhanced casting level')     desc='Enhanced Casting Level: chosen school spells cast as if 1d4 levels higher (once/day; currently level '+level+')';
                if(a==='Dispel (1/day)')             desc='Dispel Magic: 1×/day, range 30 yards, 50%±5%/level diff, as '+level+'th-level caster';
                if(a==='Dispel (3/day)')             desc='Dispel Magic: 3×/day, range 30 yards, 50%±5%/level diff, as '+level+'th-level caster';
                if(a==='Detect magic')               desc='Detect Magic: '+(Math.floor(level/2)||1)+'×/day (1 per 2 levels), as the spell';
                if(a==='Read magic')                 desc='Read Magic: '+(Math.floor(level/2)||1)+'×/day (1 per 2 levels), as the spell';
                if(a==='Thief ability (1)')          desc='Thief Ability: one thief skill at base % for level '+level+' (Thief Average Ability Table)';
                if(a==='Thief ability (2)')          desc='Thief Ability: two thief skills at base % for level '+level;
                if(a==='School knowledge +1/-1 saves') desc='School Knowledge: +1 to your saves vs chosen school; −1 to opponent saves vs your spells (Spell save now '+effSaves.Spell+')';
                if(a==='School knowledge +2/-2 saves') desc='School Knowledge: +2 to your saves vs chosen school; −2 to opponent saves vs your spells (Spell save now '+effSaves.Spell+')';
                if(a==='Bonus spells (one school)')  desc='Bonus Spells: +1 memorization slot per level from one school (applied to all levels)';
                if(a==='Bonus spells (any school)')  desc='Bonus Spells: +1 memorization slot per level, any spell';
                if(a==='Priestly wizard (minor sphere)') desc='Priestly Wizard: minor sphere access — cast as half level ('+Math.floor(level/2)+'); count against max spells/level';
                if(a==='Priestly wizard (major sphere)') desc='Priestly Wizard: major sphere access — full casting at level '+level+'; count against max spells/level';
                if(a==='Followers')                  desc='Followers: at 8th level, 20–200 0-level men-at-arms + 1d6 apprentice wizards (1st–3rd level)';
                if(a==='Immunity (one spell)')       desc='Immunity: complete immunity to one spell (cost: 10 + 1 per spell level)';
                // Wizard static descriptions
                if(a==='Armor: Padded')              desc='Armor Access: padded armor (no shields ever)';
                if(a==='Armor: Leather/studded')     desc='Armor Access: leather, studded leather, hide, or brigandine (no shields)';
                if(a==='Armor: Any')                 desc='Armor Access: any armor while casting (no shields)';
                if(a==='Weapon: Cleric/thief list')  desc='Weapon Access: cleric and thief weapon lists';
                if(a==='Weapon: Any')                desc='Weapon Access: any weapon (non-proficiency penalties still apply)';
                if(a==='Auto spell acquisition (one school)') desc='Auto Acquisition: add one spell/level from chosen school without learn check';
                if(a==='Auto spell acquisition (any school)') desc='Auto Acquisition: add any one accessible spell per level without learn check';
                if(a==='Learning bonus +15% (one school)') desc='Learning Bonus: +15% to learn spells from chosen school';
                if(a==='Learning bonus +25% (one school)') desc='Learning Bonus: +25% to learn spells from chosen school';
                if(a==='Learning bonus +15% (all schools)') desc='Learning Bonus: +15% to learn spells from all schools';
                if(a==='Learning bonus +25% (all schools)') desc='Learning Bonus: +25% to learn spells from all schools';
                if(a==='Research bonus (one school)') desc='Research Bonus: treated as 1 level lower for one school\'s spell research';
                if(a==='Research bonus (all)')       desc='Research Bonus: treated as 1 level lower for all spell research';
                if(a==='No components (one school)') desc='No Components: cast chosen school spells without material components';
                if(a==='No components (any school)') desc='No Components: cast any spell without material components';
                if(a==='Range increase +25% (one school)') desc='Range Increase: +25% to range of chosen school spells';
                if(a==='Range increase +50% (one school)') desc='Range Increase: +50% to range of chosen school spells';
                if(a==='Range increase +25% (all schools)') desc='Range Increase: +25% to range of all ranged spells';
                if(a==='Range increase +50% (all schools)') desc='Range Increase: +50% to range of all ranged spells';
                if(a==='Casting time reduction (one school)') desc='Casting Time Reduction: −1 segment for chosen school spells';
                if(a==='Casting time reduction (all)') desc='Casting Time Reduction: −1 segment for all spells';
                if(a==='Extended duration (one school)') desc='Extended Duration: +1 time unit per 2 levels for chosen school spells';
                if(a==='Extended duration (all)')    desc='Extended Duration: +1 time unit per 2 levels for all spells';
                if(a==='Proficiency group crossovers') desc='Proficiency Crossovers: may select proficiencies from any character or general group';
                if(a==='Persistent spell effect')    desc='Persistent Spell Effect: one known spell maintained as long as concentrated (cost: 15 + 2/spell level)';
                // Specialist class features (innate, not CP purchased)
                if(a==='Illusionist: +2 saves vs illusions (8th)')       desc='Specialist: +2 to all saves vs illusion spells cast by non-illusionists (8th level and above)';
                if(a==='Illusionist: Dispel illusion 3/day (11th)')      desc='Specialist: dispel phantasmal force / improved phantasmal force 3×/day (11th level); range 30 yds, 50% ±5%/level diff';
                if(a==='Abjurer: +2 saves vs para/poison/death (8th)')   desc='Specialist: +2 to saves vs paralyzation, poison, and death magic (8th level and above)';
                if(a==='Abjurer: AC bonus +1 (11th)')                    desc='Specialist: AC improves by 1 (11th level and above; add to your AC on the Stats tab)';
                if(a==='Abjurer: Immune to hold spells (14th)')          desc='Specialist: complete immunity to all hold spells (hold person, hold monster, etc.) at 14th level';
                if(a==='Conjurer: No components for conjurations (11th)') desc='Specialist: all conjuration/summoning spells may be cast without material components (11th level and above)';
                if(a==='Conjurer: Dispel summoned creatures 3/day (14th)') desc='Specialist: dispel summoned/conjured creatures 3×/day — up to 10 HD total, max 5 HD per creature (14th level)';
                if(a==='Diviner: Find traps 3/day (11th)')               desc='Specialist: find traps 3×/day as the 2nd-level priest spell — point and concentrate 1 round (11th level)';
                if(a==='Diviner: Immune to scrying spells (14th)')       desc='Specialist: immune to all scrying spells (ESP, know alignment, clairaudience, clairvoyance, etc.) at 14th level';
                if(a==='Enchanter: Free action 1/day (11th)')            desc='Specialist: free action 1×/day — no components, CT 1, targets self or touch, lasts 1 hour (11th level)';
                if(a==='Enchanter: Immune to charm spells (14th)')       desc='Specialist: immune to all charm spells (charm person, charm monster, etc.) at 14th level';
                if(a==='Evoker: +2 saves vs invocation/evocation (8th)') desc='Specialist: +2 to all saves vs invocation/evocation spells and related magic items (8th level and above)';
                if(a==='Evoker: +3 saves vs invocation/evocation (11th)') desc='Specialist: save bonus vs invocation/evocation increases to +3 (11th level and above)';
                if(a==='Evoker: Immune to one invocation spell ≤3rd level (14th)') desc='Specialist: choose one invocation/evocation spell of 3rd level or lower — immune to it at 14th level';
                if(a==='Necromancer: +2 saves vs necromancy (8th)')      desc='Specialist: +2 to all saves vs necromancy spells (8th level and above)';
                if(a==='Necromancer: Speak with dead at will (11th)')    desc='Specialist: speak with dead at will — no verbal or material components; concentrate 1 round, converse 1 turn, ask 4 questions (11th level)';
                if(a==='Necromancer: +2 saves vs undead attacks (14th)') desc='Specialist: +2 saves vs undead special attacks (strength drain, paralyzation); may save vs death magic at −4 for normally-unsaveable attacks (14th level)';
                if(a==='Transmuter: +2 saves vs alteration (8th)')       desc='Specialist: +2 to all saves vs alteration spells and related magic items (8th level and above)';
                if(a==='Transmuter: +3 saves vs alteration (11th)')      desc='Specialist: save bonus vs alteration increases to +3 (11th level and above)';
              }
              return <div key={i} style={{fontSize:"11px",color:"#bbb",marginBottom:"3px",lineHeight:"1.5"}}>• {desc}</div>;
            })}
          </div>}
          {cpLim.length>0&&<div style={{marginBottom:"12px"}}>
            <div style={{color:"#e08080",fontWeight:"bold",marginBottom:"4px"}}>LIMITATIONS</div>
            {cpLim.map(function(l,i){
              var desc=l;
              // Priest computed overrides
              if(l==='Reduced HP (d6)') desc='Reduced HP: d6 Hit Die (was d'+classData.hd+') — re-roll HP to apply';
              if(l==='Reduced HP (d4)') desc='Reduced HP: d4 Hit Die (was d'+classData.hd+') — re-roll HP to apply';
              // Wizard limitation descriptions
              if(isWizard){
                if(l==='Reduced HP (d3)')            desc='Reduced HP: d3 Hit Die + max +1 CON bonus/die (currently d'+effectiveHD+')';
                if(l==='Learning penalty -15%')      desc='Learning Penalty: −15% to learn spells of all schools except one';
                if(l==='Learning penalty -25%')      desc='Learning Penalty: −25% to learn spells of all schools except one';
                if(l==='Reduced spell knowledge')    desc='Reduced Spell Knowledge: max spells/level = half normal (min 10 if INT allows all)';
                if(l==='Reduced spell progression')  desc='Reduced Spell Progression: memorize one fewer spell per level (1st-level = 0 spells!)';
                if(l==='Slower casting time +3')     desc='Slower Casting: +3 segments to all casting times';
                if(l==='Slower casting time (next unit)') desc='Slower Casting: all times advance to next unit (segments→round, rounds→turns, turns→hours)';
                if(l==='Talisman required')          desc='Talisman Required: must have talisman on person to cast; rebuild takes 1d4 weeks if destroyed';
                if(l==='Hazardous spells')           desc='Hazardous Spells: save vs. breath/spell per cast or 1 dmg/spell level; 1% cumulative insanity risk per level cast';
                if(l==='Awkward casting')            desc='Awkward Casting: must cast obviously — can\'t cast from ambush, stealthily, or quietly';
                if(l==='Difficult memorization')     desc='Difficult Memorization: must memorize in specific location using materials worth 250 gp/level';
                if(l==='Behavior/taboo')             desc='Behavior/Taboo: must observe code; violation loses all memorized spells until back in compliance';
                if(l==='Supernatural constraint')    desc='Supernatural Constraint: DM-assigned supernatural vulnerability (5–15 pts depending on impact)';
                if(l==='Limited items: Potions/scrolls') desc='Limited Items: may not use potions or scrolls (magic items restricted)';
                if(l==='Limited items: Rings')          desc='Limited Items: may not use rings (magic items restricted)';
                if(l==='Limited items: Rods/staves/wands') desc='Limited Items: may not use rods, staves, or wands (magic items restricted)';
                if(l==='Limited items: Misc/weapons/armor') desc='Limited Items: may not use miscellaneous magic weapons or armor (magic items restricted)';
                if(l==='Weapons: No proficiency')    desc='Weapons: may never have proficiency in any weapon';
                if(l==='Weapons: Cannot wield')      desc='Weapons: may never attempt to wield a weapon at all — violation ends spell use for 1 month';
                if(l==='Environmental condition (specific)') desc='Environmental Condition: can only cast in rare, specific circumstances';
                if(l==='Environmental condition (common)')   desc='Environmental Condition: can only cast in common situations';
                if(l==='Environmental condition (everyday)') desc='Environmental Condition: major everyday restriction on casting';
              }
              return <div key={i} style={{fontSize:"11px",color:"#c08080",marginBottom:"3px",lineHeight:"1.5"}}>• {desc}</div>;
            })}
          </div>}
          {isWizard&&cpSchools.length>0&&<div style={{fontSize:"11px",color:"#80a0c0",fontFamily:"monospace",marginBottom:"10px"}}>
            <span style={{color:dim,letterSpacing:"1px"}}>SCHOOLS: </span>
            {cpSchools.join(' · ')}
            {cpPriestlyWizard&&<span style={{color:"#a0c080"}}>{' '}(+priestly {cpPriestlyWizard})</span>}
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
            {/* Sub-tab bar */}
            <div style={{display:"flex",gap:"6px",marginBottom:"16px",borderBottom:"1px solid "+brd,paddingBottom:"10px"}}>
              {[["tome","📖 Tome of Magic"],["custom","⚔ Custom Magic Items"]].map(function(pair){
                return <button key={pair[0]} onClick={function(){setItemsSub(pair[0]);}}
                  style={{padding:"5px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",letterSpacing:"1px",background:itemsSub===pair[0]?"#1a1a30":"transparent",color:itemsSub===pair[0]?g:dim,border:itemsSub===pair[0]?"1px solid #2a2a4a":"1px solid transparent"}}>
                  {pair[1]}
                </button>;
              })}
            </div>

            {itemsSub==="tome"&&<div>
            <Lbl dim={dim}>MAGIC ITEM COMPENDIUM <span style={{color:"#666",fontWeight:"normal"}}>({allItems.length} items)</span></Lbl>
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
                var catToType={"Ring":"Ring","Jewelry":"Amulet/Necklace","Rod/Staff/Wand":"Wand/Staff/Rod","Wearable":"Cloak/Robe"};
                var alreadyAdded=gearItems.some(function(g){return g.name===it.name;});
                return <div key={it.name} style={{background:surf,border:"1px solid "+(isOpen?"#2a2a4a":brd),borderRadius:"6px",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",padding:"8px 12px",userSelect:"none"}}>
                    <div onClick={function(){setExpandedItem(isOpen?null:it.name);}} style={{flex:1,minWidth:0,cursor:"pointer"}}>
                      <span style={{fontSize:"13px",color:it.cursed?"#e08080":txt,fontWeight:"bold"}}>{it.name}</span>
                      {it.cursed&&<span style={{fontSize:"9px",color:"#e06060",fontFamily:"monospace",marginLeft:"6px",background:"#2a0a0a",border:"1px solid #4a2020",borderRadius:"3px",padding:"1px 4px"}}>CURSED</span>}
                    </div>
                    <div style={{display:"flex",gap:"6px",alignItems:"center",flexShrink:0}}>
                      <span style={{fontSize:"9px",color:catColor,fontFamily:"monospace",background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"2px 6px"}}>{it.category}</span>
                      {usableBadge&&<span style={{fontSize:"9px",color:"#c9a84c",fontFamily:"monospace",background:"#0a0a12",border:"1px solid #2a2010",borderRadius:"3px",padding:"2px 6px"}}>{usableBadge}</span>}
                      {it.xpValue>0&&<span style={{fontSize:"9px",color:"#888",fontFamily:"monospace"}}>{it.xpValue.toLocaleString()} XP</span>}
                      <button onClick={function(e){e.stopPropagation();
                        if(alreadyAdded){setItemsSub("custom");return;}
                        var newItem=Object.assign({},BLANK_GEAR,{id:Date.now()+"_"+Math.random().toString(36).slice(2),name:it.name,type:catToType[it.category]||"Misc",desc:it.description||"",effects:Object.assign({},BLANK_GEAR.effects),equipped:true});
                        setGearItems(function(prev){return prev.concat([newItem]);});
                        if(!inventory.some(function(x){return x.name===it.name;})){
                          setInventory(function(inv){return inv.concat([{id:Date.now()+"_"+Math.random().toString(36).slice(2),name:it.name,qty:1,weight:0,cost:0,notes:(it.category||"Magic Item")}]);});
                        }
                        setItemsSub("custom");
                      }} style={{padding:"3px 8px",background:alreadyAdded?"#1a2a1a":"#1a1a28",color:alreadyAdded?"#7db87d":"#80a0e0",border:"1px solid "+(alreadyAdded?"#3a5a3a":"#2a2a5a"),borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px",flexShrink:0}}>
                        {alreadyAdded?"In Gear":"+ Equip"}
                      </button>
                      <span onClick={function(){setExpandedItem(isOpen?null:it.name);}} style={{color:isOpen?g:dim,fontSize:"12px",marginLeft:"4px",cursor:"pointer"}}>{isOpen?"▼":"▶"}</span>
                    </div>
                  </div>
                  {isOpen&&<div style={{padding:"8px 14px 12px 14px",borderTop:"1px solid "+brd,fontSize:"12px",color:"#b8b4a8",lineHeight:"1.7",fontStyle:"italic"}}>
                    {it.description||<span style={{color:dim,fontFamily:"monospace",fontStyle:"normal"}}>No description available.</span>}
                  </div>}
                </div>;
              })}
            </div>
            </div>}

            {itemsSub==="custom"&&(function(){
          var GEAR_TYPES=["Ring","Amulet/Necklace","Bracers/Gloves","Helm/Hat","Cloak/Robe","Belt","Boots","Weapon","Armor","Armor/Shield","Wand/Staff/Rod","Magic Talisman","Misc"];
          var EFFECT_LABELS={str:"STR",dex:"DEX",con:"CON",int:"INT",wis:"WIS",cha:"CHA",ac:"AC bonus",thac0:"THAC0 bonus",dmg:"Damage bonus",saves:"Saves bonus",hp:"HP bonus"};
          var EFFECT_COLORS={str:"#e08080",dex:"#80e0a0",con:"#e0a060",int:"#80c0e0",wis:"#c080e0",cha:"#e0c080",ac:"#80a0e0",thac0:"#e0c080",dmg:"#e09060",saves:"#a0e0a0",hp:"#e08080"};
          var DMG_TYPES=["Fire","Cold","Electricity","Acid","Poison","Radiant","Necrotic","Sonic","Force","Psychic","Holy","Unholy","Magic","Piercing","Slashing","Bludgeoning"];
          var DMG_TYPE_COLORS={Fire:"#e06030",Cold:"#80d0f0",Electricity:"#f0e040",Acid:"#80d040",Poison:"#90d060",Radiant:"#f0e0a0",Necrotic:"#a060d0",Sonic:"#80c0e0",Force:"#a080e0",Psychic:"#e080e0",Holy:"#f0f0a0",Unholy:"#806090",Magic:"#c090e0",Piercing:"#c0c0c0",Slashing:"#d0a0a0",Bludgeoning:"#c0a080"};
          var DIE_SIZES=[4,6,8,10,12,20];
          function specialDmgLabel(it){
            var e=it.effects||{};
            if(e.bonusDmgDice&&e.bonusDmgType)
              return {isBreath:e.specialDmgMode==="breath",text:e.bonusDmgDice+"d"+e.bonusDmgDie+" "+e.bonusDmgType,dmgType:e.bonusDmgType};
            if(e.breathDice&&e.breathType) // legacy
              return {isBreath:true,text:e.breathDice+"d"+e.breathDie+" "+e.breathType,dmgType:e.breathType};
            return null;
          }

          function saveGear(form){
            var item=Object.assign({},form,{id:form.id||Date.now()+"_"+Math.random().toString(36).slice(2),equipped:form.equipped||false});
            setGearItems(function(prev){var idx=prev.findIndex(function(g){return g.id===item.id;});return idx>=0?prev.map(function(g,i){return i===idx?item:g;}):prev.concat([item]);});
            if(supabase)saveToLibrary(item,"player");
            setGearForm(null);setGearAiPrompt("");setGearAiError("");
          }
          function deleteGear(id){setGearItems(function(prev){return prev.filter(function(g){return g.id!==id;})});}
          function toggleEquip(id){setGearItems(function(prev){return prev.map(function(g){
            if(g.id!==id)return g;
            var nowEquipped=!g.equipped;
            if(nowEquipped&&!inventory.some(function(x){return x.name===g.name;})){
              setInventory(function(inv){return inv.concat([{id:Date.now()+"_"+Math.random().toString(36).slice(2),name:g.name,qty:1,weight:0,cost:0,notes:(g.source?g.source+" — ":"")+(g.type||"Magic Item")}]);});
            }
            return Object.assign({},g,{equipped:nowEquipped});
          });});}
          function setActiveTier(id,idx){setGearItems(function(prev){return prev.map(function(g){return g.id===id?Object.assign({},g,{activeTier:idx}):g;});});}
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
            // When changing an existing password, verify the current one first
            if(dmPwHashExists){
              if(!dmPwCurrent.trim()){setDmPwError("Enter your current password.");return;}
              setDmPwLoading(true);setDmPwError("");
              try{
                var stored=await getDmPasswordHash();
                if(await sha256hex(dmPwCurrent)!==stored){setDmPwError("Current password is incorrect.");setDmPwLoading(false);return;}
              }catch(e){setDmPwError(e.message);setDmPwLoading(false);return;}
            }else{
              setDmPwLoading(true);setDmPwError("");
            }
            try{
              var hash=await sha256hex(dmPwInput);
              await setDmPasswordHash(hash);
              setDmPwHashExists(true);setDmPwVerified(true);
              setDmPwInput("");setDmPwConfirm("");setDmPwCurrent("");setDmChangePw(false);
              setGearLibStatus("DM password set \u2713");
              setTimeout(function(){setGearLibStatus("");},3000);
              await loadDmItems();
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
            var rawEff=libItem.effects||{};
            var isTiered=!!(rawEff._tiered);
            var cleanEff=Object.assign({},BLANK_GEAR.effects,rawEff);
            delete cleanEff._tiered;delete cleanEff._tiers;delete cleanEff._activeTier;
            var gear=Object.assign({},BLANK_GEAR,{
              id:Date.now()+"_"+Math.random().toString(36).slice(2),
              name:libItem.name,
              type:libItem.type||"Misc",
              source:libItem.source||"",
              desc:libItem.description||"",
              tiered:isTiered,
              tiers:isTiered?(rawEff._tiers||[]):[],
              activeTier:rawEff._activeTier||0,
              effects:cleanEff,
              equipped:false,
            });
            setGearItems(function(prev){return prev.concat([gear]);});
            setGearLibStatus("Added: "+libItem.name);
            setTimeout(function(){setGearLibStatus("");},2000);
          }
          // ── Spell Effect Override helpers ──────────────────────────────────
          async function applySpellOverride(){
            if(!spellEdSel||!spellEdForm)return;
            setSpellEdStatus("Saving…");
            var ok=await saveSpellOverride(spellEdSel,spellEdForm);
            if(ok){
              var fresh=await getSpellOverrides();
              setSpellOverrides(fresh);
              setSpellEdStatus("Saved ✓");
            }else{
              setSpellEdStatus("Error saving — check Supabase");
            }
            setTimeout(function(){setSpellEdStatus("");},3000);
          }
          async function resetSpellOverrideToDefault(){
            if(!spellEdSel)return;
            setSpellEdStatus("Resetting…");
            var ok=await deleteSpellOverride(spellEdSel);
            if(ok){
              var fresh=await getSpellOverrides();
              setSpellOverrides(fresh);
              // reload form to show default
              setSpellEdForm(Object.assign({acBonus:0,acBase:"",strBonus:0,strLvlBonus:false,thac0Bonus:0,saveBonus:0,dmgBonus:0,desc:""},BUFF_SPELLS[spellEdSel]||{}));
              setSpellEdStatus("Reset to default ✓");
            }else{
              setSpellEdStatus("Error resetting");
            }
            setTimeout(function(){setSpellEdStatus("");},3000);
          }
          function selectSpellForEdit(name){
            setSpellEdSel(name);
            var base=BUFF_SPELLS[name]||{};
            var over=spellOverrides[name]||{};
            var merged=Object.assign({acBonus:0,acBase:"",strBonus:0,strLvlBonus:false,thac0Bonus:0,saveBonus:0,dmgBonus:0,desc:""},base,over);
            // acBase: store as "" when null/undefined so input shows blank
            if(merged.acBase==null) merged.acBase="";
            setSpellEdForm(merged);
            setSpellEdStatus("");
          }

          function importAllFromLibrary(){
            if(!gearLibItems.length)return;
            var newGear=gearLibItems.map(function(libItem,i){
              return Object.assign({},BLANK_GEAR,{
                id:Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2),
                name:libItem.name,
                type:libItem.type||"Misc",
                desc:libItem.description||"",
                effects:Object.assign({},BLANK_GEAR.effects,libItem.effects||{}),
                equipped:false,
              });
            });
            setGearItems(function(prev){return prev.concat(newGear);});
            setGearLibStatus("Added "+newGear.length+" items \u2713");
            setTimeout(function(){setGearLibStatus("");},2500);
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
                            <input type="password" value={dmPwCurrent} onChange={function(e){setDmPwCurrent(e.target.value);setDmPwError("");}}
                              placeholder="Current password" style={{padding:"3px 7px",background:"#0a0a12",border:"1px solid "+(dmPwError?"#e08080":brd),borderRadius:"3px",color:txt,fontSize:"11px",fontFamily:"monospace",width:"130px"}}/>
                            <input type="password" value={dmPwInput} onChange={function(e){setDmPwInput(e.target.value);setDmPwError("");}}
                              placeholder="New password" style={{padding:"3px 7px",background:"#0a0a12",border:"1px solid "+(dmPwError?"#e08080":brd),borderRadius:"3px",color:txt,fontSize:"11px",fontFamily:"monospace",width:"120px"}}/>
                            <input type="password" value={dmPwConfirm} onChange={function(e){setDmPwConfirm(e.target.value);setDmPwError("");}}
                              placeholder="Confirm" style={{padding:"3px 7px",background:"#0a0a12",border:"1px solid "+(dmPwError?"#e08080":brd),borderRadius:"3px",color:txt,fontSize:"11px",fontFamily:"monospace",width:"100px"}}/>
                            <button onClick={saveDmPassword} disabled={dmPwLoading}
                              style={{padding:"3px 8px",background:"#1e1a2e",color:"#e0c080",border:"1px solid #4a3a0a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Save</button>
                            <button onClick={function(){setDmChangePw(false);setDmPwInput("");setDmPwConfirm("");setDmPwCurrent("");setDmPwError("");}}
                              style={{padding:"3px 6px",background:"transparent",color:dim,border:"none",cursor:"pointer",fontFamily:"monospace",fontSize:"12px"}}>✕</button>
                            {dmPwError&&<div style={{fontSize:"10px",color:"#e08080",fontFamily:"monospace",width:"100%"}}>{dmPwError}</div>}
                          </div>
                      }
                    </div>}
                    {/* DM sub-tabs: Gear | Spell Effects */}
                    {gearLibRole==="dm"&&dmPwVerified&&<div style={{display:"flex",gap:"6px",marginBottom:"10px",borderBottom:"1px solid "+brd,paddingBottom:"8px"}}>
                      {[["gear","Gear Library"],["spells","Spell Effects"]].map(function(pair){
                        var on=spellEdSubTab===pair[0];
                        return <button key={pair[0]} onClick={function(){setSpellEdSubTab(pair[0]);}} style={{padding:"3px 12px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:on?"#1a1a2a":"transparent",color:on?"#e0c080":dim,border:on?"1px solid #3a3a4a":"1px solid transparent"}}>{pair[1]}</button>;
                      })}
                    </div>}

                    {/* Spell Effects Editor */}
                    {gearLibRole==="dm"&&dmPwVerified&&spellEdSubTab==="spells"&&(function(){
                      var allNames=Object.keys(effectiveBuff).sort();
                      var filtered=spellEdSearch.trim()?allNames.filter(function(n){return n.toLowerCase().indexOf(spellEdSearch.toLowerCase())>=0;}):allNames;
                      return <div style={{display:"flex",flexDirection:"column",gap:"8px",height:"100%"}}>
                        <input value={spellEdSearch} onChange={function(e){setSpellEdSearch(e.target.value);setSpellEdSel(null);setSpellEdForm(null);}}
                          placeholder="Search spell name…"
                          style={{padding:"6px 10px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"11px",fontFamily:"monospace",outline:"none"}}/>
                        <div style={{display:"flex",gap:"8px",flex:1,minHeight:0}}>
                          {/* Spell list */}
                          <div style={{flex:"0 0 180px",overflowY:"auto",border:"1px solid "+brd,borderRadius:"4px",background:"#08080f"}}>
                            {filtered.map(function(name){
                              var isOverridden=!!spellOverrides[name];
                              var isSelected=spellEdSel===name;
                              return <div key={name} onClick={function(){selectSpellForEdit(name);}}
                                style={{padding:"5px 8px",cursor:"pointer",fontSize:"10px",fontFamily:"monospace",color:isSelected?"#e0c080":isOverridden?"#c0d890":dim,background:isSelected?"#1a1a2a":"transparent",borderBottom:"1px solid #0f0f18",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</span>
                                {isOverridden&&<span style={{color:"#c0d890",fontSize:"8px",marginLeft:"4px",flexShrink:0}}>✎</span>}
                              </div>;
                            })}
                          </div>
                          {/* Edit form */}
                          {spellEdForm&&<div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:"6px"}}>
                            <div style={{color:txt,fontSize:"11px",fontWeight:"bold",fontFamily:"monospace"}}>{spellEdSel}</div>
                            {spellOverrides[spellEdSel]&&<div style={{fontSize:"9px",color:"#c0d890",fontFamily:"monospace"}}>✎ Overridden</div>}
                            {[
                              ["acBonus","AC Bonus (flat, 2=+2 AC)","number"],
                              ["acBase","Base AC (set, e.g. 8 = Bracers AC 8; blank=none)","text"],
                              ["strBonus","STR Bonus (flat)","number"],
                              ["thac0Bonus","THAC0 Bonus","number"],
                              ["saveBonus","Save Bonus","number"],
                              ["dmgBonus","Damage Bonus","number"],
                            ].map(function(row){
                              var fld=row[0],lbl=row[1],typ=row[2];
                              return <div key={fld} style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                                <label style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>{lbl}</label>
                                <input type={typ} value={spellEdForm[fld]===null||spellEdForm[fld]===undefined?"":spellEdForm[fld]}
                                  onChange={function(e){var v=e.target.value;setSpellEdForm(function(f){return Object.assign({},f,{[fld]:v===""?"":typ==="number"?parseInt(v)||0:v});});}}
                                  style={{padding:"3px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"3px",color:txt,fontSize:"11px",fontFamily:"monospace",outline:"none",width:"100%",boxSizing:"border-box"}}/>
                              </div>;
                            })}
                            <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                              <label style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>STR Level Bonus (+1 STR/level)</label>
                              <button onClick={function(){setSpellEdForm(function(f){return Object.assign({},f,{strLvlBonus:!f.strLvlBonus});});}}
                                style={{padding:"3px 10px",background:spellEdForm.strLvlBonus?"#1a2a1a":"transparent",color:spellEdForm.strLvlBonus?"#7db87d":dim,border:"1px solid "+(spellEdForm.strLvlBonus?"#2a4a2a":brd),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px",alignSelf:"flex-start"}}>
                                {spellEdForm.strLvlBonus?"ON":"OFF"}
                              </button>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                              <label style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>Description (shown in spell buff tooltip)</label>
                              <textarea value={spellEdForm.desc||""} onChange={function(e){setSpellEdForm(function(f){return Object.assign({},f,{desc:e.target.value});});}}
                                rows={3} style={{padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"3px",color:txt,fontSize:"10px",fontFamily:"monospace",outline:"none",resize:"vertical",boxSizing:"border-box",width:"100%"}}/>
                            </div>
                            {spellEdStatus&&<div style={{fontSize:"10px",fontFamily:"monospace",color:spellEdStatus.startsWith("Error")?"#e08080":"#7db87d"}}>{spellEdStatus}</div>}
                            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                              <button onClick={applySpellOverride} style={{padding:"4px 12px",background:"#1e1a2e",color:"#e0c080",border:"1px solid #4a3a0a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Save Override</button>
                              {spellOverrides[spellEdSel]&&<button onClick={resetSpellOverrideToDefault} style={{padding:"4px 10px",background:"transparent",color:"#e08080",border:"1px solid #3a1a1a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Reset to Default</button>}
                            </div>
                          </div>}
                          {!spellEdForm&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:dim,fontSize:"11px",fontFamily:"monospace"}}>Select a spell to edit</div>}
                        </div>
                      </div>;
                    })()}

                    {/* Gear list */}
                    {(gearLibRole!=="dm"||!dmPwVerified||spellEdSubTab==="gear")&&<>
                    {gearLibLoading&&<div style={{padding:"20px",textAlign:"center",color:dim,fontFamily:"monospace",fontSize:"12px"}}>Loading…</div>}
                    {!gearLibLoading&&gearLibItems.length===0&&<div style={{padding:"20px",textAlign:"center",color:dim,fontSize:"12px"}}>No items in this library yet.</div>}
                    {!gearLibLoading&&gearLibItems.length>0&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:"8px"}}>
                      <button onClick={importAllFromLibrary}
                        style={{padding:"3px 12px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>
                        ↙ Load All ({gearLibItems.length})
                      </button>
                    </div>}
                    {!gearLibLoading&&gearLibItems.map(function(it){
                      var bonuses=Object.keys(EFFECT_LABELS).filter(function(k){return it.effects&&it.effects[k];});
                      var libSdl=specialDmgLabel(it);
                      return <div key={it.id} style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"10px 12px",marginBottom:"6px",display:"flex",alignItems:"flex-start",gap:"10px"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{fontSize:"13px",color:txt,fontWeight:"bold"}}>{it.name}</span>
                            <span style={{fontSize:"9px",color:dim,fontFamily:"monospace",background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{it.type}</span>
                            <span style={{fontSize:"9px",color:it.role==="dm"?"#e0c080":"#80c0e0",fontFamily:"monospace"}}>{it.role==="dm"?"DM":"Player"}</span>
                          </div>
                          {(bonuses.length>0||libSdl)&&<div style={{display:"flex",flexWrap:"wrap",gap:"3px",marginTop:"4px"}}>
                            {bonuses.map(function(k){var v=it.effects[k];return <span key={k} style={{fontSize:"9px",fontFamily:"monospace",color:EFFECT_COLORS[k],background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{EFFECT_LABELS[k]}: {v>0?"+":""}{v}</span>;})}
                            {libSdl&&<span style={{fontSize:"9px",fontFamily:"monospace",color:DMG_TYPE_COLORS[libSdl.dmgType]||(libSdl.isBreath?"#e08040":"#e0c080"),background:libSdl.isBreath?"#100a0a":"#0a0a12",border:"1px solid "+(libSdl.isBreath?"#2e1a10":"#2a1a0a"),borderRadius:"3px",padding:"1px 5px"}}>{libSdl.isBreath?"Breath: ":"+"}{libSdl.text}</span>}
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
                    </>}
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
                  if(k==='ac'){
                    var bonusAC=equippedGear.reduce(function(s,g){var ae=getActiveEffects(g);return(ae.acMode||'bonus')==='base'?s:s+(ae.ac||0);},0);
                    var baseItems=equippedGear.filter(function(g){var ae=getActiveEffects(g);return(ae.acMode||'bonus')==='base'&&ae.ac>0;});
                    var bestBase=baseItems.length?Math.min.apply(null,baseItems.map(function(g){return getActiveEffects(g).ac;})):null;
                    if(!bonusAC&&bestBase===null)return null;
                    return <span key={k} style={{fontSize:"11px",fontFamily:"monospace",color:EFFECT_COLORS[k],background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"2px 8px"}}>{bestBase!==null?"Base AC: "+bestBase:null}{bestBase!==null&&bonusAC?" · ":null}{bonusAC?"AC bonus: +"+bonusAC:null}</span>;
                  }
                  var total=equippedGear.reduce(function(s,g){return s+(getActiveEffects(g)[k]||0);},0);
                  if(!total)return null;
                  return <span key={k} style={{fontSize:"11px",fontFamily:"monospace",color:EFFECT_COLORS[k],background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"2px 8px"}}>{EFFECT_LABELS[k]}: {total>0?"+":""}{total}</span>;
                })}
                {equippedGear.map(function(g){var sdl=specialDmgLabel(g);return sdl?<span key={g.id} style={{fontSize:"11px",fontFamily:"monospace",color:DMG_TYPE_COLORS[sdl.dmgType]||(sdl.isBreath?"#e08040":"#e0c080"),background:sdl.isBreath?"#100a0a":"#0a0a12",border:"1px solid "+(sdl.isBreath?"#2e1a10":"#2a1a0a"),borderRadius:"3px",padding:"2px 8px"}}>{sdl.isBreath?"Breath: ":"+"}{sdl.text}</span>:null;})}
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
                <Lbl dim={dim}>Source Book</Lbl>
                <input value={gearForm.source||""} onChange={function(e){setGearForm(function(f){return Object.assign({},f,{source:e.target.value});});}}
                  placeholder="e.g. Tome of Magic p.42, DMG, UA"
                  style={Object.assign({},is(brd,txt),{width:"100%"})} />
              </div>
              <div style={{marginBottom:"10px"}}>
                <Lbl dim={dim}>Description / Notes</Lbl>
                <textarea value={gearForm.desc} onChange={function(e){setGearForm(function(f){return Object.assign({},f,{desc:e.target.value});});}}
                  placeholder="Flavor text or special powers…" rows={2}
                  style={{width:"100%",padding:"6px 8px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical"}} />
              </div>
              {/* Tiered item toggle */}
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px",padding:"8px 12px",background:"#0a0a14",border:"1px solid #1e1e30",borderRadius:"6px"}}>
                <input type="checkbox" id="tieredToggle" checked={!!gearForm.tiered}
                  onChange={function(e){var on=e.target.checked;setGearForm(function(f){return Object.assign({},f,{tiered:on,tiers:on&&(!f.tiers||!f.tiers.length)?[{label:"+1",effects:Object.assign({},BLANK_GEAR.effects)}]:f.tiers});});}}
                  style={{width:"16px",height:"16px",cursor:"pointer",accentColor:"#80a0e0"}} />
                <label htmlFor="tieredToggle" style={{fontSize:"11px",color:"#80a0e0",fontFamily:"monospace",cursor:"pointer",userSelect:"none"}}>
                  Tiered Item <span style={{color:dim,fontWeight:"normal"}}>(e.g. Ring of Protection — different +1/+2/+3 variants)</span>
                </label>
              </div>

              {!gearForm.tiered&&<div>
              <Lbl dim={dim}>Stat & Combat Effects <span style={{color:"#555",fontWeight:"normal"}}>(positive = better; AC +2 lowers your AC by 2; THAC0 +2 lowers it by 2)</span></Lbl>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:"6px",marginBottom:"10px"}}>
                {Object.keys(EFFECT_LABELS).map(function(k){return <div key={k} style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                  <label style={{fontSize:"10px",color:EFFECT_COLORS[k],fontFamily:"monospace"}}>{EFFECT_LABELS[k]}</label>
                  <input type="number" value={gearForm.effects[k]||""}
                    onChange={function(e){setEffect(k,e.target.value);}}
                    style={{padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"13px",fontFamily:"monospace",outline:"none",textAlign:"center",width:"100%"}} />
                </div>;})}
              </div>
              {!!gearForm.effects.ac&&<div style={{marginBottom:"10px",padding:"8px 12px",background:"#0a0a10",border:"1px solid #1e1e30",borderRadius:"6px"}}>
                <div style={{fontSize:"10px",color:"#80a0e0",fontFamily:"monospace",marginBottom:"6px"}}>AC Mode: <span style={{color:dim,fontWeight:"normal"}}>how this item's AC value applies</span></div>
                <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                  {[["bonus","+ Bonus (Ring, Cloak, etc.)"],["base","Sets Base AC (Armor, Bracers of Defense)"]].map(function(m){var on=(gearForm.effects.acMode||"bonus")===m[0];return <button key={m[0]} onClick={function(){setGearForm(function(f){return Object.assign({},f,{effects:Object.assign({},f.effects,{acMode:m[0]})});});}} style={{padding:"3px 10px",background:on?"#1a1a3a":"transparent",color:on?"#80a0e0":dim,border:"1px solid "+(on?"#3a3a6a":brd),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>{m[1]}</button>;})}
                </div>
              </div>}
              {!!gearForm.effects.saves&&(function(){
                var SLABELS={Para:"Para/Poison",Rod:"Rod/Staff/Wand",Pet:"Petrify/Poly",Breath:"Breath Weapon",Spell:"Spell"};
                var types=gearForm.effects.savesTypes||[];
                function toggleType(k){setGearForm(function(f){var cur=f.effects.savesTypes||[];var next=cur.includes(k)?cur.filter(function(x){return x!==k;}):[...cur,k];return Object.assign({},f,{effects:Object.assign({},f.effects,{savesTypes:next})});});}
                return <div style={{marginBottom:"14px",padding:"8px 12px",background:"#0a0a10",border:"1px solid #1e2e1e",borderRadius:"6px"}}>
                  <div style={{fontSize:"10px",color:"#a0c0a0",fontFamily:"monospace",marginBottom:"6px"}}>Saves bonus applies to: <span style={{color:dim}}>{types.length===0?"All saving throws":types.map(function(k){return SLABELS[k];}).join(", ")}</span></div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                    {['Para','Rod','Pet','Breath','Spell'].map(function(k){var on=types.includes(k);return <button key={k} onClick={function(){toggleType(k);}} style={{padding:"3px 9px",background:on?"#1a3a1a":"transparent",color:on?"#7db87d":dim,border:"1px solid "+(on?"#3a6a3a":brd),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>{SLABELS[k]}</button>;})}
                    {types.length>0&&<button onClick={function(){setGearForm(function(f){return Object.assign({},f,{effects:Object.assign({},f.effects,{savesTypes:[]})});});}} style={{padding:"3px 9px",background:"transparent",color:"#a06060",border:"1px solid #4a2020",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Clear → All</button>}
                  </div>
                </div>;
              })()}
              </div>}

              {gearForm.tiered&&<div style={{marginBottom:"14px"}}>
                <Lbl dim={dim}>Tiers <span style={{color:"#555",fontWeight:"normal"}}>(each tier is a selectable variant with its own bonuses)</span></Lbl>
                <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"8px"}}>
                  {(gearForm.tiers||[]).map(function(tier,ti){
                    function setTierEffect(k,val){setGearForm(function(f){var newTiers=f.tiers.map(function(t,i){return i===ti?Object.assign({},t,{effects:Object.assign({},t.effects,{[k]:parseInt(val)||0})}):t;});return Object.assign({},f,{tiers:newTiers});});}
                    function toggleTierSaveType(k){setGearForm(function(f){var newTiers=f.tiers.map(function(t,i){if(i!==ti)return t;var cur=t.effects.savesTypes||[];var next=cur.includes(k)?cur.filter(function(x){return x!==k;}):[...cur,k];return Object.assign({},t,{effects:Object.assign({},t.effects,{savesTypes:next})});});return Object.assign({},f,{tiers:newTiers});});}
                    var SLABELS={Para:"Para/Poison",Rod:"Rod/Staff/Wand",Pet:"Petrify/Poly",Breath:"Breath Weapon",Spell:"Spell"};
                    var tierSaveTypes=tier.effects.savesTypes||[];
                    return <div key={ti} style={{background:"#0a0a14",border:"1px solid #2a2a4a",borderRadius:"6px",padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px"}}>
                        <label style={{fontSize:"10px",color:dim,fontFamily:"monospace",flexShrink:0}}>Label:</label>
                        <input value={tier.label||""} onChange={function(e){var v=e.target.value;setGearForm(function(f){var newTiers=f.tiers.map(function(t,i){return i===ti?Object.assign({},t,{label:v}):t;});return Object.assign({},f,{tiers:newTiers});});}}
                          placeholder="+1, +2 5' radius…"
                          style={Object.assign({},is(brd,txt),{flex:1,padding:"3px 7px",fontSize:"11px"})} />
                        <button onClick={function(){setGearForm(function(f){return Object.assign({},f,{tiers:f.tiers.filter(function(_,i){return i!==ti;})});});}}
                          style={{padding:"2px 8px",background:"transparent",color:"#e08080",border:"1px solid #4a2020",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>✕</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:"4px",marginBottom:"6px"}}>
                        {Object.keys(EFFECT_LABELS).map(function(k){return <div key={k} style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                          <label style={{fontSize:"9px",color:EFFECT_COLORS[k],fontFamily:"monospace"}}>{EFFECT_LABELS[k]}</label>
                          <input type="number" value={tier.effects[k]||""}
                            onChange={function(e){setTierEffect(k,e.target.value);}}
                            style={{padding:"3px 4px",background:"#060610",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",textAlign:"center",width:"100%"}} />
                        </div>;})}
                      </div>
                      {!!tier.effects.saves&&<div style={{padding:"6px 8px",background:"#06060e",border:"1px solid #1a2a1a",borderRadius:"4px"}}>
                        <div style={{fontSize:"9px",color:"#a0c0a0",fontFamily:"monospace",marginBottom:"4px"}}>Saves applies to: <span style={{color:dim}}>{tierSaveTypes.length===0?"All":tierSaveTypes.map(function(k){return SLABELS[k];}).join(", ")}</span></div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                          {['Para','Rod','Pet','Breath','Spell'].map(function(k){var on=tierSaveTypes.includes(k);return <button key={k} onClick={function(){toggleTierSaveType(k);}} style={{padding:"2px 6px",background:on?"#1a3a1a":"transparent",color:on?"#7db87d":dim,border:"1px solid "+(on?"#3a6a3a":brd),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>{SLABELS[k]}</button>;})}
                          {tierSaveTypes.length>0&&<button onClick={function(){setGearForm(function(f){var newTiers=f.tiers.map(function(t,i){return i===ti?Object.assign({},t,{effects:Object.assign({},t.effects,{savesTypes:[]})}):t;});return Object.assign({},f,{tiers:newTiers});});}} style={{padding:"2px 6px",background:"transparent",color:"#a06060",border:"1px solid #4a2020",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>Clear → All</button>}
                        </div>
                      </div>}
                      {!!tier.effects.ac&&<div style={{marginTop:"6px",padding:"6px 8px",background:"#06060e",border:"1px solid #1a1a2a",borderRadius:"4px"}}>
                        <div style={{fontSize:"9px",color:"#80a0e0",fontFamily:"monospace",marginBottom:"4px"}}>AC Mode:</div>
                        <div style={{display:"flex",gap:"3px",flexWrap:"wrap"}}>
                          {[["bonus","+ Bonus"],["base","Sets Base AC"]].map(function(m){var on=(tier.effects.acMode||"bonus")===m[0];return <button key={m[0]} onClick={function(){setGearForm(function(f){var newTiers=f.tiers.map(function(t,i){return i===ti?Object.assign({},t,{effects:Object.assign({},t.effects,{acMode:m[0]})}):t;});return Object.assign({},f,{tiers:newTiers});});}} style={{padding:"2px 7px",background:on?"#1a1a3a":"transparent",color:on?"#80a0e0":dim,border:"1px solid "+(on?"#3a3a6a":brd),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px"}}>{m[1]}</button>;})}
                        </div>
                      </div>}
                    </div>;
                  })}
                </div>
                <button onClick={function(){setGearForm(function(f){return Object.assign({},f,{tiers:(f.tiers||[]).concat([{label:"",effects:Object.assign({},BLANK_GEAR.effects)}])});});}}
                  style={{padding:"5px 14px",background:"transparent",color:"#80a0e0",border:"1px solid #2a2a5a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>+ Add Tier</button>
              </div>}
              {/* Special damage (unified bonus / breath weapon) — non-tiered only */}
              {!gearForm.tiered&&(function(){
                var mode=gearForm.effects.specialDmgMode||"bonus";
                var isBreath=mode==="breath";
                var bg=isBreath?"#100a0a":"#0a0a14";
                var bd=isBreath?"#2e1a10":"#1e1e30";
                var previewColor=gearForm.effects.bonusDmgType?(DMG_TYPE_COLORS[gearForm.effects.bonusDmgType]||g):g;
                return <div style={{marginBottom:"14px"}}>
                  <Lbl dim={dim}>Special Damage <span style={{color:"#555",fontWeight:"normal"}}>(optional)</span></Lbl>
                  <div style={{border:"1px solid "+bd,borderRadius:"6px",overflow:"hidden"}}>
                    <div style={{display:"flex",borderBottom:"1px solid "+bd}}>
                      {[["bonus","+ Bonus Damage","Adds to weapon/attack damage rolls"],["breath","Breath Weapon","Standalone attack (e.g. Talisman of the Chimera)"]].map(function(m){
                        var active=mode===m[0];
                        return <button key={m[0]} title={m[2]} onClick={function(){setGearForm(function(f){return Object.assign({},f,{effects:Object.assign({},f.effects,{specialDmgMode:m[0]})});});}}
                          style={{flex:1,padding:"6px 10px",background:active?(isBreath?"#1e0a0a":"#0a0a1e"):"transparent",color:active?(isBreath?"#e08040":"#80a0e0"):dim,border:"none",borderRight:m[0]==="bonus"?"1px solid "+bd:"none",cursor:"pointer",fontFamily:"monospace",fontSize:"10px",fontWeight:active?"bold":"normal"}}>
                          {m[1]}
                        </button>;
                      })}
                    </div>
                    <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap",padding:"10px 12px",background:bg}}>
                      <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                        <label style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>Dice</label>
                        <input type="number" min={0} max={30} value={gearForm.effects.bonusDmgDice||""}
                          onChange={function(e){setEffect("bonusDmgDice",Math.max(0,parseInt(e.target.value)||0));}}
                          style={{width:"60px",padding:"4px 6px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"13px",fontFamily:"monospace",outline:"none",textAlign:"center"}} />
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                        <label style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>Die</label>
                        <select value={gearForm.effects.bonusDmgDie||(isBreath?8:6)} onChange={function(e){setEffect("bonusDmgDie",parseInt(e.target.value));}}
                          style={Object.assign({},ss(brd,txt),{width:"70px"})}>
                          {DIE_SIZES.map(function(d){return <option key={d} value={d}>d{d}</option>;})}
                        </select>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:"3px",flex:1,minWidth:"140px"}}>
                        <label style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>Damage Type</label>
                        <select value={gearForm.effects.bonusDmgType||""} onChange={function(e){var v=e.target.value;setGearForm(function(f){return Object.assign({},f,{effects:Object.assign({},f.effects,{bonusDmgType:v})});});}}
                          style={Object.assign({},ss(brd,txt),{width:"100%",color:gearForm.effects.bonusDmgType?DMG_TYPE_COLORS[gearForm.effects.bonusDmgType]||txt:dim})}>
                          <option value="">— None —</option>
                          {DMG_TYPES.map(function(t){return <option key={t} value={t}>{t}</option>;})}
                        </select>
                      </div>
                      {gearForm.effects.bonusDmgDice>0&&gearForm.effects.bonusDmgType&&
                        <div style={{fontSize:"12px",fontFamily:"monospace",color:previewColor,alignSelf:"flex-end",paddingBottom:"4px"}}>
                          {isBreath?"":"+"}
                          {gearForm.effects.bonusDmgDice}d{gearForm.effects.bonusDmgDie||6} {gearForm.effects.bonusDmgType}
                          {isBreath&&" (breath)"}
                        </div>}
                    </div>
                  </div>
                </div>;
              })()}
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
                var ae=getActiveEffects(it);
                var bonusParts=Object.keys(EFFECT_LABELS).filter(function(k){return ae[k];}).map(function(k){var v=ae[k];var isBase=k==='ac'&&(ae.acMode||'bonus')==='base';var lbl=isBase?'Base AC':EFFECT_LABELS[k];var sign=isBase?'':(v>0?'+':'');return <span key={k} style={{fontSize:"9px",fontFamily:"monospace",color:EFFECT_COLORS[k],background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{lbl}: {sign}{v}</span>;});
                var sdl=specialDmgLabel(it);if(sdl)bonusParts.push(<span key="sdmg" style={{fontSize:"9px",fontFamily:"monospace",color:DMG_TYPE_COLORS[sdl.dmgType]||(sdl.isBreath?"#e08040":"#e0c080"),background:sdl.isBreath?"#100a0a":"#0a0a12",border:"1px solid "+(sdl.isBreath?"#2e1a10":"#2a1a0a"),borderRadius:"3px",padding:"1px 5px"}}>{sdl.isBreath?"Breath: ":"+"}{sdl.text}</span>);
                return <div key={it.id} style={{background:surf,border:"1px solid "+(it.equipped?"#2a4a2a":brd),borderRadius:"6px",padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:"10px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"13px",color:it.equipped?g:txt,fontWeight:"bold"}}>{it.name}</span>
                      <span style={{fontSize:"9px",color:dim,fontFamily:"monospace",background:"#0a0a12",border:"1px solid #1a1a2a",borderRadius:"3px",padding:"1px 5px"}}>{it.type}</span>
                      {it.equipped&&<span style={{fontSize:"9px",color:"#7db87d",fontFamily:"monospace"}}>✓ equipped</span>}
                    </div>
                    {it.tiered&&it.tiers&&it.tiers.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"3px",marginTop:"5px",alignItems:"center"}}>
                      <span style={{fontSize:"9px",color:dim,fontFamily:"monospace",marginRight:"2px"}}>Tier:</span>
                      {it.tiers.map(function(tier,ti){var active=(it.activeTier||0)===ti;return <button key={ti} onClick={function(){setActiveTier(it.id,ti);}}
                        style={{padding:"2px 7px",background:active?"#1a2a3a":"transparent",color:active?"#80c0e0":dim,border:"1px solid "+(active?"#2a4a6a":brd),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"9px",fontWeight:active?"bold":"normal"}}>{tier.label||("T"+(ti+1))}</button>;})}
                    </div>}
                    {bonusParts.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"4px",marginTop:"5px"}}>{bonusParts}</div>}
                    {it.source&&<div style={{fontSize:"9px",color:"#607060",fontFamily:"monospace",marginTop:"3px"}}>Source: {it.source}</div>}
                    {it.desc&&<div style={{fontSize:"11px",color:dim,marginTop:"4px",fontStyle:"italic"}}>{it.desc}</div>}
                  </div>
                  <div style={{display:"flex",gap:"4px",flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <button onClick={function(){toggleEquip(it.id);}}
                      style={{padding:"4px 10px",background:it.equipped?"#1a2a1a":"#1a1a28",color:it.equipped?"#7db87d":"#80a0e0",border:"1px solid "+(it.equipped?"#3a5a3a":"#2a2a5a"),borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>
                      {it.equipped?"Unequip":"Equip"}
                    </button>
                    <button onClick={function(){setGearForm(Object.assign({},it,{effects:Object.assign({},it.effects)}));}}
                      style={{padding:"4px 8px",background:"transparent",color:dim,border:"1px solid "+brd,borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Edit</button>
                    {supabase&&<button onClick={function(){saveToLibrary(it,"dm");}}
                      title="Save to DM Library"
                      style={{padding:"4px 8px",background:"#1a1510",color:"#e0c080",border:"1px solid #3a3010",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>☁ DM</button>}
                    <button onClick={function(){deleteGear(it.id);}}
                      style={{padding:"4px 8px",background:"transparent",color:"#a06060",border:"1px solid #4a2a2a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>✕</button>
                  </div>
                </div>;
              })}
            </div>
          </div>;
        })()}
          </div>;
        })()}

        {/* ═══ NOTES TAB ═══ */}
        {tab==="notes"&&<div>
          <Lbl dim={dim}>CHARACTER NOTES</Lbl>
          <textarea value={notes} onChange={function(e){setNotes(e.target.value);}} placeholder="Equipment, backstory, kit abilities, wild shape forms…"
            style={{width:"100%",minHeight:"300px",padding:"12px",background:surf,border:"1px solid "+brd,borderRadius:"6px",color:txt,fontSize:"13px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical",lineHeight:"1.6"}} />
        </div>}

        {/* ═══ INVENTORY TAB ═══ */}
        {tab==="inv"&&(function(){
          var totalWt=inventory.reduce(function(s,it){return s+(it.weight||0)*it.qty;},0);
          var filteredInv=invSearch.trim()
            ?inventory.filter(function(it){return it.name.toLowerCase().includes(invSearch.toLowerCase());})
            :inventory;
          function saveInvItem(form){
            var item=Object.assign({},form,{id:form.id||Date.now()+"_"+Math.random().toString(36).slice(2)});
            setInventory(function(prev){var idx=prev.findIndex(function(x){return x.id===item.id;});return idx>=0?prev.map(function(x,i){return i===idx?item:x;}):prev.concat([item]);});
            setInvForm(null);
          }
          function delInvItem(id){setInventory(function(prev){return prev.filter(function(x){return x.id!==id;});});}
          function applyKit(kitKey){
            var kitItems=(STARTER_KITS[kitKey]||[]).map(function(item){
              return Object.assign({},item,{id:Date.now()+"_"+Math.random().toString(36).slice(2)+"_"+item.name.replace(/\s/g,'')});
            });
            setInventory(function(prev){
              var names=kitItems.map(function(x){return x.name;});
              var merged=prev.filter(function(x){return !names.includes(x.name);});
              return merged.concat(kitItems);
            });
          }
          var BLANK_INV={id:null,name:"",qty:1,weight:0,cost:"",notes:""};
          var phbCats=["All"].concat(Array.from(new Set(PHB_EQUIPMENT.map(function(x){return x.category;}))));
          var phbFiltered=PHB_EQUIPMENT.filter(function(x){
            var catOk=!invBrowseCat||invBrowseCat==="All"||x.category===invBrowseCat;
            var qOk=!invBrowseQ.trim()||x.name.toLowerCase().includes(invBrowseQ.toLowerCase());
            return catOk&&qOk;
          });
          function addPhbItem(item){
            var existing=inventory.find(function(x){return x.name===item.name;});
            if(existing){
              setInventory(function(prev){return prev.map(function(x){return x.id===existing.id?Object.assign({},x,{qty:x.qty+1}):x;});});
            }else{
              setInventory(function(prev){return prev.concat([{id:Date.now()+"_"+Math.random().toString(36).slice(2),name:item.name,qty:1,weight:item.weight,cost:item.cost,notes:""}]);});
            }
          }
          return <div>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
              <Lbl dim={dim}>INVENTORY{inventory.length>0&&<span style={{color:"#666",fontWeight:"normal"}}> ({inventory.length} items · {totalWt.toFixed(1)} lb)</span>}</Lbl>
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                <button onClick={function(){setInvBrowse(function(v){return !v;});setInvForm(null);}}
                  style={{padding:"4px 12px",background:invBrowse?"#1a2a3a":"#1a1a28",color:invBrowse?"#80c0e0":"#80a0e0",border:"1px solid "+(invBrowse?"#2a4a6a":"#2a2a5a"),borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>
                  {invBrowse?"✕ Close List":"📋 Equipment List"}
                </button>
                {!invBrowse&&!invForm&&<button onClick={function(){setInvForm(Object.assign({},BLANK_INV));}}
                  style={{padding:"4px 12px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>+ Custom Item</button>}
              </div>
            </div>

            {/* PHB Equipment Browser */}
            {invBrowse&&<div style={{background:"#0d0d18",border:"1px solid #2a2a4a",borderRadius:"6px",padding:"12px",marginBottom:"14px"}}>
              <div style={{fontSize:"10px",color:"#80a0e0",fontFamily:"monospace",letterSpacing:"1px",marginBottom:"8px"}}>PHB EQUIPMENT — click any item to add it</div>
              {/* Search + category filter */}
              <div style={{display:"flex",gap:"6px",marginBottom:"8px",flexWrap:"wrap"}}>
                <input value={invBrowseQ} onChange={function(e){setInvBrowseQ(e.target.value);}}
                  placeholder="Search…" autoFocus
                  style={{flex:1,minWidth:"120px",padding:"5px 8px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"3px",color:txt,fontSize:"11px",fontFamily:"monospace",outline:"none"}}/>
                <select value={invBrowseCat} onChange={function(e){setInvBrowseCat(e.target.value);}}
                  style={Object.assign({},ss(brd,txt),{fontSize:"11px",padding:"4px 8px"})}>
                  {phbCats.map(function(c){return <option key={c} value={c==="All"?"":c}>{c}</option>;})}
                </select>
              </div>
              {/* Starter kit shortcuts */}
              <div style={{display:"flex",gap:"5px",marginBottom:"10px",flexWrap:"wrap"}}>
                <span style={{fontSize:"10px",color:dim,fontFamily:"monospace",alignSelf:"center"}}>Quick kits:</span>
                {Object.keys(KIT_LABELS).map(function(k){
                  return <button key={k} onClick={function(){applyKit(k);}}
                    style={{padding:"3px 9px",background:"transparent",color:dim,border:"1px solid #2a2a3a",borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>
                    + {KIT_LABELS[k]}
                  </button>;
                })}
              </div>
              {/* Item rows */}
              <div style={{maxHeight:"300px",overflowY:"auto",display:"flex",flexDirection:"column",gap:"2px"}}>
                {phbFiltered.length===0&&<div style={{padding:"12px",textAlign:"center",color:dim,fontSize:"12px"}}>No items match.</div>}
                {phbFiltered.map(function(item){
                  var alreadyHave=inventory.find(function(x){return x.name===item.name;});
                  return <div key={item.name} onClick={function(){addPhbItem(item);}}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 8px",borderRadius:"4px",cursor:"pointer",background:alreadyHave?"#0d1a0d":"transparent",border:"1px solid "+(alreadyHave?"#1a3a1a":"transparent")}}
                    onMouseEnter={function(e){if(!alreadyHave)e.currentTarget.style.background="#12121e";}}
                    onMouseLeave={function(e){e.currentTarget.style.background=alreadyHave?"#0d1a0d":"transparent";}}>
                    <div style={{display:"flex",gap:"8px",alignItems:"baseline",flex:1,minWidth:0}}>
                      <span style={{fontSize:"12px",color:alreadyHave?"#7db87d":txt}}>{item.name}</span>
                      <span style={{fontSize:"9px",color:dim,fontFamily:"monospace"}}>{item.category}</span>
                    </div>
                    <div style={{display:"flex",gap:"10px",alignItems:"center",flexShrink:0}}>
                      {item.cost&&<span style={{fontSize:"10px",color:"#e0c080",fontFamily:"monospace"}}>{item.cost}</span>}
                      {item.weight>0&&<span style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>{item.weight} lb</span>}
                      <span style={{fontSize:"12px",color:alreadyHave?"#7db87d":"#555",fontFamily:"monospace"}}>{alreadyHave?"✓ ×"+alreadyHave.qty:"+"}</span>
                    </div>
                  </div>;
                })}
              </div>
            </div>}

            {/* Custom add / edit form */}
            {invForm&&<div style={{background:surf,border:"1px solid #2a2a4a",borderRadius:"6px",padding:"14px",marginBottom:"14px"}}>
              <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px",marginBottom:"8px"}}>{invForm.id?"EDIT ITEM":"CUSTOM ITEM"}</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:"8px",marginBottom:"8px"}}>
                <div>
                  <Lbl dim={dim}>Item Name</Lbl>
                  <input value={invForm.name} onChange={function(e){setInvForm(function(f){return Object.assign({},f,{name:e.target.value});});}}
                    placeholder="e.g. Torch" style={Object.assign({},is(brd,txt),{width:"100%"})} autoFocus />
                </div>
                <div>
                  <Lbl dim={dim}>Qty</Lbl>
                  <input type="number" value={invForm.qty} min="1" onChange={function(e){setInvForm(function(f){return Object.assign({},f,{qty:parseInt(e.target.value)||1});});}}
                    style={Object.assign({},is(brd,txt),{width:"100%"})} />
                </div>
                <div>
                  <Lbl dim={dim}>Wt (lb ea)</Lbl>
                  <input type="number" value={invForm.weight} step="0.5" min="0" onChange={function(e){setInvForm(function(f){return Object.assign({},f,{weight:parseFloat(e.target.value)||0});});}}
                    style={Object.assign({},is(brd,txt),{width:"100%"})} />
                </div>
                <div>
                  <Lbl dim={dim}>Cost</Lbl>
                  <input value={invForm.cost} onChange={function(e){setInvForm(function(f){return Object.assign({},f,{cost:e.target.value});});}}
                    placeholder="5gp" style={Object.assign({},is(brd,txt),{width:"100%"})} />
                </div>
              </div>
              <div style={{marginBottom:"8px"}}>
                <Lbl dim={dim}>Notes</Lbl>
                <input value={invForm.notes} onChange={function(e){setInvForm(function(f){return Object.assign({},f,{notes:e.target.value});});}}
                  placeholder="Optional" style={Object.assign({},is(brd,txt),{width:"100%"})} />
              </div>
              <div style={{display:"flex",gap:"6px"}}>
                <button onClick={function(){saveInvItem(invForm);}}
                  style={{padding:"5px 14px",background:"#1a2a1a",color:"#7db87d",border:"1px solid #2a4a2a",borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px"}}>Save</button>
                <button onClick={function(){setInvForm(null);}}
                  style={{padding:"5px 12px",background:"transparent",color:dim,border:"1px solid "+brd,borderRadius:"4px",cursor:"pointer",fontFamily:"monospace",fontSize:"11px"}}>Cancel</button>
              </div>
            </div>}

            {/* Inventory search */}
            {inventory.length>4&&<input value={invSearch} onChange={function(e){setInvSearch(e.target.value);}}
              placeholder="Search inventory…"
              style={{width:"100%",boxSizing:"border-box",padding:"6px 10px",background:"#0a0a12",border:"1px solid "+brd,borderRadius:"4px",color:txt,fontSize:"12px",fontFamily:"monospace",outline:"none",marginBottom:"10px"}}/>}

            {/* Inventory list */}
            {inventory.length===0&&!invBrowse&&<div style={{padding:"24px",textAlign:"center",color:dim,fontSize:"12px"}}>No items yet — open the Equipment List to browse PHB gear, or add a Custom Item.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
              {filteredInv.map(function(it){
                return <div key={it.id} style={{background:surf,border:"1px solid "+brd,borderRadius:"5px",padding:"8px 12px",display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:"8px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"13px",color:txt,fontWeight:"bold"}}>{it.name}</span>
                      {it.qty>1&&<span style={{fontSize:"10px",color:"#80a0e0",fontFamily:"monospace"}}>×{it.qty}</span>}
                      {it.cost&&<span style={{fontSize:"10px",color:"#e0c080",fontFamily:"monospace"}}>{it.cost}{it.qty>1?" ea":""}</span>}
                      {it.weight>0&&<span style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>{(it.weight*it.qty).toFixed(1)} lb{it.qty>1?" total":""}</span>}
                    </div>
                    {it.notes&&<div style={{fontSize:"10px",color:dim,marginTop:"2px",fontStyle:"italic"}}>{it.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:"4px",flexShrink:0}}>
                    <button onClick={function(){setInvForm(Object.assign({},it));setInvBrowse(false);}}
                      style={{padding:"3px 8px",background:"transparent",color:dim,border:"1px solid "+brd,borderRadius:"3px",cursor:"pointer",fontFamily:"monospace",fontSize:"10px"}}>Edit</button>
                    <button onClick={function(){delInvItem(it.id);}}
                      style={{padding:"3px 6px",background:"transparent",color:"#664444",border:"none",cursor:"pointer",fontSize:"14px"}}>×</button>
                  </div>
                </div>;
              })}
            </div>
          </div>;
        })()}

        {/* ═══ AI TAB ═══ */}
        {tab==="AI"&&<div>
          <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
            {["spells","gen"].map(function(m){
              var label=m==="spells"?"✦ Spell Search":"✦ Character Generator";
              return <button key={m} onClick={function(){setAiMode(m);setAiResult("");setAiHighlight([]);setGenResult(null);}} style={{padding:"6px 16px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",letterSpacing:"1px",background:aiMode===m?"#1a1a30":"transparent",color:aiMode===m?g:dim,border:aiMode===m?"1px solid #2a2a4a":"1px solid transparent"}}>{label}</button>;
            })}
          </div>
          {aiMode==="spells"&&<div>
            <Lbl dim={dim}>DESCRIBE YOUR SITUATION OR NEED</Lbl>
            <div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>
              <input value={aiQuery} onChange={function(e){setAiQuery(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")doSpellSearch();}} placeholder="e.g. mass combat underground, high DPS no vegetation, party needs survivability buffs…" style={Object.assign({},is(brd,txt),{flex:1})} />
              <button onClick={doSpellSearch} disabled={aiLoading} style={{padding:"6px 18px",background:aiLoading?"#1a1a28":"#1a2a1a",color:aiLoading?dim:"#7db87d",border:"1px solid "+(aiLoading?brd:"#3a6a3a"),borderRadius:"4px",cursor:aiLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"11px"}}>{aiLoading?"…":"Search"}</button>
            </div>
            {aiThinking&&<div style={{marginBottom:"10px",border:"1px solid #2a2a4a",borderRadius:"6px",overflow:"hidden"}}>
              <button onClick={function(){setAiThinkingOpen(function(p){return !p;});}}
                style={{width:"100%",padding:"8px 12px",background:"#0e0e1e",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:"8px",fontFamily:"monospace",fontSize:"10px",color:"#6060a0",textAlign:"left"}}>
                <span style={{fontSize:"8px",color:"#4040a0"}}>{aiLoading&&!aiResult?"●":aiThinkingOpen?"▲":"▼"}</span>
                <span style={{letterSpacing:"1px"}}>REASONING</span>
                {!aiLoading&&<span style={{marginLeft:"auto",fontSize:"9px",opacity:0.5}}>{aiThinkingOpen?"hide":"show"}</span>}
              </button>
              {(aiThinkingOpen||(aiLoading&&!aiResult))&&<div style={{padding:"12px",background:"#080810",fontSize:"10px",color:"#5050a0",fontFamily:"monospace",lineHeight:"1.7",maxHeight:"30vh",overflowY:"auto",whiteSpace:"pre-wrap"}}>{aiThinking}</div>}
            </div>}
            {aiResult&&<div style={{background:surf,border:"1px solid "+brd,borderRadius:"6px",padding:"14px",fontSize:"12px",lineHeight:"1.8",whiteSpace:"pre-wrap",color:txt,maxHeight:"40vh",overflowY:"auto"}}>{renderBold(aiResult)}</div>}
            {aiHighlight.length>0&&(function(){
              var db=edition==='1e'&&isWizard?spells1e:compSpells;
              var matched=db.filter(function(s){return aiHighlight.indexOf(s["Spell Name"])>=0;});
              if(matched.length===0)return null;
              return <div style={{marginTop:"12px"}}>
                <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px",marginBottom:"6px"}}>SUGGESTED SPELLS</div>
                {matched.map(function(spell){
                  var lvl=parseInt(spell.Level)||1;
                  var used=memoCount(lvl);
                  var max=adjSlots[lvl-1]||0;
                  var alreadyPrepped=memorized.some(function(m){return m["Spell Name"]===spell["Spell Name"];});
                  var slotFull=!alreadyPrepped&&used>=max&&max>0;
                  var isNonCaster=max===0;
                  return <div key={spell["Spell Name"]} style={{display:"flex",alignItems:"center",gap:"8px",padding:"5px 10px",marginBottom:"3px",background:surf,border:"1px solid "+(alreadyPrepped?"#2a4a2a":brd),borderRadius:"4px"}}>
                    <span style={{fontSize:"10px",color:"#80b0e0",fontFamily:"monospace",minWidth:"36px"}}>L{lvl}</span>
                    <span style={{flex:1,fontSize:"12px",color:alreadyPrepped?"#7db87d":txt}}>{spell["Spell Name"]}</span>
                    {alreadyPrepped
                      ?<span style={{fontSize:"10px",color:"#7db87d",fontFamily:"monospace"}}>✓ Prepared</span>
                      :isNonCaster
                        ?<span style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>—</span>
                        :<button onClick={function(){prepareFromAI(spell);}} disabled={slotFull}
                          style={{padding:"3px 10px",background:slotFull?"transparent":"#1a2a1a",color:slotFull?dim:"#7db87d",border:"1px solid "+(slotFull?brd:"#3a6a3a"),borderRadius:"3px",cursor:slotFull?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"10px",whiteSpace:"nowrap"}}>
                          {slotFull?"Full":"+ Prepare"}
                        </button>}
                  </div>;
                })}
              </div>;
            })()}
          </div>}
          {aiMode==="gen"&&<div>
            <Lbl dim={dim}>DESCRIBE YOUR CHARACTER CONCEPT</Lbl>
            <textarea value={genPrompt} onChange={function(e){setGenPrompt(e.target.value);}} placeholder="e.g. A grizzled dwarven fighter who lost his clan and wanders as a mercenary. Strong, tough, suspicious of magic…" style={{width:"100%",minHeight:"120px",padding:"10px",background:surf,border:"1px solid "+brd,borderRadius:"6px",color:txt,fontSize:"13px",fontFamily:"Georgia,serif",outline:"none",resize:"vertical",lineHeight:"1.6",marginBottom:"10px"}} />
            <div style={{marginBottom:"10px"}}>
              <div style={{fontSize:"10px",color:dim,fontFamily:"monospace",letterSpacing:"1px",marginBottom:"6px"}}>STARTER KIT (auto-applied on Create)</div>
              <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                {Object.keys(KIT_LABELS).map(function(k){
                  return <button key={k} onClick={function(){setGenKit(k);}}
                    style={{padding:"4px 12px",borderRadius:"4px",cursor:"pointer",fontSize:"11px",fontFamily:"monospace",background:genKit===k?"#1a2a1a":"transparent",color:genKit===k?"#7db87d":dim,border:genKit===k?"1px solid #2a4a2a":"1px solid #1a1a2a"}}>
                    {KIT_LABELS[k]}
                  </button>;
                })}
              </div>
            </div>
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
                <button onClick={function(){generatePortrait({race:genResult.race,cls:genResult.cls,kit:"",align:genResult.align,notes:genResult.notes||""});}} disabled={portraitLoading}
                  style={{padding:"5px 14px",background:"transparent",color:portraitLoading?dim:"#c0a040",border:"1px solid "+(portraitLoading?brd:"#5a4a20"),borderRadius:"4px",cursor:portraitLoading?"not-allowed":"pointer",fontFamily:"monospace",fontSize:"10px",opacity:portraitLoading?0.5:0.8}}>
                  {portraitLoading?"Generating portrait…":"✦ Generate Portrait"}
                </button>
              </div>
              {charPortrait&&!portraitLoading&&<div style={{marginTop:"10px",display:"flex",alignItems:"center",gap:"10px"}}>
                <img src={charPortrait} alt="portrait" style={{width:"64px",height:"64px",objectFit:"cover",borderRadius:"4px",border:"1px solid "+brd}} />
                <div style={{fontSize:"10px",color:dim,fontFamily:"monospace"}}>Portrait ready — will be applied with character</div>
              </div>}
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
