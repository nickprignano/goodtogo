import rulesWasm from './rules.wasm';
import problemsJson from '../../web/data/problems.json';
import { RulesEngine, PLAY_OK, tagsToConcepts } from '../../web/src/wasm.js';
import { filterCoachReply } from './filter.js';
export { BudgetDO } from './budget.js';

interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  BUDGET: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(req: Request): Promise<Response> };
  };
  GEMINI_API_KEY?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ReviewRequest {
  size: number;
  komiX2: number;
  handicap: number;
  moves: number[];
  stage: number;
  voice: 'beginner' | 'club';
  eli5: boolean;
}

interface ExplainRequest {
  problemId?: string;
  size: number;
  komiX2: number;
  handicap: number;
  moves: number[];
  moveIndex: number;
  voice: 'beginner' | 'club';
  eli5: boolean;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function initEngine(): Promise<RulesEngine> {
  return RulesEngine.fromModule(rulesWasm as unknown as WebAssembly.Module);
}

async function callGemini(
  apiKey: string,
  prompt: string
): Promise<{ ok: true; data: unknown } | { ok: false; status: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            summary: { type: 'STRING' },
            concept: { type: 'STRING' },
            idea: { type: 'STRING' },
          },
          required: ['summary', 'concept', 'idea'],
        },
        maxOutputTokens: 220,
      },
    }),
  });

  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { ok: false, status: 502 };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 502 };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/coach/')) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const email = request.headers.get('Cf-Access-Authenticated-User-Email');
    if (!email || !env.GEMINI_API_KEY) {
      return Response.json({ ok: false, fallback: true, reason: 'auth_or_key_missing' }, { status: 403 });
    }

    const userHash = await sha256Hex(email.toLowerCase().trim());
    const budgetStub = env.BUDGET.get(env.BUDGET.idFromName('global-budget'));
    const kind = url.pathname.endsWith('/review') ? 'review' : 'explain';
    const reservedCents = kind === 'review' ? 2 : 1;

    const engine = await initEngine();

    if (kind === 'review') {
      const body = (await request.json()) as ReviewRequest;
      if (!Array.isArray(body.moves) || body.moves.length === 0 || body.moves.length > 400) {
        return Response.json({ ok: false, reason: 'invalid_moves' }, { status: 400 });
      }

      engine.newGame(body.size, body.komiX2, 0);
      if (body.handicap >= 2) engine.setupHandicap(body.handicap);

      const moments: Array<{ n: number; tags: string[]; leadNote: string }> = [];
      for (let i = 0; i < body.moves.length; i++) {
        const mv = body.moves[i];
        const tagFlags = mv >= 0 ? engine.detectCoachTags(mv) : 0;
        if (engine.play(mv) !== PLAY_OK) {
          return Response.json({ ok: false, reason: 'illegal_move_in_replay' }, { status: 400 });
        }
        const concepts = tagsToConcepts(tagFlags);
        if (concepts.length > 0) {
          moments.push({
            n: i + 1,
            tags: concepts.map((c) => c.tag),
            leadNote: concepts[0].note,
          });
        }
      }

      const keyMoments = moments.slice(-3);
      const allowedTags = Array.from(new Set(keyMoments.flatMap((m) => m.tags)));
      if (allowedTags.length === 0) allowedTags.push('general');

      const resvRes = await budgetStub.fetch(
        new Request('https://budget/reserve', {
          method: 'POST',
          body: JSON.stringify({ userHash, kind: 'review', reservedCents }),
        })
      );
      if (!resvRes.ok) {
        return Response.json({ ok: false, fallback: true, reason: 'budget_cap' }, { status: 429 });
      }
      const { reservationId } = (await resvRes.json()) as { reservationId: string };

      const voiceDesc =
        body.eli5 || body.voice === 'beginner'
          ? 'Beginner (one simple idea, no Go jargon)'
          : 'Club (concise tactical explanation)';
      const prompt = `You are a Go coach. Voice: ${voiceDesc}. Stage: ${body.stage}.
Allowed concept tags: ${allowedTags.join(', ')}.
Key moments (move numbers and detected tags only): ${JSON.stringify(keyMoments)}.
Rules: NEVER mention board coordinates (like D4 or (3,4)). Use placeholders like {p1} if referring to a point. Only pick a concept from the allowed tags (or "general"). Keep summary and idea under 2 sentences each.`;

      let settled = false;
      const runAndSettle = async () => {
        try {
          const ai = await callGemini(env.GEMINI_API_KEY!, prompt);
          if (!ai.ok) {
            await budgetStub.fetch(
              new Request('https://budget/settle', {
                method: 'POST',
                body: JSON.stringify({ reservationId, actualCents: 0 }),
              })
            );
            settled = true;
            return { ok: false as const, fallback: true, reason: `upstream_${ai.status}` };
          }
          const checked = filterCoachReply(ai.data, allowedTags);
          await budgetStub.fetch(
            new Request('https://budget/settle', {
              method: 'POST',
              body: JSON.stringify({ reservationId, actualCents: reservedCents }),
            })
          );
          settled = true;
          if (!checked.ok) {
            return { ok: false as const, fallback: true, reason: checked.reason };
          }
          return { ok: true as const, source: 'ai', label: 'Written by AI', reply: checked.reply };
        } finally {
          if (!settled) {
            await budgetStub.fetch(
              new Request('https://budget/settle', {
                method: 'POST',
                body: JSON.stringify({ reservationId, actualCents: reservedCents }),
              })
            );
          }
        }
      };

      const p = runAndSettle();
      ctx.waitUntil(p);
      const result = await p;
      return Response.json(result, { status: 200 });
    }

    // Explain this move
    const body = (await request.json()) as ExplainRequest;
    let allowedTags = ['general'];
    if (body.problemId) {
      const found = (problemsJson as { problems: Array<{ id: string; size: number; stones: [number, number][]; turn: number; acceptedMoves: number[] }> }).problems.find(
        (p) => p.id === body.problemId
      );
      if (!found) {
        return Response.json({ ok: false, reason: 'unknown_problem' }, { status: 400 });
      }
      engine.newGame(found.size, 15, 0);
      for (const [idx, color] of found.stones) engine.setStone(idx, color);
      engine.setTurn(found.turn);
      engine.resetHistory();
      const flags = engine.detectCoachTags(found.acceptedMoves[0]);
      const concepts = tagsToConcepts(flags);
      if (concepts.length > 0) allowedTags = concepts.map((c) => c.tag);
    } else if (Array.isArray(body.moves) && body.moves.length > 0 && body.moves.length <= 400) {
      engine.newGame(body.size, body.komiX2, 0);
      if (body.handicap >= 2) engine.setupHandicap(body.handicap);
      const targetIdx = Math.min(Math.max(0, body.moveIndex), body.moves.length - 1);
      for (let i = 0; i <= targetIdx; i++) {
        const mv = body.moves[i];
        if (i === targetIdx && mv >= 0) {
          const concepts = tagsToConcepts(engine.detectCoachTags(mv));
          if (concepts.length > 0) allowedTags = concepts.map((c) => c.tag);
        }
        if (engine.play(mv) !== PLAY_OK) {
          return Response.json({ ok: false, reason: 'illegal_move_in_replay' }, { status: 400 });
        }
      }
    } else {
      return Response.json({ ok: false, reason: 'invalid_explain_request' }, { status: 400 });
    }

    const resvRes = await budgetStub.fetch(
      new Request('https://budget/reserve', {
        method: 'POST',
        body: JSON.stringify({ userHash, kind: 'explain', reservedCents }),
      })
    );
    if (!resvRes.ok) {
      return Response.json({ ok: false, fallback: true, reason: 'budget_cap' }, { status: 429 });
    }
    const { reservationId } = (await resvRes.json()) as { reservationId: string };

    const voiceDesc = body.eli5 || body.voice === 'beginner' ? 'Beginner (simple, no jargon)' : 'Club';
    const prompt = `Explain this Go move in 1-2 short sentences. Voice: ${voiceDesc}. Allowed concept tags: ${allowedTags.join(', ')}. NEVER mention board coordinates; use {p1} if needed.`;
    const p = (async () => {
      const ai = await callGemini(env.GEMINI_API_KEY!, prompt);
      if (!ai.ok) {
        await budgetStub.fetch(
          new Request('https://budget/settle', {
            method: 'POST',
            body: JSON.stringify({ reservationId, actualCents: 0 }),
          })
        );
        return { ok: false, fallback: true, reason: `upstream_${ai.status}` };
      }
      const checked = filterCoachReply(ai.data, allowedTags);
      await budgetStub.fetch(
        new Request('https://budget/settle', {
          method: 'POST',
          body: JSON.stringify({ reservationId, actualCents: reservedCents }),
        })
      );
      if (!checked.ok) return { ok: false, fallback: true, reason: checked.reason };
      return { ok: true, source: 'ai', label: 'Written by AI', reply: checked.reply };
    })();
    ctx.waitUntil(p);
    return Response.json(await p, { status: 200 });
  },
};
