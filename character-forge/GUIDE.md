# Character Forge — Crash Course

**AD&D 2nd Edition character tool** · Web app · Works on desktop & mobile

---

## Quick Start

1. Open the app in your browser
2. The app **auto-saves** every change to your browser — no manual save required for local use
3. Your character persists across page refreshes

---

## The Header

![Stats tab overview](docs/01-stats-filled.png)

The top bar shows your character's **name, class, level, HP, AC, THAC0, and CP** at a glance. All values update live as you edit.

### Header Buttons

| Button | What it does |
|--------|-------------|
| **NEW** | Clear everything and start a fresh character (no confirmation — use Save first!) |
| **PDF** | Export a formatted character sheet as a PDF file |
| **💾 Save** | Download the character as a `.json` file to your device |
| **📂 Load** | Load a `.json` file **or** import a Character Forge PDF (AI reads it) |
| **☁ Cloud Save** | Save to Supabase cloud (requires Supabase configured) |
| **☁ Cloud Load** | Browse and load your cloud-saved characters |

---

## Tab 1 — STATS

The main character creation tab. Set everything here first.

![Stats tab with character filled in](docs/01-stats-filled.png)

### Race & Class

- **Race** dropdown: Human, Elf, Half-Elf, Dwarf, Gnome, Halfling, Half-Orc
- **Class** dropdown: Fighter, Ranger, Paladin, Cleric, Druid, Mage, Illusionist, Thief, Bard
- Racial stat adjustments are shown below the race selector (e.g. "Dex+1, Con-1" for Elf)

### Kit

- **Druids**: choose a specialty kit (Totemic Druid, Shapeshifter, etc.) from the dropdown
- **All other classes**: free-text field — type anything (e.g. "Eldritch Knight")
- If a kit has stat requirements you don't meet, a warning appears with a **DM Override** checkbox

### Level

- Use **−/+** buttons or type directly in the Level field (1–20)

### Experience

- The **EXPERIENCE** card shows your current XP (editable) and the XP threshold for next level
- A progress bar fills toward the next level — turns green and shows **LEVEL UP!** when you've earned enough
- Quick-add buttons: **+100**, **+500**, **+1k** for fast entry after a session

### Hit Points

- Type directly or use **−/+** to track damage mid-session
- **ROLL NdX** button rolls HD × level + CON bonus automatically

### Ability Scores

Six stat cards (STR, DEX, CON, INT, WIS, CHA) each show the derived mechanical effects (to-hit, AC adjustment, HP per die, saving throw bonus, bonus spells, etc.) calculated from the PHB tables.

**Rolling stats** — three methods available top-right:
- **3d6** — classic straight roll
- **3d6 reroll 1s** — reroll any die showing 1
- **4d6 drop lowest** — roll 4, discard the lowest

Click one of the method buttons, then **ROLL** to open the roll modal. Use **ASSIGN** to drag-and-drop each result to a stat.

**Exceptional Strength:** Warriors with STR 18 get a percentile input (18/01 – 18/00) for exceptional strength.

---

## Tab 2 — COMBAT

Read-only combat reference — all values calculated from your stats and level.

![Combat tab](docs/02-combat-filled.png)

- **THAC0** — updates based on class, level, and STR bonus
- **AC** — base 10, adjusted by DEX modifier; add armor separately via the Notes tab
- **HP** — mirrors the value from the Stats tab
- **DMG ADJ** — STR damage bonus
- **Saving Throws** — five categories, calculated per class/level tables
- **Spell Slots** — shows used/available for each spell level (red when full); slots refill from the Spells tab
- **Memorized** — lists all prepared spells as tags with a click-to-remove **×**

---

## Tab 3 — SPELLS

The spell management center. Requires selecting a spellcasting class on the Stats tab.

![Spells tab](docs/03-spells-filled.png)

### Compendium

The bottom section lists the full spell database (2,203 spells), filtered to your class's accessible spells:

