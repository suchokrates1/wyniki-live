import { byeCard, slotCard } from './bracketCards.js';
import { competitorKey } from './knockoutLayout.js';

// Where each card and connector of a tree sits, in px. Column c holds 2^(last - c) cells;
// cell i feeds cell floor(i / 2) of the next column through a "]"-shaped connector.
// A connector lights up when the pinned player won the match it leaves.

export const GEOMETRY = { width: 264, gap: 56, height: 72, pitch: 88, top: 36 };
const CHAMP_HEIGHT = 160;
const CHAMP_GAP = 40;

function line(color, width = 2) {
  return `${width}px solid ${color}`;
}

/** Structural round names: imported draws call a final "Runda 2", so the names come from the shape. */
export function roundLabel(tree, column, t = {}) {
  const fromEnd = tree.columns.length - 1 - column;
  const fmt = (text, values) => String(text || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
  if (tree.kind === 'placement' && tree.places) {
    return fromEnd === 0 ? fmt(t.placeMatch, { number: tree.places[0] }) : fmt(t.round, { n: column + 1 });
  }
  if (fromEnd === 0) return t.final || 'Finał';
  if (fromEnd === 1) return t.semifinal || 'Półfinał';
  if (fromEnd === 2) return t.quarterfinal || 'Ćwierćfinał';
  return fmt(t.roundOf, { n: 2 ** fromEnd, players: 2 ** (fromEnd + 1) });
}

export function thirdLabel(tree, t = {}) {
  const fmt = (text, values) => String(text || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
  if (tree.kind === 'placement' && tree.places) return fmt(t.placeMatch, { number: tree.places[0] + 2 });
  if (tree.kind === 'consolation') return fmt(t.placeMatch, { number: 3 });
  return t.thirdPlace || 'Mecz o 3. miejsce';
}

function cellCard(cell, ctx) {
  if (!cell) return null;
  if (cell.type === 'bye') return byeCard(cell.player, ctx);
  return slotCard(cell.slot, ctx);
}

export function treeGeometry(tree, ctx = {}, t = {}, { champion = null } = {}) {
  const { width: W, gap: G, height: H, pitch: P, top: TOP } = GEOMETRY;
  const accent = ctx.accent || 'var(--bt-path)';
  const quiet = ctx.quiet || 'var(--bt-line)';
  const last = tree.columns.length - 1;
  const colX = (column) => column * (W + G);
  const centerY = (column, index) => TOP + (index + 0.5) * P * 2 ** column;

  const cards = [];
  const conns = [];
  const labels = [];
  const grid = tree.columns.map((column, c) => column.cells.map((cell, i) => {
    const card = cellCard(cell, ctx);
    if (card) {
      cards.push({ x: colX(c), y: centerY(c, i) - H / 2, card, round: roundLabel(tree, c, t), key: `${c}-${i}` });
    }
    return card;
  }));

  tree.columns.forEach((_, c) => labels.push({ x: colX(c), y: 0, text: roundLabel(tree, c, t), tone: 'round' }));

  for (let c = 0; c < last; c += 1) {
    const cells = grid[c];
    for (let k = 0; k < cells.length / 2; k += 1) {
      const upper = cells[2 * k];
      const lower = cells[2 * k + 1];
      if (!upper && !lower) continue;
      const parent = grid[c + 1][k];
      const y1 = centerY(c, 2 * k);
      const y2 = centerY(c, 2 * k + 1);
      const y3 = centerY(c + 1, k);
      const x0 = colX(c) + W;
      const upperLit = Boolean(ctx.pinKey) && upper?.winnerKey === ctx.pinKey;
      const lowerLit = Boolean(ctx.pinKey) && lower?.winnerKey === ctx.pinKey;
      const pieces = [];
      if (upper) {
        pieces.push({ lit: upperLit, style: { left: x0, top: y1 - 1, width: G / 2 + 1, height: y3 - y1 + 1, borderTop: line(upperLit ? accent : quiet), borderRight: line(upperLit ? accent : quiet), borderRadius: '0 12px 0 0' } });
      }
      if (lower) {
        pieces.push({ lit: lowerLit, style: { left: x0, top: y3, width: G / 2 + 1, height: y2 - y3 + 1, borderBottom: line(lowerLit ? accent : quiet), borderRight: line(lowerLit ? accent : quiet), borderRadius: '0 0 12px 0' } });
      }
      const stubLit = (upperLit || lowerLit) && Boolean(parent?.pinned);
      pieces.push({ lit: stubLit, style: { left: x0 + G / 2, top: y3 - 1, width: G / 2, height: 2, background: stubLit ? accent : quiet } });
      pieces.sort((a, b) => Number(a.lit) - Number(b.lit)).forEach((piece) => conns.push(piece));
    }
  }

  const finalY = centerY(last, 0);
  let height = TOP + tree.columns[0].cells.length * P;
  let width = colX(last) + W;

  if (tree.third) {
    const top = finalY + H / 2 + 64;
    labels.push({ x: colX(last), y: top - 24, text: thirdLabel(tree, t), tone: 'third' });
    cards.push({ x: colX(last), y: top, card: slotCard(tree.third.slot, ctx), round: thirdLabel(tree, t), key: 'third' });
    height = Math.max(height, top + H + 8);
  }

  let champ = null;
  if (champion?.name) {
    const roomAbove = finalY - H / 2 - CHAMP_GAP - CHAMP_HEIGHT >= TOP;
    const lit = Boolean(ctx.pinKey) && competitorKey(champion.name) === ctx.pinKey;
    if (roomAbove) {
      const y = finalY - H / 2 - CHAMP_GAP - CHAMP_HEIGHT;
      champ = { ...champion, x: colX(last), y, width: W, height: CHAMP_HEIGHT };
      conns.push({ lit, style: { left: colX(last) + W / 2 - 1, top: y + CHAMP_HEIGHT, width: 2, height: CHAMP_GAP, background: lit ? 'var(--bt-gold)' : quiet } });
    } else {
      const x = colX(last) + W + G;
      champ = { ...champion, x, y: finalY - CHAMP_HEIGHT / 2, width: W, height: CHAMP_HEIGHT };
      conns.push({ lit, style: { left: colX(last) + W, top: finalY - 1, width: G, height: 2, background: lit ? 'var(--bt-gold)' : quiet } });
      width = x + W;
      height = Math.max(height, finalY + CHAMP_HEIGHT / 2 + 8);
    }
  }

  return { width, height, cards, conns, labels, champ };
}

/** "left: 10px; top: 4px; …" for Alpine's :style. */
export function styleText(style = {}) {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}: ${typeof value === 'number' ? `${value}px` : value}`)
    .join('; ');
}
