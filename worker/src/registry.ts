// Registry Durable Object for 6-character room codes.
// Prevents guessed codes from waking RoomDOs and enforces room creation caps:
// 50 new rooms/day globally, 10 new rooms/day per hashed IP.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GLOBAL_DAILY_CAP = 50;
const IP_DAILY_CAP = 10;
const MAX_ROOM_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface RegistryData {
  dayKey: string;
  globalCreated: number;
  ipCounts: Record<string, number>;
  rooms: Record<string, number>; // code -> createdAtMs
}

export class RegistryTracker {
  private data: RegistryData;

  constructor(initial?: Partial<RegistryData>) {
    this.data = {
      dayKey: new Date().toISOString().slice(0, 10),
      globalCreated: 0,
      ipCounts: {},
      rooms: {},
      ...initial,
    };
  }

  private rollDay(nowMs: number): void {
    const dk = new Date(nowMs).toISOString().slice(0, 10);
    if (this.data.dayKey !== dk) {
      this.data.dayKey = dk;
      this.data.globalCreated = 0;
      this.data.ipCounts = {};
    }
    for (const [code, created] of Object.entries(this.data.rooms)) {
      if (nowMs - created > MAX_ROOM_AGE_MS) {
        delete this.data.rooms[code];
      }
    }
  }

  create(ipHash: string, nowMs = Date.now()): { ok: true; code: string } | { ok: false; reason: string } {
    this.rollDay(nowMs);
    if (this.data.globalCreated >= GLOBAL_DAILY_CAP) {
      return { ok: false, reason: 'daily_app_room_cap' };
    }
    const ipCount = this.data.ipCounts[ipHash] ?? 0;
    if (ipCount >= IP_DAILY_CAP) {
      return { ok: false, reason: 'daily_ip_room_cap' };
    }

    let code = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      let c = '';
      for (let i = 0; i < 6; i++) {
        c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
      if (!this.data.rooms[c]) {
        code = c;
        break;
      }
    }
    if (!code) return { ok: false, reason: 'code_exhausted' };

    this.data.rooms[code] = nowMs;
    this.data.globalCreated += 1;
    this.data.ipCounts[ipHash] = ipCount + 1;
    return { ok: true, code };
  }

  has(code: string, nowMs = Date.now()): boolean {
    this.rollDay(nowMs);
    return Boolean(this.data.rooms[code.toUpperCase()]);
  }

  snapshot(): RegistryData {
    return this.data;
  }
}

export class RegistryDO {
  private storage: { get: <T>(k: string) => Promise<T | undefined>; put: (k: string, v: unknown) => Promise<void> };

  constructor(state: { storage: { get: <T>(k: string) => Promise<T | undefined>; put: (k: string, v: unknown) => Promise<void> } }) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const saved = await this.storage.get<RegistryData>('registry');
    const tracker = new RegistryTracker(saved);

    if (url.pathname === '/create' && request.method === 'POST') {
      const { ipHash } = (await request.json()) as { ipHash: string };
      const res = tracker.create(ipHash);
      await this.storage.put('registry', tracker.snapshot());
      return Response.json(res, { status: res.ok ? 200 : 429 });
    }

    if (url.pathname === '/lookup' && request.method === 'GET') {
      const code = url.searchParams.get('code') ?? '';
      return Response.json({ exists: tracker.has(code) });
    }

    return new Response('Not found', { status: 404 });
  }
}
