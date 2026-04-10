const fs = require('fs');
let src = fs.readFileSync('spellData.js', 'utf8');

// New spells from the Complete Druid's Handbook
const NEW_SPELLS = [
  // Level 1
  {
    "Spell Name": "Shillelagh",
    "Level": 1,
    "Category": "Druid",
    "Sphere": "Combat, Plant",
    "School": "Alteration",
    "Description": "Transforms the druid's oaken cudgel or shillelagh into a magical weapon. The weapon deals 2d4 damage (Small/Medium) or 1d4+1 damage (Large) and is treated as a +1 magical weapon for the purpose of hitting creatures requiring enchanted weapons. Duration: 1 round/level.",
    "Damage Type": "Bludgeoning",
    "Damage Dice": "2d4",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Locate Animals or Plants",
    "Level": 1,
    "Category": "Druid",
    "Sphere": "Divination, Animal, Plant",
    "School": "Divination",
    "Description": "Enables the druid to sense the direction and distance to any specific type of animal or plant within a radius of 100 yards + 20 yards/level. The druid must name the specific type of creature or plant sought. Can also locate the nearest watering hole, berry patch, or other natural resource. Duration: 1 round/level.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Predict Weather",
    "Level": 1,
    "Category": "Druid",
    "Sphere": "Divination, Weather",
    "School": "Divination",
    "Description": "Accurately predicts the weather for the local area for the next 12 hours. The druid perceives air currents, cloud patterns, and other signs to forecast conditions including temperature, precipitation, and wind speed. At higher levels (5+) predicts up to 24 hours ahead. Accuracy is 90% + 1%/level.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  // Level 2
  {
    "Spell Name": "Goodberry",
    "Level": 2,
    "Category": "Druid",
    "Sphere": "Plant, Healing",
    "School": "Alteration, Evocation",
    "Description": "Causes 2d4 fresh berries to become magical. Each berry provides a day's sustenance and heals 1 hit point if consumed within 24 hours. Only 8 berries can be created per casting and they lose their magic after one day. A character can only benefit from up to 8 goodberries per day.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Soften Earth and Stone",
    "Level": 2,
    "Category": "Druid",
    "Sphere": "Elemental Earth",
    "School": "Alteration",
    "Description": "Softens earth, clay, or stone in a 10-foot square area. Wet or soft earth becomes quicksand-like mud. Dry earth becomes loose soil. Stone becomes crumbly. Creatures in affected earth move at half speed and suffer -2 to attack rolls. Duration: permanent (until disturbed).",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Warp Wood",
    "Level": 2,
    "Category": "Druid",
    "Sphere": "Plant",
    "School": "Alteration",
    "Description": "Causes wood within range to bend and warp, making it useless for its intended purpose. Affects up to a 15-foot length of wood, or number of arrows equal to caster level. Can warp a door, chest, shaft of a weapon, wooden shields, or similar objects. Warped objects deal -2 damage and are -1 to hit if used as weapons.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  // Level 3
  {
    "Spell Name": "Call Lightning",
    "Level": 3,
    "Category": "Druid",
    "Sphere": "Weather",
    "School": "Evocation",
    "Description": "Calls down lightning bolts from storm clouds. If no storm exists, the druid can create one (taking 10 minutes). Each bolt deals 2d8 damage + 1d8 per level (max 10d8), save vs. spell for half. One bolt per 10 minutes. Must remain outdoors in stormy weather. Duration: 1 turn/level.",
    "Damage Type": "Lightning",
    "Damage Dice": "2d8+1d8/level",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Meld Into Stone",
    "Level": 3,
    "Category": "Druid",
    "Sphere": "Elemental Earth",
    "School": "Alteration",
    "Description": "Allows the druid to meld body and possessions into a stone object at least as large as the druid. While melded, the druid is aware of surroundings (90-degree arc of vision), can hear normally, and is immune to all spells. Cannot cast spells or take any action. Duration: 8 rounds/level.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Stone Shape",
    "Level": 3,
    "Category": "Druid",
    "Sphere": "Elemental Earth",
    "School": "Alteration",
    "Description": "Allows the druid to shape stone into any form desired. Volume affected: 9 cubic feet + 1 cubic foot per level. The shaped stone has the same density as normal stone. Can create crude stone tools, seal passages, form primitive locks and hasps, or shape weapons (1d6 damage). Permanent effect.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Water Breathing",
    "Level": 3,
    "Category": "Druid",
    "Sphere": "Elemental Water",
    "School": "Alteration",
    "Description": "Grants the ability to breathe water as freely as air to the creature touched. Does not prevent breathing air. Duration: 1 hour/level (druid version is longer than magic-user version). Can be reversed to create Air Breathing on aquatic creatures.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  // Level 4
  {
    "Spell Name": "Animal Summoning I",
    "Level": 4,
    "Category": "Druid",
    "Sphere": "Animal, Summoning",
    "School": "Conjuration/Summoning",
    "Description": "Summons up to 8 animals of no more than 4 Hit Dice each, or 1 animal of 8 Hit Dice or less, from the surrounding area (1/2 mile radius). Animals are friendly and follow simple commands. They depart when killed, dismissed, or after 1 round/level. Works only in natural environments — does not function in dungeons.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Repel Insects",
    "Level": 4,
    "Category": "Druid",
    "Sphere": "Animal, Protection",
    "School": "Abjuration, Alteration",
    "Description": "Creates an invisible barrier around the druid that repels normal insects and arthropods. Giant insects (1 HD or less) must save vs. spell or flee. Insects of 2+ HD may enter but are at -2 to attack and damage. Radius: 10 feet. Duration: 1 turn/level.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Spike Stones",
    "Level": 4,
    "Category": "Druid",
    "Sphere": "Elemental Earth, Combat",
    "School": "Alteration, Evocation",
    "Description": "Causes rocky ground to transform into razor-sharp stone spikes that are nearly invisible to the untrained eye. Creatures moving through the area take 1d4 damage per round. Movement rate is reduced by half. Area: 10-foot square per level. Duration: 1 turn/level. Druid and companions aware of area are unaffected.",
    "Damage Type": "Piercing",
    "Damage Dice": "1d4",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  // Level 5
  {
    "Spell Name": "Animal Summoning II",
    "Level": 5,
    "Category": "Druid",
    "Sphere": "Animal, Summoning",
    "School": "Conjuration/Summoning",
    "Description": "As Animal Summoning I, but summons up to 6 animals of no more than 8 Hit Dice each, or 1 animal of no more than 16 Hit Dice. Animals are friendly and follow simple commands. Works only in natural environments.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Commune with Nature",
    "Level": 5,
    "Category": "Druid",
    "Sphere": "Divination",
    "School": "Divination",
    "Description": "Enables the druid to commune with nature, gaining information about the surrounding territory. For every experience level, the druid can determine one aspect of the natural surroundings (terrain type, bodies of water, major plants, prevailing weather, animal populations, etc.) within a radius of 1 mile/level outdoors, or 1/2 level underground.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Wall of Thorns",
    "Level": 5,
    "Category": "Druid",
    "Sphere": "Combat, Plant",
    "School": "Conjuration/Summoning",
    "Description": "Creates a barrier of tough, prickly brambles 10 feet thick per caster level (max 60 feet). Creatures forcing through the wall take 8 points of damage + 1/level per 10 feet traversed. The wall conforms to any shape desired along the ground. Duration: 1 turn/level.",
    "Damage Type": "Piercing",
    "Damage Dice": "8+1/level",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  // Level 6
  {
    "Spell Name": "Animal Summoning III",
    "Level": 6,
    "Category": "Druid",
    "Sphere": "Animal, Summoning",
    "School": "Conjuration/Summoning",
    "Description": "As Animal Summoning II, but summons up to 4 animals of no more than 16 Hit Dice each. Animals are friendly and follow simple commands. Works only in natural environments.",
    "Damage Type": "",
    "Damage Dice": "",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Conjure Fire Elemental",
    "Level": 6,
    "Category": "Druid",
    "Sphere": "Conjuration, Elemental Fire",
    "School": "Conjuration/Summoning",
    "Description": "Conjures a 16 Hit Die fire elemental. The elemental serves the druid for 1 turn/level or until dismissed. The fire elemental will not attack the druid but can be broken free from control if concentration is disrupted. The druid need not maintain concentration but must stay within 60 yards.",
    "Damage Type": "Fire",
    "Damage Dice": "3d8",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  // Level 7
  {
    "Spell Name": "Changestaff",
    "Level": 7,
    "Category": "Druid",
    "Sphere": "Combat, Plant",
    "School": "Evocation, Alteration",
    "Description": "Transforms the druid's oaken staff into a tree-like creature (an animated treant-like entity) with 12 Hit Dice, AC 0, MV 6. It fights on the druid's behalf and has 3 attacks per round at 3d6 damage. It has 12 HP per caster level. Duration: until dismissed or destroyed.",
    "Damage Type": "Bludgeoning",
    "Damage Dice": "3d6",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Creeping Doom",
    "Level": 7,
    "Category": "Druid",
    "Sphere": "Animal, Summoning",
    "School": "Conjuration/Summoning",
    "Description": "Summons a mass of venomous centipedes, scorpions, and spiders that spreads from the druid's hands. The swarm covers a 20×20-foot area and attacks any creatures in that area, causing 1d4 damage per round with an additional save vs. poison for each creature in the swarm. The druid can direct the swarm at up to 40 yards/round. Duration: 4 rounds/level.",
    "Damage Type": "Poison",
    "Damage Dice": "1d4",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  },
  {
    "Spell Name": "Finger of Death",
    "Level": 7,
    "Category": "Druid",
    "Sphere": "Necromantic",
    "School": "Necromancy",
    "Description": "Snuffs out the life force of a single creature. Target must save vs. death magic or die instantly. If the save succeeds, the target suffers 2d8+1 damage instead. This spell is considered antithetical to druidic philosophy and its use causes the druid to lose access to druidic abilities for 24 hours unless used against a creature actively desecrating nature.",
    "Damage Type": "Death",
    "Damage Dice": "2d8+1",
    "Source": "Complete Druid's Handbook",
    "_type": "Priest"
  }
];

// Find the closing ]]; and replace it with new entries + ]];
const END_MARKER = '}];';
const lastIdx = src.lastIndexOf(END_MARKER);
if (lastIdx === -1) { console.log('ERR: end of SPELL_DATA not found'); process.exit(1); }

const newEntries = NEW_SPELLS.map(function(s){ return JSON.stringify(s); }).join(',\n');
const newSrc = src.slice(0, lastIdx) + '},\n' + newEntries + '];';

fs.writeFileSync('spellData.js', newSrc, 'utf8');
console.log('Done: added ' + NEW_SPELLS.length + ' new druid spells from Complete Druid\'s Handbook.');