- **Search** box — filter by name
- **Level filter** — show only spells of a specific level
- **[+]** button — prepare the spell (adds it to your memorized list)
- **▶** — expands an AI-generated description on demand
- Spells already at capacity for that slot level appear **greyed out**
- Spells highlighted by the AI tab show with a **gold border**

### Prepared Spells

The top section shows spells you've memorized. Click **⚡ Cast** to cast a spell:
- **Instant** — expends the slot immediately
- **Track** — enter a round count and track it in the Active Spells panel

### Active Spells (duration tracking)

Active timed spells show a progress bar counting down. Click **⏭ Next Round** (top of tab) to advance all durations by 1 round. Bars turn yellow then red as spells near expiry. **[×]** dismisses early.

### Reloading Spell Data

Click **⟳ Reload XLSX** to load a custom `.xlsx` file (columns: `Spell Name`, `Level`, `Category`, `Sphere`/`School`, `Damage Dice`).

---

## Tab 4 — ✦ CP (Character Points)

Used for **Player's Option: Skills & Powers** custom class building.

![CP tab](docs/04-cp-filled.png)

- **CP Budget** — Priests start with 120 CP; Wizards with 40 CP
- Spent/Refund/Remaining tracked with a progress bar
- **Presets** — apply a pre-built configuration for common archetypes (Priests only)
- **Spheres of Access** — check which spheres your priest can use; this also **filters the Spells tab** to only accessible spells
- **Major Spheres** — full access (all spell levels)
- **Minor Spheres** — limited access (spells up to level 3 only)
- **Special Abilities** — e.g. Shapechange (15 CP), Turn undead (15 CP)
- **Limitations** — e.g. armor restrictions give back CP as a refund
- **CLEAR** resets all selections

---

## Tab 5 — SHEET

A formatted text character sheet — useful for a quick overview or copy-paste to share with your DM.

![Sheet tab](docs/05-sheet-filled.png)

Shows name, race, class, kit, alignment, HP, AC, THAC0, all ability scores with bonuses, saving throws, spell slots, prepared spells, and notes — all in a clean printable layout.

---

## Tab 6 — NOTES

A free-text area for anything: backstory, equipment lists, NPC names, quest notes.

- Plain text, auto-saved with the character
- No formatting — just type

---

## Tab 7 — ✦ AI

Two AI-powered tools (requires the Anthropic API key configured on the server).

![AI tab](docs/07-ai.png)

### Spell Search

Type a natural language query (e.g. *"best 2nd level combat spells for a druid"*) and click **Search**. Results stream in real-time. Spell names mentioned in the response are **highlighted in gold** in the Spells tab so you can quickly find and prepare them.

### Character Generator

Switch to the **Character Generator** sub-tab. Describe a character concept in plain English (e.g. *"a grizzled dwarven fighter who worships a forge god"*) and click **✨ Generate**.

The AI returns:
- Name, race, class, level
- Full ability scores
- Alignment and HP
- A short backstory paragraph

Click **↙ Apply to Sheet** to fill everything in instantly — you can edit any field afterward. For spellcasters, **🎲 Suggest Spells** asks the AI to pick thematic spells from the compendium, which appear highlighted in the Spells tab.

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

> **Tip:** Auto-save is browser-local. Use **💾 Save** before clearing browser data or switching browsers.

---

## Tips & Tricks

- **Stat requirements for Druid kits** — if your stats don't qualify, a warning shows. Enable **DM Override** if your DM allows it anyway.
- **WIS bonus spells** — Priest spell slots automatically include WIS bonus slots per the PHB table.
- **Exceptional Strength** — Warriors with STR 18 unlock the percentile input. 18/00 = maximum strength.
- **Sphere/school filtering** — selections in the CP tab carry over to the Spells tab so you only see spells your class can access.
- **XP progress bar** — turns green and shows **LEVEL UP!** when you've hit the threshold. Level up manually with the +/− buttons on the Level card.
- **First load on Render** — The server sleeps after 15 min on the free tier. First visit may take 30–60 seconds to wake up; hard-refresh once it's awake.
