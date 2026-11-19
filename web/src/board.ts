import { BLACK, EMPTY, WHITE, coordLabel } from './wasm.js';

export interface BoardRenderOptions {
  size: number;
  grid: Uint8Array;
  liberties?: Uint8Array;
  territory?: Uint8Array | null;
  deadPoints?: Uint8Array | null;
  lastMove: number;
  ghostPoint: number;
  pulsePoints?: number[];
  showHelpers: boolean;
  highContrast: boolean;
  disabled?: boolean;
  onSelectPoint: (idx: number) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function starPoints(size: number): number[] {
  const pts: number[] = [];
  const add = (r: number, c: number) => pts.push(r * size + c);
  if (size === 5) {
    add(2, 2);
  } else if (size === 7) {
    add(2, 2); add(2, 4); add(4, 2); add(4, 4); add(3, 3);
  } else if (size === 9) {
    add(2, 2); add(2, 6); add(6, 2); add(6, 6); add(4, 4);
  } else if (size === 13) {
    for (const r of [3, 6, 9]) for (const c of [3, 6, 9]) add(r, c);
  } else if (size === 19) {
    for (const r of [3, 9, 15]) for (const c of [3, 9, 15]) add(r, c);
  }
  return pts;
}

export function renderBoard(container: HTMLElement, opts: BoardRenderOptions): void {
  const { size, grid, liberties, territory, deadPoints, lastMove, ghostPoint, pulsePoints = [], showHelpers, highContrast, disabled, onSelectPoint } = opts;

  const pad = 28;
  const cell = 36;
  const boardSpan = (size - 1) * cell;
  const total = boardSpan + pad * 2;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
  svg.setAttribute('class', 'go-board');
  svg.setAttribute('role', 'grid');
  svg.setAttribute('aria-label', `${size} by ${size} Go board`);

  // Board background
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(total));
  bg.setAttribute('height', String(total));
  bg.setAttribute('rx', '10');
  bg.setAttribute('class', 'board-bg');
  svg.appendChild(bg);

  // Grid lines
  for (let i = 0; i < size; i++) {
    const pos = pad + i * cell;
    const h = document.createElementNS(SVG_NS, 'line');
    h.setAttribute('x1', String(pad));
    h.setAttribute('y1', String(pos));
    h.setAttribute('x2', String(pad + boardSpan));
    h.setAttribute('y2', String(pos));
    h.setAttribute('class', 'board-line');
    svg.appendChild(h);

    const v = document.createElementNS(SVG_NS, 'line');
    v.setAttribute('x1', String(pos));
    v.setAttribute('y1', String(pad));
    v.setAttribute('x2', String(pos));
    v.setAttribute('y2', String(pad + boardSpan));
    v.setAttribute('class', 'board-line');
    svg.appendChild(v);
  }

