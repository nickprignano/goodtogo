import rulesWasm from './rules.wasm';
import { RulesEngine } from '../../web/src/wasm.js';
import { PersistedRoom, RoomConfig, RoomLogic, RoomSnapshot } from './room-logic.js';

export class RoomDO {
  private storage: {
    get: <T>(k: string) => Promise<T | undefined>;
    put: (k: string, v: unknown) => Promise<void>;
    setAlarm: (t: number) => Promise<void>;
  };
  private sockets = new Map<WebSocket, 1 | 2>();

  constructor(state: {
    storage: {
      get: <T>(k: string) => Promise<T | undefined>;
      put: (k: string, v: unknown) => Promise<void>;
      setAlarm: (t: number) => Promise<void>;
    };
  }) {
    this.storage = state.storage;
  }

  private async loadLogic(): Promise<RoomLogic | null> {
    const saved = await this.storage.get<PersistedRoom>('room');
    if (!saved) return null;
    const eng = await RulesEngine.fromModule(rulesWasm as unknown as WebAssembly.Module);
    const logic = new RoomLogic(saved.cfg, eng, saved.seatTokens[0], saved.createdAt);
    logic.restore(saved);
    return logic;
  }

  private async saveLogic(logic: RoomLogic): Promise<void> {
    const data: PersistedRoom = {
      cfg: { code: logic.code, size: logic.size, handicap: logic.handicap, clocksOn: logic.clocksOn },
      moves: logic.moves,
      seatTokens: logic.seatTokens,
      lastSeatActionAt: logic.lastSeatActionAt,
      disconnectedAt: logic.disconnectedAt,
      blackMs: logic.blackMs,
      whiteMs: logic.whiteMs,
      deadMarks: logic.deadMarks,
      accept: logic.accept,
      acceptHash: logic.acceptHash,
      noDeadMarksNextPass: logic.noDeadMarksNextPass,
      consecutivePasses: logic.consecutivePasses,
      actionCount: logic.actionCount,
      createdAt: logic.createdAt,
      lastMoveAt: logic.lastMoveAt,
      turnStartedAt: logic.turnStartedAt,
      markingStartedAt: logic.markingStartedAt,
      phase: logic.phase,
      winner: logic.winner,
      score: logic.score,
    };
    await this.storage.put('room', data);
    if (logic.phase !== 'expired') {
      await this.storage.setAlarm(logic.earliestAlarmMs());
    }
  }

  private broadcast(snap: RoomSnapshot): void {
    const payload = JSON.stringify({ type: 'state', state: snap });
    for (const ws of this.sockets.keys()) {
      try {
        ws.send(payload);
      } catch {
        // Ignore closed socket
      }
    }
  }

  async alarm(): Promise<void> {
    const logic = await this.loadLogic();
    if (!logic) return;
    logic.onAlarm(Date.now());
    await this.saveLogic(logic);
    this.broadcast(logic.snapshot());
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      const { cfg, creatorToken } = (await request.json()) as { cfg: RoomConfig; creatorToken: string };
      const eng = await RulesEngine.fromModule(rulesWasm as unknown as WebAssembly.Module);
      const logic = new RoomLogic(cfg, eng, creatorToken, Date.now());
      await this.saveLogic(logic);
      return Response.json({ ok: true, seat: 1, token: creatorToken, state: logic.snapshot() });
    }

    const logic = await this.loadLogic();
    if (!logic || logic.phase === 'expired') {
      return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
    }

    if (url.pathname === '/join' && request.method === 'POST') {
      const token = crypto.randomUUID();
      const res = logic.join(token, Date.now());
      if (!res.ok) return Response.json(res, { status: 409 });
      await this.saveLogic(logic);
      this.broadcast(logic.snapshot());
      return Response.json({ ok: true, seat: 2, token, state: logic.snapshot() });
    }

    if (url.pathname === '/ws') {
      const token = url.searchParams.get('token') ?? '';
      const seat = logic.seatForToken(token);
      if (seat === 0) return new Response('Forbidden', { status: 403 });

      const pair = new (WebSocketPair as unknown as { new (): { 0: WebSocket; 1: WebSocket } })();
      const [client, server] = [pair[0], pair[1]];
      (server as unknown as { accept(): void }).accept();
      this.sockets.set(server, seat);
      logic.disconnectedAt[seat - 1] = 0;
      await this.saveLogic(logic);

      server.send(JSON.stringify({ type: 'state', seat, state: logic.snapshot() }));

      server.addEventListener('message', async (ev) => {
        const current = await this.loadLogic();
        if (!current) return;
        let msg: { type: string; idx?: number; hash?: string };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const now = Date.now();
        let res: { ok: boolean; reason?: string } = { ok: false, reason: 'unknown' };
        if (msg.type === 'play' && typeof msg.idx === 'number') {
          res = current.playMove(seat, msg.idx, now);
        } else if (msg.type === 'toggle_mark' && typeof msg.idx === 'number') {
          res = current.toggleMark(seat, msg.idx, now);
        } else if (msg.type === 'accept_marks' && typeof msg.hash === 'string') {
          res = current.acceptMarks(seat, msg.hash, now);
        } else if (msg.type === 'disagree_marks') {
          res = current.disagreeMarks(seat, now);
        }
        await this.saveLogic(current);
        if (!res.ok) {
          server.send(JSON.stringify({ type: 'error', reason: res.reason }));
        }
        this.broadcast(current.snapshot());
      });

      server.addEventListener('close', async () => {
        this.sockets.delete(server);
        const current = await this.loadLogic();
        if (current && current.phase === 'playing') {
          current.disconnectedAt[seat - 1] = Date.now();
          await this.saveLogic(current);
        }
      });

      return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
    }

    return new Response('Not found', { status: 404 });
  }
}
