# Character Forge — Crash Course

**AD&D 2nd Edition character tool** · Web app · Works on desktop & mobile

---

## Quick Start

1. Open the app in your browser
2. The app **auto-saves** every change to your browser — no manual save required for local use
3. Your character persists across page refreshes

---

## The Header

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Character Forge  AD&D 2E · PLAYER'S OPTION                                 │
│  [stats] [combat] [spells] [✦ CP] [sheet] [notes] [✦ AI]  [NEW] [PDF]      │
│  [💾 Save] [📂 Load] [☁ Cloud Save] [☁ Cloud Load]                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

The top info bar also shows the character's name, class, level, HP, AC, and THAC0 at a glance.

### Header Buttons

| Button | What it does |
|--------|-------------|
| **NEW** | Clear everything and start a fresh character (asks no confirmation — use Save first!) |
| **PDF** | Export a formatted character sheet as a PDF file |
| **💾 Save** | Download the character as a `.json` file to your device |
| **📂 Load** | Load a `.json` file **or** import a Character Forge PDF (AI reads it) |
| **☁ Cloud Save** | Save to Supabase cloud (requires Supabase configured) |
| **☁ Cloud Load** | Browse and load your cloud-saved characters |

---

## Tab 1 — STATS

The main character creation tab.

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  RACE    │ │  CLASS   │ │   KIT    │ │  LEVEL   │
│  Human ▾ │ │  Druid ▾ │ │  None ▾  │ │ [−] 5 [+]│
└──────────┘ └──────────┘ └──────────┘ └──────────┘
┌─────────────────────────┐ ┌──────────┐ ┌──────────┐
│  EXPERIENCE             │ │  HIT PTS │ │ALIGNMENT │
│  [  1500  ] +100 +500 +1k│ │ [28] − + │ │True Neut▾│
│  1.5k / 4k XP  ▓▓▓░  37%│ │ ROLL 5d8 │ │          │
└─────────────────────────┘ └──────────┘ └──────────┘
```

### Race & Class
- Pick from the **Race** dropdown: Human, Elf, Half-Elf, Dwarf, Gnome, Halfling, Half-Orc
- Pick a **Class**: Fighter, Ranger, Paladin, Cleric, Druid, Mage, Illusionist, Thief, Bard
- Racial stat adjustments are shown below the race selector

### Kit
- For **Druids**: choose a specialty kit (Totemic Druid, Shapeshifter, etc.) from the dropdown
- For **all other classes**: free-text field — type anything (e.g. "Eldritch Knight")
- If a kit has stat requirements you don't meet, a warning appears with a **DM Override** checkbox

### Level & XP
- Use **−/+** buttons or type directly in the Level field (1–20)
- The **EXPERIENCE** card shows:
  - Your current XP (editable) and the threshold for the next level
  - A progress bar filling toward next level
  - **LEVEL UP!** in green when you've earned enough XP
  - Quick-add buttons: **+100**, **+500**, **+1k** for fast entry after a session

### Hit Points
- Type directly or use **−/+** to track damage mid-session
- **ROLL Nd8** button rolls HD × level + CON bonus automatically

### Ability Scores

```
┌──────────────────────────────────────────────────────────────┐
│  ABILITY SCORES        [3d6] [4d6] [3d6r1]  [ROLL] [ASSIGN] │
│                                                              │
│  STR  [16] − +    Melee: +1    Dmg: +1                      │
│  DEX  [14] − +    AC: +0    Missile: +0                     │
│  CON  [15] − +    HP/die: +1                                │
│  INT  [10] − +                                              │
│  WIS  [16] − +    Saves: +2    Bonus spells: 2/2            │
│  CHA  [15] − +                                              │
└──────────────────────────────────────────────────────────────┘
```

**Rolling stats:**
1. Click **ROLL** — a modal shows all 6 sets of dice
2. Use **ASSIGN** to drag-drop or assign each roll to a stat
3. **3d6** = classic, **4d6** = drop lowest, **3d6r1** = reroll ones

Each stat shows its mechanical effect (to-hit bonus, AC adjustment, HP per die, etc.) calculated from the PHB tables.

**Exceptional Strength:** Warriors with STR 18 get a **percentile** input (1–100) for 18/xx exceptional strength.

### Druid-Only: Shapechange & Totem

When playing a Druid with a shapeshifting kit:
- **Totem Animal** dropdown appears — pick your spirit animal
- **Shape Uses** tracker counts remaining daily shapeshifts
- **Failed Attempts** tracks cumulative shapechange failures (each adds 5% stuck chance)

---

## Tab 2 — COMBAT

Read-only combat reference — all values calculated from your stats.

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  THAC0   │ │    AC    │ │    HP    │ │  DMG ADJ │
│    15    │ │    8     │ │    28    │ │   +1     │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

SAVING THROWS
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Para/ │ │Rod/  │ │Petri-│ │Breath│ │Spell │
│Poison│ │Staff │ │fy   │ │      │ │      │
│  10  │ │  14  │ │  13  │ │  16  │ │  15  │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘

SPELL SLOTS
  L1    L2    L3
 2/3   1/3   0/2    ← used/available
```

