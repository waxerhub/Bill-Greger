import jsPDF from 'jspdf';

// PHB Table 2: DEXTERITY — Defensive Adjustment (positive = worse AC)
function dexBonus(d) {
  if (d <= 1) return 4;
  if (d === 2) return 3;
  if (d === 3) return 3;
  if (d === 4) return 2;
  if (d === 5) return 1;
  if (d <= 14) return 0;
  if (d === 15) return -1; if (d === 16) return -2; if (d === 17) return -3; if (d === 18) return -4;
  if (d <= 20) return -4;
  if (d <= 23) return -5;
  return -6; // 24-25
}

export function exportCharacterSheet(ch) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const W = 612, H = 792, M = 36, CW = W - 2 * M;

  function dt(str, x, y, opts = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 9);
    const c = opts.color || [0, 0, 0];
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(String(str ?? ''), x, y, { align: opts.align || 'left' });
  }
  function dr(x, y, w, h) {
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.rect(x, y, w, h, 'S');
  }
  function dl(x1, y1, x2, y2, lw = 0.5) {
    doc.setDrawColor(0); doc.setLineWidth(lw); doc.line(x1, y1, x2, y2);
  }
  function lbl(str, x, y) { dt(str, x, y, { size: 7, color: [120, 120, 120] }); }

  // ======= PAGE 1: MAIN STATS =======

  // Title
  dt('Advanced Dungeons & Dragons', W / 2, M + 16, { size: 18, bold: true, align: 'center' });
  dt('2nd Edition  —  Player Character Record', W / 2, M + 28, { size: 10, align: 'center' });
  dl(M, M + 34, W - M, M + 34, 1.5);

  let y = M + 50;

  // Character info fields
  // Layout per field: small grey label at top, underline 14pt below, bold value on the line
  function field(label, val, x, fy, fw) {
    lbl(label, x, fy);                                          // small label at top of row
    dl(x, fy + 14, x + fw, fy + 14);                          // underline 14pt below label
    if (val) dt(String(val), x + 2, fy + 13, { size: 10, bold: true }); // value on the line
  }

  field('Character', ch.charName, M, y, 200);
  field('Level', ch.level, M + 220, y, 40);
  field('Alignment', ch.align, M + 275, y, 145);
  y += 20;
  field('Class/Kit', `${ch.cls}${ch.kit ? ` (${ch.kit})` : ''}`, M, y, 200);
  field('Race', ch.race, M + 215, y, 90);
  field('XP', ch.xp != null ? Number(ch.xp).toLocaleString() : '', M + 315, y, 100);
  y += 20;
  field('Patron Deity/Religion', '', M, y, 200);
  field('Place of Origin', '', M + 220, y, 200);
  y += 26;
  dl(M, y, W - M, y, 1);
  y += 12;

  // ---- Ability Scores (left) + Saving Throws (right) ----
  dt('ABILITY SCORES', M, y, { size: 11, bold: true });
  dt('SAVING THROWS', M + 310, y, { size: 11, bold: true });
  y += 10;

  const RH = 22;
  const abilList = [
    { ab: 'STR', key: 'Str' }, { ab: 'DEX', key: 'Dex' }, { ab: 'CON', key: 'Con' },
    { ab: 'INT', key: 'Int' }, { ab: 'WIS', key: 'Wis' }, { ab: 'CHA', key: 'Cha' },
  ];
  const saveNames = {
    Para: 'Paralyzation/Poison/Death', Rod: 'Rod, Staff, or Wand',
    Pet: 'Petrification/Polymorph', Breath: 'Breath Weapon', Spell: 'Spell',
  };

  const stX = M + 308;
  const saveKeys = Object.keys(effSaves);

  // Saves header
  dl(stX, y, W - M, y, 0.5);
  lbl('Save Type', stX + 2, y + 8);
  lbl('Score', stX + 174, y + 8);
  dl(stX, y + 12, W - M, y + 12, 0.5);

  saveKeys.forEach((s, i) => {
    const sy = y + 14 + i * RH;
    dt(saveNames[s] || s, stX + 2, sy + 12, { size: 8 });
    dr(stX + 170, sy, 30, RH - 2);
    dt(String(effSaves[s]), stX + 185, sy + 14, { size: 12, bold: true, align: 'center' });
  });

  // Ability scores
  abilList.forEach(({ ab, key }, i) => {
    const ay = y + 2 + i * RH;
    const raw = ch.stats[key] || 10;
    const adj = ch.raceData?.adj?.[key] ?? 0;
    const fin = raw + adj;

    dt(ab, M, ay + 14, { size: 13, bold: true });
    dr(M + 38, ay + 2, 26, RH - 4);
    dt(String(fin), M + 51, ay + 15, { size: 12, bold: true, align: 'center' });

    if (adj !== 0) lbl(`(${raw}${adj > 0 ? '+' : ''}${adj})`, M + 68, ay + 14);

    const mx = M + 110;
    if (ab === 'STR') {
      lbl('Hit Adj', mx, ay + 8); dr(mx + 36, ay + 2, 22, (RH - 4) / 2 + 1);
      dt(ch.strB.hit >= 0 ? `+${ch.strB.hit}` : String(ch.strB.hit), mx + 47, ay + 10, { size: 8, bold: true, align: 'center' });
      lbl('Dmg Adj', mx, ay + 18); dr(mx + 36, ay + 2 + (RH - 4) / 2 + 1, 22, (RH - 4) / 2 - 1);
      dt(ch.strB.dmg >= 0 ? `+${ch.strB.dmg}` : String(ch.strB.dmg), mx + 47, ay + 20, { size: 8, bold: true, align: 'center' });
    } else if (ab === 'DEX') {
      lbl('Def Adj', mx, ay + 14); dr(mx + 36, ay + 2, 22, RH - 4);
      dt(String(dexBonus(fin)), mx + 47, ay + 14, { size: 8, bold: true, align: 'center' });
    } else if (ab === 'CON') {
      lbl('HP/die', mx, ay + 14); dr(mx + 36, ay + 2, 22, RH - 4);
      dt(ch.conB >= 0 ? `+${ch.conB}` : String(ch.conB), mx + 47, ay + 14, { size: 8, bold: true, align: 'center' });
    } else if (ab === 'INT') {
      lbl('Add Profs', mx, ay + 14); dr(mx + 46, ay + 2, 22, RH - 4);
    } else if (ab === 'WIS') {
      lbl('Mag Def', mx, ay + 8); lbl('Bonus Sp', mx, ay + 17);
      dr(mx + 46, ay + 2, 22, RH - 4);
    } else if (ab === 'CHA') {
      lbl('Max Hench', mx, ay + 14); dr(mx + 52, ay + 2, 22, RH - 4);
    }
  });

  y += 12 + abilList.length * RH;
  dl(M, y, W - M, y, 1);
  y += 12;

  // ---- COMBAT ----
  dt('COMBAT', W / 2, y + 10, { size: 11, bold: true, align: 'center' });
  y += 18;

  const effStrB = ch.effStrB ?? ch.strB;
  const effThac0 = ch.effThac0 ?? ch.thac0;
  const effAC = ch.effAC ?? ch.ac;
  const effHP = ch.effHP ?? ch.hp;
  const effSaves = ch.effSaves ?? ch.saves;

  const acSub = ch.gearBaseAC != null
    ? `Armor:${ch.gearBaseAC} Dex:${dexBonus(ch.adjStats.Dex)}${ch.gearAC ? ` Ring:+${ch.gearAC}` : ''}`
    : `Dex Adj: ${dexBonus(ch.adjStats.Dex)}${ch.gearAC ? ` Gear:+${ch.gearAC}` : ''}`;
  const thac0Sub = `Str:${effStrB.hit >= 0 ? '+' : ''}${effStrB.hit}${ch.gearThac0 ? ` Gear:-${ch.gearThac0}` : ''}`;

  const statBoxes = [
    { l: 'THAC0', v: effThac0, s: thac0Sub },
    { l: 'AC', v: effAC, s: acSub },
    { l: 'HIT POINTS', v: effHP, s: `d${ch.classData?.hd ?? '?'}${ch.gearHP ? ` +${ch.gearHP}` : ''}` },
    { l: 'DMG ADJ', v: effStrB.dmg >= 0 ? `+${effStrB.dmg}` : String(effStrB.dmg), s: `Str ${ch.adjStats.Str}` },
  ];
  const bW = (CW - 15) / 4;
  statBoxes.forEach((b, i) => {
    const bx = M + i * (bW + 5);
    dr(bx, y, bW, 42);
    lbl(b.l, bx + 4, y + 8);
    dt(String(b.v), bx + bW / 2, y + 29, { size: 18, bold: true, align: 'center' });
    lbl(b.s, bx + 4, y + 39);
  });
  y += 50;

  // THAC0 Attack Matrix
  dt("Target's AC", M, y + 10, { size: 8, bold: true });
  dt('To Hit #', M, y + 24, { size: 8, bold: true });
  const tgts = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10];
  const tW = (CW - 60) / tgts.length;
  const tStartX = M + 60;
  dl(M, y + 14, W - M, y + 14, 0.5);
  dl(M, y + 28, W - M, y + 28, 0.5);
  tgts.forEach((tgt, i) => {
    const tx = tStartX + i * tW;
    dl(tx, y, tx, y + 28, 0.3);
    dt(String(tgt), tx + tW / 2, y + 11, { size: 7, align: 'center' });
    const roll = Math.max(1, Math.min(20, effThac0 - tgt));
    dt(String(roll), tx + tW / 2, y + 25, { size: 8, bold: true, align: 'center' });
  });
  dl(M, y, M, y + 28, 0.5);
  dl(W - M, y, W - M, y + 28, 0.5);
  y += 36;

  // Combat Modifiers row
  dt('COMBAT MODIFIERS', W / 2, y + 8, { size: 9, bold: true, align: 'center' });
  y += 14;
  const modW = (CW - 10) / 3;
  ['To Hit Modifiers', 'Damage Modifiers', 'AC Modifiers'].forEach((label, i) => {
    const mx = M + i * (modW + 5);
    dr(mx, y, modW * 0.75, 14); dr(mx + modW * 0.75, y, modW * 0.25, 14);
    dt(label, mx + 3, y + 10, { size: 7, bold: true });
    lbl('+/-', mx + modW * 0.75 + 3, y + 10);
  });
  lbl('Non-proficiency penalty', M + 3, y + 24);
  for (let row = 0; row < 4; row++) {
    ['', '', ''].forEach((_, i) => {
      const mx = M + i * (modW + 5);
      dr(mx, y + 14 + row * 14, modW * 0.75, 14); dr(mx + modW * 0.75, y + 14 + row * 14, modW * 0.25, 14);
    });
  }
  y += 14 * 5 + 10;

  // Weapon Combat Table
  dt('WEAPON COMBAT', W / 2, y + 8, { size: 10, bold: true, align: 'center' });
  y += 14;
  const wCols = [
    { h: 'Weapon', p: 0.27 }, { h: '#AT', p: 0.06 }, { h: 'Size', p: 0.07 },
    { h: 'Type', p: 0.07 }, { h: 'Speed', p: 0.09 }, { h: 'Hit/Dmg', p: 0.11 },
    { h: 'Damage', p: 0.14 }, { h: 'Range/Special', p: 0.19 }
  ];
  const drawWeaponRow = (rowY, isHeader) => {
    let wx = M;
    wCols.forEach(col => {
      const cw = Math.floor(col.p * CW);
      dr(wx, rowY, cw, 14);
      if (isHeader) dt(col.h, wx + cw / 2, rowY + 10, { size: 7, align: 'center' });
      else if (col.h === 'Hit/Dmg' || col.h === 'Damage') lbl('/', wx + cw / 2 - 1, rowY + 10);
      wx += cw;
    });
  };
  drawWeaponRow(y, true);
  for (let row = 0; row < 7; row++) { y += 14; drawWeaponRow(y, false); }
  y += 22;

  // Proficiencies
  if (y < H - 90) {
    dt('PROFICIENCIES', W / 2, y + 8, { size: 10, bold: true, align: 'center' });
    y += 14;
    const pcW = CW / 3;
    for (let col = 0; col < 3; col++) {
      const px = M + col * pcW;
      dr(px, y, pcW * 0.70, 13); dr(px + pcW * 0.70, y, pcW * 0.15, 13); dr(px + pcW * 0.85, y, pcW * 0.15, 13);
      dt('Proficiency', px + 3, y + 9, { size: 7, bold: true });
      dt('Slots', px + pcW * 0.70 + 2, y + 9, { size: 7, bold: true });
      dt('Chk', px + pcW * 0.85 + 2, y + 9, { size: 7, bold: true });
    }
    const profRows = Math.min(7, Math.floor((H - y - 40) / 13));
    for (let row = 0; row < profRows; row++) {
      y += 13;
      for (let col = 0; col < 3; col++) {
        const px = M + col * pcW;
        dr(px, y, pcW * 0.70, 13); dr(px + pcW * 0.70, y, pcW * 0.15, 13); dr(px + pcW * 0.85, y, pcW * 0.15, 13);
      }
    }
  }

  // Page 1 footer
  lbl(`${ch.charName || 'Unnamed'} — ${ch.race} ${ch.cls} Lv${ch.level}`, M, H - 18);
  lbl('AD&D 2nd Edition Character Sheet', W - M, H - 18);

  // ======= PAGE 2: SPELLS, CP & NOTES =======
  doc.addPage();
  y = M;

  dt('Advanced Dungeons & Dragons — 2nd Edition', W / 2, y + 14, { size: 14, bold: true, align: 'center' });
  dt(`${ch.charName || 'Unnamed'}  |  ${ch.race} ${ch.cls}${ch.kit ? ` (${ch.kit})` : ''}  |  Level ${ch.level}  |  ${ch.align}`, W / 2, y + 28, { size: 9, align: 'center' });
  dl(M, y + 34, W - M, y + 34, 1);
  y += 48;

  // Spell slots
  if (ch.adjSlots.length > 0) {
    dt('WIZARD & PRIEST SPELLS', W / 2, y, { size: 11, bold: true, align: 'center' });
    y += 14;
    dt('Spells per Level:', M, y + 14, { size: 9, bold: true });
    const sW = 38;
    ch.adjSlots.forEach((slots, i) => {
      const sx = M + 115 + i * (sW + 3);
      lbl(`L${i + 1}`, sx + sW / 2 - 4, y + 8);
      dr(sx, y + 10, sW, 16);
      dt(String(slots), sx + sW / 2, y + 21, { size: 12, bold: true, align: 'center' });
    });
    y += 36;

    if (ch.isPriest && (ch.cpMajor.length > 0 || ch.cpMinor.length > 0)) {
      dt('Spheres Available / Opposition Schools', M, y, { size: 9, bold: true });
      y += 14;
      if (ch.cpMajor.length > 0) {
        dt('Major:', M, y, { size: 9, bold: true });
        const lines = doc.splitTextToSize(ch.cpMajor.join(', '), CW - 48);
        lines.forEach((l, j) => dt(l, M + 42, y + j * 13, { size: 9 }));
        y += lines.length * 13 + 4;
      }
      if (ch.cpMinor.length > 0) {
        dt('Minor:', M, y, { size: 9, bold: true });
        const lines = doc.splitTextToSize(ch.cpMinor.join(', '), CW - 48);
        lines.forEach((l, j) => dt(l, M + 42, y + j * 13, { size: 9 }));
        y += lines.length * 13 + 4;
      }
    } else if (ch.isWizard && ch.cpSchools.length > 0) {
      dt('Schools of Magic:', M, y, { size: 9, bold: true });
      const lines = doc.splitTextToSize(`Universal, ${ch.cpSchools.join(', ')}`, CW - 110);
      lines.forEach((l, j) => dt(l, M + 108, y + j * 13, { size: 9 }));
      y += lines.length * 13 + 4;
    }

    dl(M, y, W - M, y, 0.5);
    y += 12;
  }

  // Memorized Spells
  if (ch.memorized.length > 0) {
    dt('MEMORIZED SPELLS', W / 2, y, { size: 10, bold: true, align: 'center' });
    y += 16;
    const byLevel = {};
    ch.memorized.forEach(s => {
      const lv = String(s.Level);
      if (!byLevel[lv]) byLevel[lv] = [];
      byLevel[lv].push(s['Spell Name']);
    });
    Object.keys(byLevel).sort((a, b) => +a - +b).forEach(lv => {
      if (y > H - 50) { doc.addPage(); y = M + 20; }
      dt(`Level ${lv}:`, M, y, { size: 9, bold: true });
      const spLines = doc.splitTextToSize(byLevel[lv].join('   |   '), CW - 60);
      spLines.forEach((l, j) => dt(l, M + 55, y + j * 13, { size: 9 }));
      y += Math.max(spLines.length, 1) * 13 + 4;
    });
    dl(M, y, W - M, y, 0.5);
    y += 12;
  }

  // Special Powers
  if (ch.cpAbil.length > 0) {
    dt('SPECIAL POWERS/BENEFITS', M, y, { size: 10, bold: true });
    y += 14;
    ch.cpAbil.forEach(a => {
      if (y > H - 40) { doc.addPage(); y = M + 20; }
      dt(`• ${a}`, M + 10, y, { size: 9 });
      y += 13;
    });
    y += 6;
  }

  // Hindrances
  if (ch.cpLim.length > 0) {
    dt('SPECIAL HINDRANCES', M, y, { size: 10, bold: true });
    y += 14;
    ch.cpLim.forEach(l => {
      if (y > H - 40) { doc.addPage(); y = M + 20; }
      dt(`• ${l}`, M + 10, y, { size: 9 });
      y += 13;
    });
    y += 6;
  }

  // CP summary
  if (ch.isPriest || ch.isWizard) {
    dl(M, y, W - M, y, 0.5);
    y += 12;
    dt(`CP Budget: ${ch.cpBudget}  |  Spent: ${ch.cpSpent}  |  Refund: ${ch.cpRefund}  |  Net: ${ch.cpSpent - ch.cpRefund}/${ch.cpBudget}`, M, y, { size: 9 });
    y += 18;
  }

  // Notes
  if (ch.notes?.trim()) {
    dl(M, y, W - M, y, 0.5);
    y += 12;
    dt('NOTES', W / 2, y, { size: 10, bold: true, align: 'center' });
    y += 16;
    const noteLines = doc.splitTextToSize(ch.notes.trim(), CW);
    noteLines.forEach(l => {
      if (y > H - 30) { doc.addPage(); y = M + 20; }
      dt(l, M, y, { size: 9 });
      y += 13;
    });
  }

  // Page 2 footer
  lbl(`${ch.charName || 'Unnamed'} — ${ch.race} ${ch.cls} Lv${ch.level}`, M, H - 18);
  lbl('AD&D 2nd Edition', W - M, H - 18);

  // ======= PAGE 3: MAGIC ITEMS & INVENTORY =======
  const gear = ch.equippedGear || [];
  const inv  = ch.inventory || [];
  if (gear.length > 0 || inv.length > 0) {
    doc.addPage();
    y = M;
    dt('Advanced Dungeons & Dragons — 2nd Edition', W / 2, y + 14, { size: 14, bold: true, align: 'center' });
    dt(`${ch.charName || 'Unnamed'}  |  ${ch.race} ${ch.cls}  |  Level ${ch.level}`, W / 2, y + 28, { size: 9, align: 'center' });
    dl(M, y + 34, W - M, y + 34, 1);
    y += 50;

    // Helper: format an effects object into a compact string
    function fxStr(e) {
      if (!e) return '';
      const parts = [];
      if (e.acMode === 'base' && e.ac) parts.push(`Base AC: ${e.ac}`);
      else if (e.ac) parts.push(`AC: +${e.ac}`);
      if (e.thac0) parts.push(`THAC0: +${e.thac0}`);
      if (e.dmg)   parts.push(`Dmg: +${e.dmg}`);
      if (e.saves) {
        const sl = e.savesTypes && e.savesTypes.length ? e.savesTypes.join('/') : 'All saves';
        parts.push(`Saves +${e.saves} (${sl})`);
      }
      if (e.str)   parts.push(`STR: +${e.str}`);
      if (e.dex)   parts.push(`DEX: +${e.dex}`);
      if (e.con)   parts.push(`CON: +${e.con}`);
      if (e.int)   parts.push(`INT: +${e.int}`);
      if (e.wis)   parts.push(`WIS: +${e.wis}`);
      if (e.cha)   parts.push(`CHA: +${e.cha}`);
      if (e.hp)    parts.push(`HP: +${e.hp}`);
      if (e.bonusDmgDice && e.bonusDmgType) {
        const mode = e.specialDmgMode === 'breath' ? 'Breath' : 'Bonus Dmg';
        parts.push(`${mode}: ${e.bonusDmgDice}d${e.bonusDmgDie || 6} ${e.bonusDmgType}`);
      }
      return parts.join('  ·  ');
    }

    if (gear.length > 0) {
      dt('EQUIPPED MAGIC ITEMS', W / 2, y, { size: 11, bold: true, align: 'center' });
      y += 14;

      // Column widths
      const colW = [CW * 0.30, CW * 0.15, CW * 0.40, CW * 0.15];
      const colX = [M, M + colW[0], M + colW[0] + colW[1], M + colW[0] + colW[1] + colW[2]];
      const hdrs = ['Item Name', 'Type', 'Bonuses', 'Source'];
      const RH2 = 14;

      // Header row
      dl(M, y, W - M, y, 0.5);
      hdrs.forEach((h, i) => lbl(h, colX[i] + 2, y + 9));
      dl(M, y + 11, W - M, y + 11, 0.5);
      y += 13;

      gear.forEach(item => {
        if (y > H - 50) { doc.addPage(); y = M + 20; }
        const label = item.tierLabel ? `${item.name} (${item.tierLabel})` : item.name;
        const bonuses = fxStr(item.effects);

        // Name (bold)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(0, 0, 0);
        const nameLines = doc.splitTextToSize(label, colW[0] - 4);
        nameLines.forEach((l, j) => doc.text(l, colX[0] + 2, y + 9 + j * 10));

        // Type
        dt(item.type || '', colX[1] + 2, y + 9, { size: 7 });

        // Bonuses (may wrap)
        const bLines = doc.splitTextToSize(bonuses || '—', colW[2] - 4);
        bLines.forEach((l, j) => dt(l, colX[2] + 2, y + 9 + j * 10, { size: 7 }));

        // Source
        const srcLines = doc.splitTextToSize(item.source || '', colW[3] - 4);
        srcLines.forEach((l, j) => lbl(l, colX[3] + 2, y + 9 + j * 10));

        const rowH = Math.max(nameLines.length, bLines.length, srcLines.length) * 10 + 4;
        dl(M, y + rowH, W - M, y + rowH, 0.2);
        y += rowH;
      });

      // Active spell buffs
      if (ch.activeBuffs && ch.activeBuffs.length > 0) {
        y += 6;
        dt('Active Spell Effects: ', M, y, { size: 8, bold: true });
        dt(ch.activeBuffs.join(', '), M + 110, y, { size: 8 });
        y += 14;
      }

      y += 10;
    }

    if (inv.length > 0) {
      if (y > H - 80) { doc.addPage(); y = M + 20; }
      dt('INVENTORY', W / 2, y, { size: 11, bold: true, align: 'center' });
      y += 14;

      const iCols = [CW * 0.40, CW * 0.08, CW * 0.10, CW * 0.10, CW * 0.32];
      const iX = [M, M+iCols[0], M+iCols[0]+iCols[1], M+iCols[0]+iCols[1]+iCols[2], M+iCols[0]+iCols[1]+iCols[2]+iCols[3]];
      const iHdrs = ['Item', 'Qty', 'Weight', 'Cost', 'Notes'];
      dl(M, y, W - M, y, 0.5);
      iHdrs.forEach((h, i) => lbl(h, iX[i] + 2, y + 9));
      dl(M, y + 11, W - M, y + 11, 0.5);
      y += 13;

      inv.forEach(item => {
        if (y > H - 30) { doc.addPage(); y = M + 20; }
        const nLines = doc.splitTextToSize(item.name || '', iCols[0] - 4);
        const ntLines = doc.splitTextToSize(item.notes || '', iCols[4] - 4);
        nLines.forEach((l, j) => dt(l, iX[0] + 2, y + 9 + j * 10, { size: 8, bold: true }));
        dt(String(item.qty ?? ''), iX[1] + 2, y + 9, { size: 8 });
        dt(item.weight ? String(item.weight) : '', iX[2] + 2, y + 9, { size: 8 });
        dt(item.cost ? String(item.cost) : '', iX[3] + 2, y + 9, { size: 8 });
        ntLines.forEach((l, j) => lbl(l, iX[4] + 2, y + 9 + j * 10));
        const rh = Math.max(nLines.length, ntLines.length) * 10 + 4;
        dl(M, y + rh, W - M, y + rh, 0.2);
        y += rh;
      });
    }

    // Page 3 footer
    lbl(`${ch.charName || 'Unnamed'} — ${ch.race} ${ch.cls} Lv${ch.level}`, M, H - 18);
    lbl('AD&D 2nd Edition — Magic Items & Inventory', W - M, H - 18);
  }

  // Save file
  const filename = `${(ch.charName || 'character').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'character'}_2e_sheet.pdf`;
  doc.save(filename);
}
