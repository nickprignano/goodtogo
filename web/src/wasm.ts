// Thin typed wrapper around the TinyGo-compiled rules.wasm module.
// Works identically in the browser, a Web Worker, and Node.js tests.

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const DRAW = 3;

export const PASS_POINT = -1;
export const NO_MOVE = -2;

export const PLAY_OK = 0;
export const PLAY_OUT_OF_BOUNDS = 1;
export const PLAY_OCCUPIED = 2;
export const PLAY_SUICIDE = 3;
export const PLAY_SUPERKO = 4;
export const PLAY_GAME_OVER = 5;

export const WARN_CAPTURE = 1 << 0;
export const WARN_PUT_IN_ATARI = 1 << 1;
export const WARN_SELF_ATARI = 1 << 2;
export const WARN_FILL_OWN_EYE = 1 << 3;
export const WARN_SAVED_ATARI = 1 << 4;
export const TAG_KO = 1 << 5;
export const TAG_CORNER = 1 << 6;

export const GOAL_CAPTURE_ANY = 1;
export const GOAL_CAPTURE_TARGET = 2;
export const GOAL_SAVE_TARGET = 3;

export interface RulesExports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  _start?: () => void;
  gtg_new_game(size: number, komiX2: number, captureTarget: number): void;
  gtg_set_stone(idx: number, color: number): void;
  gtg_set_turn(turn: number): void;
  gtg_reset_history(): void;
  gtg_play(idx: number): number;
  gtg_is_legal(idx: number): number;
  gtg_detect_warnings(idx: number): number;
  gtg_choose_move(level: number, seed: number): number;
  gtg_solve(
    firstMove: number,
    goal: number,
    targetPoint: number,
    maxDepth: number,
    regionRadius: number
  ): number;
  gtg_get_turn(): number;
  gtg_get_winner(): number;
  gtg_get_captures(color: number): number;
  gtg_get_move_count(): number;
  gtg_get_last_move(): number;
  gtg_get_size(): number;
  gtg_grid_ptr(): number;
  gtg_libs_ptr(): number;
  gtg_score_black_x2(): number;
  gtg_score_white_x2(): number;
  gtg_terr_ptr(): number;
  gtg_setup_handicap(stones: number): void;
  gtg_choose_move_gtg(gtgLevel: number, seed: number): number;
  gtg_estimate_ownership(playouts: number, seed: number): number;
  gtg_ownership_ptr(): number;
  gtg_dead_ptr(): number;
  gtg_score_with_dead_black_x2(): number;
  gtg_detect_coach_tags(idx: number): number;
  gtg_resume_after_pass(nextTurn: number): void;
}

export class RulesEngine {
  private e: RulesExports;

  private constructor(exports: RulesExports) {
    this.e = exports;
    if (typeof this.e._initialize === 'function') {
      this.e._initialize();
    } else if (typeof this.e._start === 'function') {
      this.e._start();
    }
  }

  static async fromBytes(bytes: BufferSource): Promise<RulesEngine> {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new RulesEngine(instance.exports as unknown as RulesExports);
  }

  static async fromModule(mod: WebAssembly.Module): Promise<RulesEngine> {
    const instance = await WebAssembly.instantiate(mod, {});
    return new RulesEngine(instance.exports as unknown as RulesExports);
  }

