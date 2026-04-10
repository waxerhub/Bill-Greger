const fs = require('fs');
let src = fs.readFileSync('SpellEngine.jsx', 'utf8');

const MARKER = '// ======== MAIN COMPONENT ========';
if (!src.includes(MARKER)) { console.log('ERR: MAIN COMPONENT marker not found'); process.exit(1); }

const DATA_BLOCK = `// ======== DRUID DATA ========
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

var DRUID_BRANCHES = {
  "Arctic": {
    forms:["Arctic Fox","Seal","Polar Bear","Snow Owl","Arctic Wolf"],
    passives:[
      "Immune to natural cold (non-magical)",
      "Can survive in blizzard conditions without shelter",
      "Tracking in snow at +2 bonus",
      "Speak with Arctic animals at will (1/day)"
    ]
  },
  "Desert": {
    forms:["Desert Fox","Camel","Horned Viper","Vulture","Sand Cat"],
    passives:[
      "Immune to natural heat (non-magical)",
      "Needs only half normal water intake",
      "Never lost in desert terrain",
      "Detect water within 100 yards (1/day)"
    ]
  },
  "Jungle": {
    forms:["Jaguar","Boa Constrictor","Toucan","Capybara","Howler Monkey"],
    passives:[
      "Move silently in jungle at +2 bonus",
      "Never lost in jungle terrain",
      "Immune to jungle diseases",
      "Speak with jungle animals at will (1/day)"
    ]
  },
  "Mountain": {
    forms:["Mountain Goat","Snow Leopard","Golden Eagle","Grizzly Bear","Rocky Mountain Elk"],
    passives:[
      "Unaffected by altitude sickness",
      "Climb sheer surfaces at movement rate",
      "Detect avalanche danger (3 in 6 chance)",
      "Never lost in mountain terrain"
    ]
  },
  "Plains": {
    forms:["Bison","Coyote","Prairie Dog","Red-Tailed Hawk","Wild Horse"],
    passives:[
      "Spot movement on plains at double normal range",
      "Never lost in plains or grassland",
      "Track on plains at +2 bonus",
      "Speak with plains animals at will (1/day)"
    ]
  },
  "Swamp": {
    forms:["Alligator","Giant Frog","Heron","Snapping Turtle","Water Moccasin"],
    passives:[
      "Immune to swamp fevers and diseases",
      "Move through swamp terrain without penalty",
      "Breathe underwater for 1 round/level (1/day)",
      "Never lost in swamp terrain"
    ]
  },
  "Forest": {
    forms:["Deer","Fox","Owl","Black Bear","Wild Boar"],
    passives:[
      "Move silently in forest at +1 bonus",
      "Never lost in forest terrain",
      "Speak with forest animals at will (1/day)",
      "Identify any natural plant or animal in forest"
    ]
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
      "Must protect totem animal species whenever encountered",
      "Alignment shift if totem animal species is threatened and druid does nothing"
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
      "Uncomfortable below 2,000 feet elevation (-1 to all rolls for 1 week after descending)",
      "Restricted to Mountain druidic branch"
    ]
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
      "Must anoint self with swamp mud daily (or lose druidic powers for 24 hrs)",
      "Restricted to Swamp druidic branch"
    ]
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
      "Must meditate in the cold for 1 hour each day",
      "Restricted to Arctic druidic branch"
    ]
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
      "Must meditate at high noon each day",
      "Restricted to Desert druidic branch"
    ]
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
      "Cannot wear metal armor (jungle heat and undergrowth)",
      "Restricted to Jungle druidic branch"
    ]
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
      "Must tend or visit a sacred plains grove each month",
      "Restricted to Plains druidic branch"
    ]
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
      "Cannot harm trees knowingly",
      "Restricted to Forest druidic branch"
    ]
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
      "Cannot enter cities with population over 5,000 without distress",
      "Restricted to Plains druidic branch"
    ]
  },
  "None": {
    req:{},
    desc:"No kit selected — standard druid.",
    abilities:[],
    limitations:[]
  }
};

`;

src = src.replace(MARKER, DATA_BLOCK + MARKER);
fs.writeFileSync('SpellEngine.jsx', src, 'utf8');
console.log('Done: BEAST_FORMS, DRUID_BRANCHES, DRUID_KITS inserted.');
