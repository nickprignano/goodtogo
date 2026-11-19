// Reserve-then-settle Budget Durable Object for the AI Coach.
// Enforces a $5/month (500 cents) app cap and per-user daily caps.
// Stale reservations (>2 minutes) count as spent; counters expire automatically.

export interface Reservation {
  id: string;
  monthKey: string;
  dayKey: string;
  userHash: string;
  kind: 'review' | 'explain';
  reservedCents: number;
  createdAt: number;
}

interface BudgetState {
  monthKey: string;
  monthSpentCents: number;
  dayKey: string;
  dailyCounts: Record<string, { review: number; explain: number }>;
  pending: Record<string, Reservation>;
}

const MONTHLY_CAP_CENTS = 500;
const DAILY_REVIEW_CAP = 3;
const DAILY_EXPLAIN_CAP = 5;
const RESERVATION_TTL_MS = 2 * 60 * 1000;

export class BudgetTracker {
  private state: BudgetState;

  constructor(initial?: Partial<BudgetState>) {
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const dayKey = now.toISOString().slice(0, 10);
    this.state = {
      monthKey,
      monthSpentCents: 0,
      dayKey,
      dailyCounts: {},
      pending: {},
      ...initial,
    };
  }

  private rollWindows(nowMs: number): void {
    const d = new Date(nowMs);
    const mk = d.toISOString().slice(0, 7);
    const dk = d.toISOString().slice(0, 10);
    if (this.state.monthKey !== mk) {
      this.state.monthKey = mk;
      this.state.monthSpentCents = 0;
      this.state.pending = {};
    }
    if (this.state.dayKey !== dk) {
      this.state.dayKey = dk;
      this.state.dailyCounts = {};
    }

    // Any reservation older than 2 minutes counts as spent
    for (const [id, res] of Object.entries(this.state.pending)) {
      if (nowMs - res.createdAt >= RESERVATION_TTL_MS) {
        if (res.monthKey === this.state.monthKey) {
          this.state.monthSpentCents += res.reservedCents;
        }
        delete this.state.pending[id];
      }
    }
  }

  reserve(
    userHash: string,
    kind: 'review' | 'explain',
    reservedCents: number,
    nowMs = Date.now()
  ): { ok: true; reservationId: string } | { ok: false; reason: string } {
    this.rollWindows(nowMs);

    const pendingTotal = Object.values(this.state.pending).reduce((sum, r) => sum + r.reservedCents, 0);
    if (this.state.monthSpentCents + pendingTotal + reservedCents > MONTHLY_CAP_CENTS) {
      return { ok: false, reason: 'monthly_cap_reached' };
    }

    const userDay = this.state.dailyCounts[userHash] ?? { review: 0, explain: 0 };
    const cap = kind === 'review' ? DAILY_REVIEW_CAP : DAILY_EXPLAIN_CAP;
    if (userDay[kind] >= cap) {
      return { ok: false, reason: 'daily_cap_reached' };
    }

    userDay[kind] += 1;
    this.state.dailyCounts[userHash] = userDay;

    const id = `${nowMs}-${Math.random().toString(36).slice(2, 10)}`;
    this.state.pending[id] = {
      id,
      monthKey: this.state.monthKey,
      dayKey: this.state.dayKey,
      userHash,
      kind,
      reservedCents,
      createdAt: nowMs,
    };
    return { ok: true, reservationId: id };
  }

  settle(reservationId: string, actualCents: number, nowMs = Date.now()): void {
    this.rollWindows(nowMs);
    const res = this.state.pending[reservationId];
    if (!res) return;
    if (res.monthKey === this.state.monthKey) {
      this.state.monthSpentCents += Math.max(0, actualCents);
    }
    delete this.state.pending[reservationId];
  }

  snapshot(): BudgetState {
    return this.state;
  }
}

export class BudgetDO {
  private storage: { get: <T>(k: string) => Promise<T | undefined>; put: (k: string, v: unknown) => Promise<void> };

  constructor(state: { storage: { get: <T>(k: string) => Promise<T | undefined>; put: (k: string, v: unknown) => Promise<void> } }) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const saved = await this.storage.get<BudgetState>('budget');
    const tracker = new BudgetTracker(saved);

    if (url.pathname === '/reserve' && request.method === 'POST') {
      const body = (await request.json()) as { userHash: string; kind: 'review' | 'explain'; reservedCents: number };
      const res = tracker.reserve(body.userHash, body.kind, body.reservedCents);
      await this.storage.put('budget', tracker.snapshot());
      return Response.json(res, { status: res.ok ? 200 : 429 });
    }

    if (url.pathname === '/settle' && request.method === 'POST') {
      const body = (await request.json()) as { reservationId: string; actualCents: number };
      tracker.settle(body.reservationId, body.actualCents);
      await this.storage.put('budget', tracker.snapshot());
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }
}
