const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const PASS_POINT = -1;
const PLAY_OK = 0;
const PLAY_SUPERKO = 4;

export interface RoomEngine {
  readonly turn: number;
  newGame(size: number, komiX2: number, captureTarget: number): void;
  setupHandicap(stones: number): void;
  setTurn(turn: number): void;
  resumeAfterPass(nextTurn: number): void;
  play(idx: number): number;
  getGrid(): Uint8Array;
  scoreWithDead(dead: Uint8Array): { black: number; white: number; territory: Uint8Array };
}

export type RoomPhase = 'waiting' | 'playing' | 'marking' | 'finished' | 'expired';

export interface RoomConfig {
  code: string;
  size: number;
  handicap: number;
  clocksOn: boolean;
}

export interface RoomSnapshot {
  code: string;
  size: number;
  handicap: number;
  komiX2: number;
  clocksOn: boolean;
  phase: RoomPhase;
  moves: number[];
  turn: number;
  winner: number;
  blackMs: number;
  whiteMs: number;
  deadMarks: number[];
  accept: [boolean, boolean];
  noDeadMarksNextPass: boolean;
  actionCount: number;
  score: { black: number; white: number } | null;
}

export interface PersistedRoom {
  cfg: RoomConfig;
  moves: number[];
  seatTokens: [string, string];
  lastSeatActionAt: [number, number];
  disconnectedAt: [number, number];
  blackMs: number;
  whiteMs: number;
  deadMarks: number[];
  accept: [boolean, boolean];
  acceptHash: [string, string];
  noDeadMarksNextPass: boolean;
  consecutivePasses: number;
  actionCount: number;
  createdAt: number;
  lastMoveAt: number;
  turnStartedAt: number;
  markingStartedAt: number;
  phase: RoomPhase;
  winner: number;
  score: { black: number; white: number } | null;
}

