# Good to Go

Learn to play Go, from your first capture to full games. An installable web app (PWA) for [`go.prignano.ai`](https://go.prignano.ai).

The full design spec is in [docs/SPEC.md](docs/SPEC.md).

## Features

- **Learn (Stages 1–6):** Interactive show-first lessons starting with 5x5 Capture Go and progressing through liberties, eyes, area counting, tactics (false eyes, ladders, nets, snapbacks, ko), 9x9 openings, and 13x13 play.
- **Problems:** 150 original, solver-proved problems (`web/data/problems.json`), a Daily Problem matched to your GTG level, and 1 / 3 / 7-day spaced repetition.
- **Play Computer:** Capture Go and full-board games (7x7, 9x9, 13x13) across GTG Levels 1–10, standard star-point handicaps (2–9 stones, 0.5 komi), and Monte Carlo territory ownership / dead-stone estimation.
- **Two on One Device:** Pass-and-play on 7x7, 9x9, 13x13, or 19x19 (with two-tap ghost stones on larger boards) and area scoring.
- **Play a Friend:** 6-character room codes (`/#room=CODE`), WebSocket sync refereed by `rules.wasm`, optional `10m + 20s` clocks, and dead-stone agreement.
- **ELI5 / Helper Mode:** Device-local toggle for liberty dots, atari rings, and plain-language warnings.
- **AI Coach (signed-in allowlisted adults):** Post-game review of key moments and "Explain this move" via Gemini (`GEMINI_API_KEY` Worker secret), protected by Cloudflare Access, a `$5/month` reserve-then-settle `BudgetDO`, deterministic concept tags, and a coordinate/term output filter. Fails closed to free on-device notes.

## Architecture

- **`engine/` & `cmd/wasm/`:** Go rules, positional superko, area scoring, Capture Go & GTG Level 1–10 players, bounded problem solver, and coach concept tags, compiled with TinyGo (`-target=wasm-unknown`) to `rules.wasm` (~25 KB).
- **`web/`:** TypeScript + SVG board, Web Audio sounds, device-local storage (with export, import, and delete), and a content-hashed cache-first service worker.
- **`worker/`:** Cloudflare Worker serving static assets, `/api/coach/*`, and `/api/rooms/*` with `BudgetDO`, `RegistryDO`, and `RoomDO`, loading a byte-identical copy of `rules.wasm`.

## Development & Checks

Prerequisites: Go 1.26 (or `GOTOOLCHAIN=go1.26.0`), TinyGo 0.41+, `wasm-opt` (Binaryen), and Node.js 24+.

```bash
go test ./...
npm ci
npm run typecheck
npm run build
npm test
```

## License

MIT