- **THAC0** updates based on class, level, and STR bonus
- **AC** updates from DEX; add armor separately
- **Spell Slots** show used/available for each spell level (red when full)
- **Memorized spells** are listed with a click-to-remove ✕

---

## Tab 3 — SPELLS

The spell management center.

```
┌────────────────────────────────────────────────┐
│  2203 spells · Filtered by CP    [⟳ Reload XLSX]│
└────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ COMBAT ROUND  3   [⏭ Next Round]  [↺ Reset]     │
└─────────────────────────────────────────────────┘
```

### Compendium (bottom of tab)

```
[Search…]  [All Levels ▾]  147 spells

[+]  L1  Entangle        Support
[+]  L2  Barkskin        Support
[+1] L2  Cure Light Wounds  Healing   ← already prepared once
[+]  L3  Call Lightning  Combat      2d10 damage
         ▶ (click to expand description)
```

- **[+]** button prepares the spell — adds it to your memorized list
- Shows up to 150 matching spells; use **Search** or **Level** filter to narrow it
- **▶** expands AI-generated description on demand
- Spells are **greyed out** when that spell slot level is full
- **AI-highlighted** spells (from the AI tab suggestion) show with a gold border

### Managing Prepared Spells

Once you've added spells to your list:

```
PREPARED  ·  6 spells
  L2  Barkskin  buff · 9 rds     [⚡ Cast]  [▶]  [✕]
  L3  Call Lightning             [⚡ Cast]  [▶]  [✕]
```

Click **⚡ Cast** to cast a spell:
- **⚡ Instant** — expends the slot immediately (no duration tracking)
- **[rds] ⏱ Track** — enter the number of rounds and track it in the Active Spells panel

### Active Spells (duration tracking)

```
ACTIVE SPELLS
  L2  Barkskin    ▓▓▓▓▓▓░░  7 rds / 9     [▶]  [×]
  L3  Call Lightning  ∞ ongoing            [▶]  [×]
```

- Click **⏭ Next Round** to advance all durations by 1 round
- Bars turn yellow then red as spells near expiry
- **[×]** dismisses a spell early

### Reloading Spell Data

The built-in list has 2,203 spells. To use a custom XLSX (e.g. a homebrew compendium):
1. Click **⟳ Reload XLSX**
2. Pick an `.xlsx` file with columns: `Spell Name`, `Level`, `Category`, `Sphere`/`School`, `Damage Dice`

---

## Tab 4 — ✦ CP (Character Points)

Used for **Player's Option: Skills & Powers** custom class creation.

```
CP Budget: [120]    (Priest 120 base)
Spent: 45    Refund: 10    Remaining: 85
▓▓▓▓▓░░░░░░░░░░░

PRESETS: Generic Druid (50)  Combat Druid (65)  ...

SPHERES OF ACCESS
[✓] All        [✓] Animal    [ ] Astral    [✓] Elemental
[✓] Healing    [ ] Necromantic  [✓] Plant   [ ] Weather

MAJOR SPHERES (full access)
[✓] Animal  [✓] Plant

MINOR SPHERES (spells up to L3 only)
[✓] Healing

SPECIAL ABILITIES
[✓] Shapechange (15 CP)   [✓] Turn undead (15 CP)

LIMITATIONS
[✓] Armor: Chain or lighter  (+5 CP refund)
```