  // Star points
  for (const sp of starPoints(size)) {
    const r = Math.floor(sp / size);
    const c = sp % size;
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(pad + c * cell));
    dot.setAttribute('cy', String(pad + r * cell));
    dot.setAttribute('r', '3');
    dot.setAttribute('class', 'star-point');
    svg.appendChild(dot);
  }

  const pulseSet = new Set(pulsePoints);

  // Intersections
  for (let idx = 0; idx < size * size; idx++) {
    const r = Math.floor(idx / size);
    const c = idx % size;
    const cx = pad + c * cell;
    const cy = pad + r * cell;
    const stone = grid[idx];
    const libs = liberties ? liberties[idx] : 0;

    // Territory wash at game end
    if (territory && territory[idx] !== EMPTY && stone === EMPTY) {
      const wash = document.createElementNS(SVG_NS, 'rect');
      wash.setAttribute('x', String(cx - cell * 0.32));
      wash.setAttribute('y', String(cy - cell * 0.32));
      wash.setAttribute('width', String(cell * 0.64));
      wash.setAttribute('height', String(cell * 0.64));
      wash.setAttribute('rx', '4');
      wash.setAttribute('class', territory[idx] === BLACK ? 'terr-black' : 'terr-white');
      svg.appendChild(wash);
    }

    // Liberty dots in helper/ELI5 mode on empty points adjacent to a stone
    if (showHelpers && stone === EMPTY) {
      const adjBlack = hasAdjacent(grid, size, r, c, BLACK);
      const adjWhite = hasAdjacent(grid, size, r, c, WHITE);
      if (adjBlack || adjWhite) {
        const ldot = document.createElementNS(SVG_NS, 'circle');
        ldot.setAttribute('cx', String(cx));
        ldot.setAttribute('cy', String(cy));
        ldot.setAttribute('r', '3.5');
        ldot.setAttribute('class', 'liberty-dot');
        svg.appendChild(ldot);
      }
    }

    // Stone
    if (stone !== EMPTY) {
      const isDead = deadPoints ? deadPoints[idx] !== 0 : false;
      const st = document.createElementNS(SVG_NS, 'circle');
      st.setAttribute('cx', String(cx));
      st.setAttribute('cy', String(cy));
      st.setAttribute('r', String(cell * 0.44));
      st.setAttribute('class', `${stone === BLACK ? 'stone-black' : 'stone-white'}${isDead ? ' dead-stone' : ''}`);
      svg.appendChild(st);

      if (isDead) {
        const d = cell * 0.22;
        const x1 = document.createElementNS(SVG_NS, 'line');
        x1.setAttribute('x1', String(cx - d));
        x1.setAttribute('y1', String(cy - d));
        x1.setAttribute('x2', String(cx + d));
        x1.setAttribute('y2', String(cy + d));
        x1.setAttribute('class', 'dead-mark');
        const x2 = document.createElementNS(SVG_NS, 'line');
        x2.setAttribute('x1', String(cx + d));
        x2.setAttribute('y1', String(cy - d));
        x2.setAttribute('x2', String(cx - d));
        x2.setAttribute('y2', String(cy + d));
        x2.setAttribute('class', 'dead-mark');
        svg.append(x1, x2);
      }

      // Soft highlight
      const hl = document.createElementNS(SVG_NS, 'circle');
      hl.setAttribute('cx', String(cx - cell * 0.13));
      hl.setAttribute('cy', String(cy - cell * 0.13));
      hl.setAttribute('r', String(cell * 0.11));
      hl.setAttribute('class', stone === BLACK ? 'stone-hl-black' : 'stone-hl-white');
      svg.appendChild(hl);

      // High-contrast shape marker so stones differ by more than colour
      if (highContrast) {
        const hc = document.createElementNS(SVG_NS, 'circle');
        hc.setAttribute('cx', String(cx));
        hc.setAttribute('cy', String(cy));
        hc.setAttribute('r', String(cell * 0.18));
        hc.setAttribute('class', stone === BLACK ? 'hc-ring-black' : 'hc-dot-white');
        svg.appendChild(hc);
      }

      // Atari ring (1 liberty left) when helper mode is on
      if (showHelpers && libs === 1) {
        const ring = document.createElementNS(SVG_NS, 'circle');
        ring.setAttribute('cx', String(cx));
        ring.setAttribute('cy', String(cy));
        ring.setAttribute('r', String(cell * 0.48));
        ring.setAttribute('class', 'atari-ring');
        svg.appendChild(ring);
      }

      // Lesson target pulse
      if (pulseSet.has(idx)) {
        const pulse = document.createElementNS(SVG_NS, 'circle');
        pulse.setAttribute('cx', String(cx));
        pulse.setAttribute('cy', String(cy));
        pulse.setAttribute('r', String(cell * 0.5));
        pulse.setAttribute('class', 'target-pulse');
        svg.appendChild(pulse);
      }

      // Last move marker
      if (idx === lastMove) {
        const lm = document.createElementNS(SVG_NS, 'circle');
        lm.setAttribute('cx', String(cx));
        lm.setAttribute('cy', String(cy));
        lm.setAttribute('r', String(cell * 0.15));
        lm.setAttribute('class', stone === BLACK ? 'last-move-on-black' : 'last-move-on-white');
        svg.appendChild(lm);
      }
    } else if (idx === ghostPoint) {
      const gh = document.createElementNS(SVG_NS, 'circle');
      gh.setAttribute('cx', String(cx));
      gh.setAttribute('cy', String(cy));
      gh.setAttribute('r', String(cell * 0.42));
      gh.setAttribute('class', 'ghost-stone');
      svg.appendChild(gh);
    } else if (pulseSet.has(idx)) {
      const pulse = document.createElementNS(SVG_NS, 'circle');
      pulse.setAttribute('cx', String(cx));
      pulse.setAttribute('cy', String(cy));
      pulse.setAttribute('r', String(cell * 0.28));
      pulse.setAttribute('class', 'target-pulse');
      svg.appendChild(pulse);
    }

    // Accessible hit target
    const hit = document.createElementNS(SVG_NS, 'rect');
    hit.setAttribute('x', String(cx - cell * 0.48));
    hit.setAttribute('y', String(cy - cell * 0.48));
    hit.setAttribute('width', String(cell * 0.96));
    hit.setAttribute('height', String(cell * 0.96));
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('class', 'hit-target');
    hit.setAttribute('tabindex', idx === 0 ? '0' : '-1');
    hit.setAttribute('role', 'gridcell');
    hit.dataset.idx = String(idx);

    const coord = coordLabel(size, idx);
    const desc =
      stone === EMPTY
        ? `${coord}, empty`
        : `${coord}, ${stone === BLACK ? 'black' : 'white'}, ${libs} ${libs === 1 ? 'liberty' : 'liberties'}`;
    hit.setAttribute('aria-label', desc);

    if (!disabled) {
      hit.addEventListener('click', () => onSelectPoint(idx));
      hit.addEventListener('keydown', (e: KeyboardEvent) => {
        let next = -1;
        if (e.key === 'ArrowRight' && c + 1 < size) next = idx + 1;
        else if (e.key === 'ArrowLeft' && c > 0) next = idx - 1;
        else if (e.key === 'ArrowDown' && r + 1 < size) next = idx + size;
        else if (e.key === 'ArrowUp' && r > 0) next = idx - size;
        else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectPoint(idx);
          return;
        }
        if (next >= 0) {
          e.preventDefault();
          const target = svg.querySelector(`[data-idx="${next}"]`) as SVGElement | null;
          if (target) {
            hit.setAttribute('tabindex', '-1');
            target.setAttribute('tabindex', '0');
            target.focus();
          }
        }
      });
    }
    svg.appendChild(hit);
  }

  container.replaceChildren(svg);
}

function hasAdjacent(grid: Uint8Array, size: number, r: number, c: number, color: number): boolean {
  if (r > 0 && grid[(r - 1) * size + c] === color) return true;
  if (r + 1 < size && grid[(r + 1) * size + c] === color) return true;
  if (c > 0 && grid[r * size + (c - 1)] === color) return true;
  if (c + 1 < size && grid[r * size + (c + 1)] === color) return true;
  return false;
}