const MAX_ACTIONS = 1000;
const MIN_ACTION_GAP_MS = 500;
const MOVE_CEILING_MS = 5 * 60 * 1000;
const INITIAL_CLOCK_MS = 10 * 60 * 1000;
const INCREMENT_MS = 20 * 1000;
const MARKING_TIMEOUT_MS = 2 * 60 * 1000;
const DISCONNECT_CLAIM_MS = 3 * 60 * 1000;
const IDLE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export class RoomLogic {
  code: string;
  size: number;
  handicap: number;
  komiX2: number;
  clocksOn: boolean;
  phase: RoomPhase = 'waiting';
  moves: number[] = [];
  seatTokens: [string, string] = ['', ''];
  lastSeatActionAt: [number, number] = [0, 0];
  disconnectedAt: [number, number] = [0, 0];
  blackMs: number;
  whiteMs: number;
  deadMarks: number[] = [];
  accept: [boolean, boolean] = [false, false];
  acceptHash: [string, string] = ['', ''];
  noDeadMarksNextPass = false;
  consecutivePasses = 0;
  actionCount = 0;
  createdAt: number;
  lastMoveAt: number;
  turnStartedAt: number;
  markingStartedAt = 0;
  winner = 0;
  score: { black: number; white: number } | null = null;
  private engine: RoomEngine;

  constructor(cfg: RoomConfig, engine: RoomEngine, creatorToken: string, nowMs = Date.now()) {
    this.code = cfg.code;
    this.size = [9, 13, 19].includes(cfg.size) ? cfg.size : 9;
    this.handicap = Math.min(9, Math.max(0, cfg.handicap || 0));
    this.komiX2 = this.handicap >= 2 ? 1 : 15;
    this.clocksOn = Boolean(cfg.clocksOn);
    this.engine = engine;
    this.seatTokens[0] = creatorToken;
    this.blackMs = INITIAL_CLOCK_MS;
    this.whiteMs = INITIAL_CLOCK_MS;
    this.createdAt = nowMs;
    this.lastMoveAt = nowMs;
    this.turnStartedAt = nowMs;
    this.rebuildBoard();
  }

  private rebuildBoard(): void {
    this.engine.newGame(this.size, this.komiX2, 0);
    if (this.handicap >= 2) {
      this.engine.setupHandicap(this.handicap);
    }
    for (const mv of this.moves) {
      this.engine.play(mv);
    }
  }

  restore(saved: PersistedRoom): void {
    this.moves = saved.moves;
    this.seatTokens = saved.seatTokens;
    this.lastSeatActionAt = saved.lastSeatActionAt;
    this.disconnectedAt = saved.disconnectedAt;
    this.blackMs = saved.blackMs;
    this.whiteMs = saved.whiteMs;
    this.deadMarks = saved.deadMarks;
    this.accept = saved.accept;
    this.acceptHash = saved.acceptHash;
    this.noDeadMarksNextPass = saved.noDeadMarksNextPass;
    this.consecutivePasses = saved.consecutivePasses ?? 0;
    this.actionCount = saved.actionCount;
    this.lastMoveAt = saved.lastMoveAt;
    this.turnStartedAt = saved.turnStartedAt;
    this.markingStartedAt = saved.markingStartedAt;
    this.phase = saved.phase;
    this.winner = saved.winner;
    this.score = saved.score;
    this.rebuildBoard();
  }

  join(joinerToken: string, nowMs = Date.now()): { ok: true; seat: 2; token: string } | { ok: false; reason: string } {
    if (this.phase === 'expired') return { ok: false, reason: 'expired' };
    if (this.seatTokens[1]) return { ok: false, reason: 'room_full' };
    this.seatTokens[1] = joinerToken;
    this.phase = 'playing';
    this.turnStartedAt = nowMs;
    this.lastMoveAt = nowMs;
    return { ok: true, seat: 2, token: joinerToken };
  }

  seatForToken(token: string): 1 | 2 | 0 {
    if (token && token === this.seatTokens[0]) return 1;
    if (token && token === this.seatTokens[1]) return 2;
    return 0;
  }

  private checkActionQuota(seat: 1 | 2, nowMs: number): string | null {
    if (this.actionCount >= MAX_ACTIONS) return 'action_cap_reached';
    if (nowMs - this.lastSeatActionAt[seat - 1] < MIN_ACTION_GAP_MS) return 'rate_limited';
    this.actionCount += 1;
    this.lastSeatActionAt[seat - 1] = nowMs;
    return null;
  }

  playMove(seat: 1 | 2, idx: number, nowMs = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'playing') return { ok: false, reason: 'not_playing' };
    if (this.engine.turn !== seat) return { ok: false, reason: 'not_your_turn' };
    const quotaErr = this.checkActionQuota(seat, nowMs);
    if (quotaErr) return { ok: false, reason: quotaErr };

    if (this.clocksOn) {
      const elapsed = Math.max(0, nowMs - this.turnStartedAt);
      if (seat === BLACK) {
        this.blackMs -= elapsed;
        if (this.blackMs <= 0) {
          this.blackMs = 0;
          this.finishByTimeout(WHITE);
          return { ok: false, reason: 'timeout' };
        }
        this.blackMs += INCREMENT_MS;
      } else {
        this.whiteMs -= elapsed;
        if (this.whiteMs <= 0) {
          this.whiteMs = 0;
          this.finishByTimeout(BLACK);
          return { ok: false, reason: 'timeout' };
        }
        this.whiteMs += INCREMENT_MS;
      }
    }

    const res = this.engine.play(idx);
    if (res !== PLAY_OK) {
      return {
        ok: false,
        reason: res === PLAY_SUPERKO ? 'This would repeat an earlier position.' : 'Illegal move.',
      };
    }

    this.moves.push(idx);
    this.lastMoveAt = nowMs;
    this.turnStartedAt = nowMs;
    this.consecutivePasses = idx === PASS_POINT ? this.consecutivePasses + 1 : 0;

    if (this.consecutivePasses >= 2) {
      if (this.noDeadMarksNextPass) {
        this.deadMarks = [];
        this.finalizeScore();
      } else {
        this.phase = 'marking';
        this.markingStartedAt = nowMs;
        this.accept = [false, false];
        this.acceptHash = ['', ''];
      }
    }
    return { ok: true };
  }

  private marksHash(marks: number[]): string {
    return [...marks].sort((a, b) => a - b).join(',');
  }

  toggleMark(seat: 1 | 2, idx: number, nowMs = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'marking') return { ok: false, reason: 'not_marking' };
    const quotaErr = this.checkActionQuota(seat, nowMs);
    if (quotaErr) return { ok: false, reason: quotaErr };

    const grid = this.engine.getGrid();
    if (idx < 0 || idx >= grid.length || grid[idx] === EMPTY) {
      return { ok: false, reason: 'invalid_stone' };
    }

    const pos = this.deadMarks.indexOf(idx);
    if (pos >= 0) this.deadMarks.splice(pos, 1);
    else this.deadMarks.push(idx);

    this.accept = [false, false];
    this.acceptHash = ['', ''];
    return { ok: true };
  }

  acceptMarks(seat: 1 | 2, setHash: string, nowMs = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'marking') return { ok: false, reason: 'not_marking' };
    const quotaErr = this.checkActionQuota(seat, nowMs);
    if (quotaErr) return { ok: false, reason: quotaErr };

    const currentHash = this.marksHash(this.deadMarks);
    if (setHash !== currentHash) return { ok: false, reason: 'stale_marks_hash' };

    this.accept[seat - 1] = true;
    this.acceptHash[seat - 1] = setHash;

    if (this.accept[0] && this.accept[1] && this.acceptHash[0] === this.acceptHash[1]) {
      this.finalizeScore();
    }
    return { ok: true };
  }

  disagreeMarks(seat: 1 | 2, nowMs = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'marking') return { ok: false, reason: 'not_marking' };
    const quotaErr = this.checkActionQuota(seat, nowMs);
    if (quotaErr) return { ok: false, reason: quotaErr };

    this.resumeFromDisagreement(seat, nowMs);
    return { ok: true };
  }

  private resumeFromDisagreement(disputingSeat: 1 | 2, nowMs: number): void {
    this.phase = 'playing';
    this.noDeadMarksNextPass = true;
    this.consecutivePasses = 0;
    this.deadMarks = [];
    this.accept = [false, false];
    this.acceptHash = ['', ''];
    this.turnStartedAt = nowMs;
    const opponent = disputingSeat === BLACK ? WHITE : BLACK;
    this.engine.resumeAfterPass(opponent);
  }

  private finalizeScore(): void {
    const deadArr = new Uint8Array(this.size * this.size);
    for (const idx of this.deadMarks) {
      if (idx >= 0 && idx < deadArr.length) deadArr[idx] = 1;
    }
    const sc = this.engine.scoreWithDead(deadArr);
    this.score = { black: sc.black, white: sc.white };
    this.winner = sc.black > sc.white ? BLACK : WHITE;
    this.phase = 'finished';
  }

  private finishByTimeout(winner: number): void {
    this.winner = winner;
    this.phase = 'finished';
  }

  earliestAlarmMs(): number {
    const candidates: number[] = [
      this.createdAt + MAX_LIFETIME_MS,
      this.lastMoveAt + IDLE_EXPIRY_MS,
    ];
    if (this.phase === 'playing') {
      const turnLimit = this.clocksOn
        ? this.turnStartedAt + (this.engine.turn === BLACK ? this.blackMs : this.whiteMs)
        : this.turnStartedAt + MOVE_CEILING_MS;
      candidates.push(turnLimit);
    }
    if (this.phase === 'marking') {
      candidates.push(this.markingStartedAt + MARKING_TIMEOUT_MS);
    }
    for (const d of this.disconnectedAt) {
      if (d > 0) candidates.push(d + DISCONNECT_CLAIM_MS);
    }
    return Math.min(...candidates);
  }

  onAlarm(nowMs = Date.now()): void {
    if (nowMs >= this.createdAt + MAX_LIFETIME_MS || nowMs >= this.lastMoveAt + IDLE_EXPIRY_MS) {
      this.phase = 'expired';
      return;
    }
    if (this.phase === 'playing') {
      const limit = this.clocksOn
        ? this.turnStartedAt + (this.engine.turn === BLACK ? this.blackMs : this.whiteMs)
        : this.turnStartedAt + MOVE_CEILING_MS;
      if (nowMs >= limit) {
        this.finishByTimeout(this.engine.turn === BLACK ? WHITE : BLACK);
        return;
      }
    }
    if (this.phase === 'marking' && nowMs >= this.markingStartedAt + MARKING_TIMEOUT_MS) {
      this.resumeFromDisagreement(this.engine.turn as 1 | 2, nowMs);
      return;
    }
    for (let s = 0; s < 2; s++) {
      if (this.disconnectedAt[s] > 0 && nowMs >= this.disconnectedAt[s] + DISCONNECT_CLAIM_MS && this.phase === 'playing') {
        this.finishByTimeout(s === 0 ? WHITE : BLACK);
        return;
      }
    }
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      size: this.size,
      handicap: this.handicap,
      komiX2: this.komiX2,
      clocksOn: this.clocksOn,
      phase: this.phase,
      moves: this.moves,
      turn: this.engine.turn,
      winner: this.winner,
      blackMs: this.blackMs,
      whiteMs: this.whiteMs,
      deadMarks: this.deadMarks,
      accept: this.accept,
      noDeadMarksNextPass: this.noDeadMarksNextPass,
      actionCount: this.actionCount,
      score: this.score,
    };
  }
}
