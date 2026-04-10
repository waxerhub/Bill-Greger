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
  field('Class/Kit', `${ch.cls}${ch.kit ? ` (${ch.kit})` : ''}`, M, y, 220);
  field('Race', ch.race, M + 240, y, 100);
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
  const saveKeys = Object.keys(ch.saves);

  // Saves header
  dl(stX, y, W - M, y, 0.5);
  lbl('Save Type', stX + 2, y + 8);
  lbl('Score', stX + 174, y + 8);
  dl(stX, y + 12, W - M, y + 12, 0.5);

  saveKeys.forEach((s, i) => {
    const sy = y + 14 + i * RH;
    dt(saveNames[s] || s, stX + 2, sy + 12, { size: 8 });
    dr(stX + 170, sy, 30, RH - 2);
    dt(String(ch.saves[s]), stX + 185, sy + 14, { size: 12, bold: true, align: 'center' });
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

  const statBoxes = [
    { l: 'THAC0', v: ch.thac0, s: `Str Adj: ${ch.strB.hit >= 0 ? '+' : ''}${ch.strB.hit}` },
    { l: 'AC', v: ch.ac, s: `Dex Adj: ${dexBonus(ch.adjStats.Dex)}` },
    { l: 'HIT POINTS', v: ch.hp, s: `d${ch.classData?.hd ?? '?'}` },
    { l: 'DMG ADJ', v: ch.strB.dmg >= 0 ? `+${ch.strB.dmg}` : String(ch.strB.dmg), s: `Str ${ch.adjStats.Str}` },
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
    const roll = Math.max(1, Math.min(20, ch.thac0 - tgt));
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

  // Save file
  const filename = `${(ch.charName || 'character').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'character'}_2e_sheet.pdf`;
  doc.save(filename);
}