- **Priests** start with 120 CP; **Wizards** with 40 CP
- Select spheres/schools, abilities, and limitations to build a custom class
- Sphere/school selection also **filters the Spells tab** to show only accessible spells
- **Presets** apply a pre-built configuration for common archetypes (Priests only)
- **CLEAR** resets all selections

---

## Tab 5 — SHEET

A formatted text character sheet — useful for a quick overview or copy-paste.

```
═══════════════════════════════════════════
CHARACTER SHEET
═══════════════════════════════════════════
Character    Aelindra           Level    5
Race         Elf                Class    Druid
Alignment    True Neutral       Kit      Totemic Druid
HP  28  |  AC  8  |  THAC0  15

ABILITY SCORES
  STR  16 (+1/+1)   DEX  14 (AC+0)
  CON  15 (+1/die)  INT  10
  WIS  16 (+2sv)    CHA  15

SAVING THROWS
  Para/Poison 10  Rod/Staff 14  Petrify 13
  Breath 16       Spell 15

SPELL SLOTS  L1:3  L2:3  L3:2  L4:1
...
```

---

## Tab 6 — NOTES

A free-text area for anything: backstory, equipment lists, NPC names, quest notes.

- Plain text, auto-saved with the character
- No formatting — just type

---

## Tab 7 — ✦ AI

Two AI-powered tools (requires the Anthropic API key to be configured on the server).

### Spell Search

```
[spells] [gen]

Ask anything about AD&D 2e spells...
┌──────────────────────────────────────┐
│ What are the best 2nd level combat   │
│ spells for a druid?                  │
└──────────────────────────────────────┘
[🔍 Search]

Result streams in:
  The best combat options at L2 for a Druid are:
  **Barkskin** — grants AC bonus...
  **Flame Blade** — creates a weapon dealing 1d4+2 damage...
```

- Results stream in real-time
- Spell names mentioned in **bold** are **highlighted in gold** in the Spells tab

### Character Generator

```
[spells] [gen]

Describe a character concept:
┌──────────────────────────────────────┐
│ A grizzled dwarven fighter who       │
│ worships a forge god                 │
└──────────────────────────────────────┘
[✨ Generate]

Generated:
  Name: Bromdar Ironhallow
  Race: Dwarf · Class: Fighter · Level 4
  STR 18/45  DEX 11  CON 17  INT 9  WIS 13  CHA 8
  Alignment: Lawful Good  HP: 38
  Background: "A veteran of the siege of Kharak Dûm..."

  [↙ Apply to Sheet]    [🎲 Suggest Spells]
```

- **Apply to Sheet** fills in all stats instantly — you can edit anything afterward
- **🎲 Suggest Spells** (for spellcasters) asks the AI to pick thematic spells from the compendium — they appear highlighted in the Spells tab

---

## Saving Your Character

| Method | How | Best for |
|--------|-----|----------|
| **Auto-save** | Automatic, always on | Not losing work mid-session |
| **💾 Save (JSON)** | Downloads a `.json` file | Backing up, moving between devices |
| **📂 Load (JSON)** | Uploads the `.json` back | Restoring a backup |
| **PDF Export** | Downloads a `.pdf` file | Printing, sharing with your DM |
| **📂 Load (PDF)** | Uploads your exported PDF | Importing a character from a PDF sheet |
| **☁ Cloud Save** | Saves to Supabase (if configured) | Cross-device, permanent storage |
| **☁ Cloud Load** | Lists your cloud saves | Switching between multiple characters |

> **Tip:** The auto-save is browser-local. Use **💾 Save** before clearing browser data or switching browsers.

---

## Tips & Tricks

- **Stat requirements for Druid kits** — if your stats don't qualify, a warning shows. Enable **DM Override** if your DM allows it anyway.
- **WIS bonus spells** — Priest spell slots automatically include WIS bonus slots per the PHB table.
- **Exceptional Strength** — Warriors with STR 18 unlock the percentile input. 18/00 = maximum strength.
- **Spell filtering** — Sphere/school selections in the CP tab carry over to the Spells tab so you only see spells your class can access.
- **Progress bar** — The XP progress bar turns green and shows **LEVEL UP!** when you've hit the threshold. Level up manually with the +/− on the Level card.
- **First load on Render** — The server sleeps after 15 min on the free tier. First visit may take 30–60 seconds to wake up; hard-refresh once it's awake.