  static async fromUrl(url: string): Promise<RulesEngine> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load ${url}: ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return RulesEngine.fromBytes(buf);
  }

  newGame(size: number, komiX2: number, captureTarget: number): void {
    this.e.gtg_new_game(size, komiX2, captureTarget);
  }

  setStone(idx: number, color: number): void {
    this.e.gtg_set_stone(idx, color);
  }

  setTurn(turn: number): void {
    this.e.gtg_set_turn(turn);
  }

  resetHistory(): void {
    this.e.gtg_reset_history();
  }

  play(idx: number): number {
    return this.e.gtg_play(idx);
  }

  isLegal(idx: number): number {
    return this.e.gtg_is_legal(idx);
  }

  detectWarnings(idx: number): number {
    return this.e.gtg_detect_warnings(idx);
  }

  chooseMove(level: number, seed = (Date.now() >>> 0) || 1): number {
    return this.e.gtg_choose_move(level, seed >>> 0);
  }

  solve(
    firstMove: number,
    goal: number,
    targetPoint: number,
    maxDepth = 3,
    regionRadius = 2
  ): boolean {
    return this.e.gtg_solve(firstMove, goal, targetPoint, maxDepth, regionRadius) === 1;
  }

  get turn(): number {
    return this.e.gtg_get_turn();
  }

  get winner(): number {
    return this.e.gtg_get_winner();
  }

  get size(): number {
    return this.e.gtg_get_size();
  }

  get moveCount(): number {
    return this.e.gtg_get_move_count();
  }

  get lastMove(): number {
    return this.e.gtg_get_last_move();
  }

  captures(color: number): number {
    return this.e.gtg_get_captures(color);
  }

  getGrid(): Uint8Array {
    const ptr = this.e.gtg_grid_ptr();
    const n = this.size * this.size;
    return new Uint8Array(this.e.memory.buffer, ptr, n).slice();
  }

  getLiberties(): Uint8Array {
    const ptr = this.e.gtg_libs_ptr();
    const n = this.size * this.size;
    return new Uint8Array(this.e.memory.buffer, ptr, n).slice();
  }

  areaScore(): { black: number; white: number; territory: Uint8Array } {
    const bx2 = this.e.gtg_score_black_x2();
    const wx2 = this.e.gtg_score_white_x2();
    const ptr = this.e.gtg_terr_ptr();
    const n = this.size * this.size;
    const territory = new Uint8Array(this.e.memory.buffer, ptr, n).slice();
    return { black: bx2 / 2, white: wx2 / 2, territory };
  }

  setupHandicap(stones: number): void {
    this.e.gtg_setup_handicap(stones);
  }

  chooseMoveGTG(gtgLevel: number, seed = (Date.now() >>> 0) || 1): number {
    return this.e.gtg_choose_move_gtg(gtgLevel, seed >>> 0);
  }

  estimateOwnership(playouts = 48, seed = (Date.now() >>> 0) || 1): { lead: number; ownership: Int8Array } {
    const leadX2 = this.e.gtg_estimate_ownership(playouts, seed >>> 0);
    const ptr = this.e.gtg_ownership_ptr();
    const n = this.size * this.size;
    const ownership = new Int8Array(this.e.memory.buffer, ptr, n).slice();
    return { lead: leadX2 / 2, ownership };
  }

  scoreWithDead(dead: Uint8Array): { black: number; white: number; territory: Uint8Array } {
    const ptr = this.e.gtg_dead_ptr();
    const n = this.size * this.size;
    const view = new Uint8Array(this.e.memory.buffer, ptr, n);
    view.set(dead.subarray(0, n));
    const bx2 = this.e.gtg_score_with_dead_black_x2();
    const wx2 = this.e.gtg_score_white_x2();
    const tPtr = this.e.gtg_terr_ptr();
    const territory = new Uint8Array(this.e.memory.buffer, tPtr, n).slice();
    return { black: bx2 / 2, white: wx2 / 2, territory };
  }

  detectCoachTags(idx: number): number {
    return this.e.gtg_detect_coach_tags(idx);
  }

  resumeAfterPass(nextTurn: number): void {
    this.e.gtg_resume_after_pass(nextTurn);
  }
}

export interface ConceptInfo {
  tag: string;
  lessonId: string;
  note: string;
}

export function tagsToConcepts(flags: number): ConceptInfo[] {
  const out: ConceptInfo[] = [];
  if (flags & TAG_KO) {
    out.push({ tag: 'ko', lessonId: 's4-ko', note: 'A ko capture happened here — remember the ko rule.' });
  }
  if (flags & WARN_CAPTURE) {
    out.push({ tag: 'capture', lessonId: 's1-capturing', note: 'Stones were captured by taking their last liberty.' });
  }
  if (flags & WARN_SAVED_ATARI) {
    out.push({ tag: 'saved_atari', lessonId: 's1-atari', note: 'A stone in atari was saved by adding liberties.' });
  }
  if (flags & WARN_PUT_IN_ATARI) {
    out.push({ tag: 'atari', lessonId: 's1-atari', note: 'This move put an enemy group in atari (1 liberty left).' });
  }
  if (flags & WARN_SELF_ATARI) {
    out.push({ tag: 'self_atari', lessonId: 's1-liberties', note: 'This stone was left with only 1 liberty.' });
  }
  if (flags & WARN_FILL_OWN_EYE) {
    out.push({ tag: 'own_eye', lessonId: 's2-two-eyes', note: 'Playing inside your own eye can reduce your group’s life.' });
  }
  if (flags & TAG_CORNER) {
    out.push({ tag: 'corner_opening', lessonId: 's5-corners', note: 'Corners are the easiest places to surround territory.' });
  }
  return out;
}

export function coordLabel(size: number, idx: number): string {
  if (idx === PASS_POINT) return 'Pass';
  if (idx < 0 || idx >= size * size) return '';
  const r = Math.floor(idx / size);
  const c = idx % size;
  // Standard Go columns skip 'I'
  const letters = 'ABCDEFGHJKLMNOPQRST';
  const rowNum = size - r;
  return `${letters[c]}${rowNum}`;
}
