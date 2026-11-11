# Good to Go spec (v1)

Status: draft for the owner's review (2026-11-11). Next: the owner's answers to the open
questions, then a Fable red team, then the app waits its turn in the build queue (one build at a
time, Gradient Descent first). Written in a shared doc and copied here; this file is the record.

## What it is

**Good to Go** (GTG) is a Go app at `gtg.prignano.ai` whose main job is to take someone who has
never played Go to finishing full games on a 19x19 board. It is built the way Chess and Cards
are: plain JavaScript and SVG with no build step, static files plus one Cloudflare Worker,
installable as an app (PWA) from day one.

Three parts, in order of importance:

1. **Learn.** A guided path of short interactive lessons and problems, starting with "capture
   one stone to win" on a tiny board and ending with full games on 19x19. Lessons unlock as you
   show you can do the thing, not by reading.
2. **Play the computer at your level.** An on-device opponent that is beatable at every stage,
   uses handicap stones the way real Go teachers do, and tracks your rank in kyu.
3. **Play a friend.** A 6-character room code, reconnect, the server is the referee, no chat and
   no names. Ported from Chess.

A **coach** runs through all three: free, instant hints on the device during play, and a
Claude-written review after a game plus a few "Explain this move" taps, for signed-in family
members under a hard spend cap.

## Decisions so far

| # | Question | Answer |
| --- | --- | --- |
| 1 | What to build | A Go game like Chess and Cards, with learning to play Go as the main objective (owner, 2026-11-11) |
| 2 | Name | **Good to Go**, at `gtg.prignano.ai`, repo `nickprignano/goodtogo` (owner, 2026-11-11) |
| 3 | Age rating | Open. Recommended: all ages, coach behind the family allowlist as in Chess |
| - | License | Open until the engine spike: MIT if KataGo passes (like Cards), GPL-3.0-or-later if the GNU Go fallback ships (like Chess) |

## Goals and non-goals

Success is a new player finishing and counting a full 9x9 game against the computer within their
first hour, and a 19x19 game within a few weeks of casual play.

**Goals**

- Teach Go from zero by doing: every idea is a board you touch within 30 seconds of reading
  about it.
- Keep the player winning about half their games at every stage, with handicap stones and an
  opponent that adjusts.
- Make the end of the game, which confuses most beginners, simple: the app counts, explains the
  count and shows who owns what.
- Show progress the way Go players do, as a kyu rank, so a player can later join a club or online
  server and know roughly where they stand.
- Reuse the Chess and Cards designs for the coach, rooms, budget, sign-in and PWA, so this is
  mostly new Go content, not new infrastructure.

**Not in v1**

- Online ranked play against strangers, accounts, chat, spectators or friends lists.
- Importing ratings from Go servers (there is no chess.com equivalent with a clean public API;
  revisit later).
- A "twin" opponent that plays like you. Chess's twin relied on chess.com game history.
- Professional-level analysis tools, joseki dictionaries or game-record libraries. Serious
  players already have desktop analysis tools and the online servers.
- Purchases, ads, streaks, daily-bonus mechanics or anything that rewards time spent over
  learning.

## The learning path

The path has six stages and about 30 lessons. Each lesson is one idea, three to six boards, and
ends in a short check: solve 4 of 5 problems to unlock the next lesson. Nothing is time-limited,
and you can skip ahead by passing a stage's test.

| Stage | Board | Lessons (one idea each) | Ends with |
| --- | --- | --- | --- |
| 1. First captures | 5x5, 7x7 | Placing stones, liberties, capturing, atari, saving a stone, "capture one stone to win" | Win 3 games of Capture Go against the computer |
| 2. Groups and eyes | 7x7, 9x9 | Connecting, cutting, groups share liberties, suicide is not allowed, two eyes live, false eyes | Capture Go to 5 stones, then a test of 8 life-or-death problems |
| 3. Classic tactics | 9x9 | Ladders, nets, snapbacks, throw-ins, ko and the ko rule | 10 tactics problems |
| 4. Territory and counting | 9x9 | Passing, the end of a game, dead stones, counting area, komi | First full 9x9 game, counted by the app with the player |
| 5. Playing well on 9x9 | 9x9 | Corners first, extending, invading vs reducing, don't chase, reading three moves ahead | Win 9x9 games at even strength; rank reaches about 20 kyu |
| 6. Bigger boards | 13x13, 19x19 | Opening on a big board, star points, a few basic corner patterns, joining fights | A full 19x19 game |

**Capture Go first.** Stages 1 and 2 use "Capture Go" (the first player to capture wins), a
standard way Go teachers start children and adults. It teaches liberties and reading without
territory or scoring, which come in stage 4.

**Problems.** Beside the path there is a **Problems** tab: life and death, tactics and endgame,
graded by rank. A problem you get wrong comes back after 1, 3 and 7 days (simple spaced
repetition, on the device). One **daily problem** sits on the home screen, matched to your rank.
There are no streaks.

**Where problems come from.** Modern problem collections are copyrighted, so none are copied. We
use three sources, all checked by the engine before shipping: problems we write ourselves;
positions cut from computer-vs-computer games and graded by the engine; and classical
collections centuries old and in the public domain (for example the Xuanxuan Qijing, 1349),
redrawn as our own boards. Each source and its license check goes in the repo. v1 ships at least
300 problems.

**Lessons are content, not code.** Each lesson is a JSON file: a few lines of text per board, the
stones, the goal ("capture the marked stone", "make this group live") and the accepted answers.
The rules module checks every answer, and a CI test replays every lesson to confirm each answer
works and each wrong move gets a sensible reply.

**Rank.** Your rank is a Glicko-2 rating, shown as a kyu rank from 30 kyu down to 1 kyu (then
dan). Lessons, problems and games against the computer all move it. Games against friends do
not, since they are unranked by design.

## Play modes

**Play the computer.** Pick 9x9, 13x13 or 19x19 (19x19 unlocks at stage 6, but anyone can open
it). The opponent plays at your rank and gives you handicap stones when you are weaker, as a
human teacher would: on 9x9, one stone is worth roughly three ranks of difference, up to 5
stones; on 19x19, one stone per rank, up to 9. After every game your rank updates and the next
game adjusts. Undo is allowed but makes the game unranked, as are hints, matching Chess.

**Play a friend.** Ported from the Chess live rooms (chess PR #7), with Cards' red-team fixes:

- One player creates a room and shares a 6-character code or a link (`/?room=CODE`). The other
  joins from their own device. No sign-in, names, chat or spectators.
- The creator picks board size, handicap (0 to 9) and komi, or takes the defaults: even game,
  7.5 komi.
- The server holds the game in Durable Object storage and checks every move with the same rules
  module the browser uses. Out-of-turn or illegal moves are rejected.
- Clocks are off by default. When on: 10 minutes plus 20 seconds a move, or byo-yomi (10
  minutes, then 5 periods of 30 seconds), the timing Go players expect.
- **The end of a game** is the hard part online. When both players pass, the app marks the
  stones it thinks are dead (from the engine on the creator's device; the server only checks the
  marks are legal stones). Each player can toggle marks; both must press Accept on the same set.
  If they disagree, play resumes, and a second disagreement ends the game unscored with a plain
  message. This is the standard approach on Go servers.
- Reconnect, message limits, code lookup before waking a room, and expiry (24 hours idle, 7 days
  at most) are as in Chess and Cards.
- Hints and the coach are off in rooms for both players; the app says plainly this is
  honour-based. A post-game review is offered once the game is over.

**Two on one device.** Chess dropped pass-and-play. For Go it is worth keeping, because the most
common way a child learns is next to a parent on one tablet. Proposed: a simple shared board
with optional counting at the end, no rank change. Listed as an open question.

## The coach

The coach follows the Chess design (chess PR #5): the engine supplies the facts, Claude only
puts them into words, and Claude is used only where it adds the most.

**One Go-specific risk shapes everything here:** language models read Go positions badly. Claude
must never be asked "what is happening on this board". Every fact it writes about (which group
is in atari, who owns a region, the score lead, the better move) comes from our rules module or
the engine, as structured data, and Claude's output can only point at points the input named.

**Free, on the device, instant:**

- Warnings during learning games: "this stone has one liberty left", "that move fills your own
  eye".
- Problem feedback: the engine's refutation of a wrong answer, played out on the board.
- After every game: a territory map (who owns each point), the score, and the three moves where
  the score lead swung most.

**Claude, for signed-in family members:**

- A **post-game review** in plain words: the three biggest moments, what happened, and the one
  idea that would have helped, each linked to the lesson that teaches it ("see Ladders, stage
  3").
- **"Explain this move"** taps, up to 5 a day, on any move in a finished game or a problem.
- Three voices, as in Chess: **Beginner** (one idea, no jargon), **Club** (names the shape or
  tactic, shows a short line), **Strong** (terse, candidate moves with score leads).

**What Claude sees:** the board size, the move list as coordinates (at most 400 moves, replayed
by the Worker, illegal games rejected), engine facts that the Worker can check (each a move line
from a stated position plus a number in range), group facts from the rules module (stones,
liberties, alive/dead estimate), the player's stage and the coach level. No free text, names or
account details.

**Output** goes through a JSON schema: short text fields plus points to mark and arrows, each of
which must be a point named in the input. It is labelled "written by AI".

**Spend:** its own Anthropic workspace with a hard monthly limit ($5 proposed), Sonnet 5.5, the
reserve-then-settle budget Durable Object from Chess, a daily cap, and failing closed to the
free notes. Cost per call should be close to Chess's (about $0.03 a review on Sonnet), since a Go
move list is about as long. Exact caps are set in the build.

**Sign-in:** Cloudflare Access on the coach paths only, Google as provider, a closed allowlist
the owner edits. Everything else works without an account. Whether the allowlist is the Chess
family list or its own depends on the age rating (open question 1).

## Rules and engine

**Rules: our own module.** Go's rules are small enough to write and test ourselves (unlike
chess, there is no chess.js to lean on): placing, capture, no suicide, positional superko,
passing, and area counting. The same file runs in the browser and the Worker, so both agree on
legality. A CI suite covers captures, ko, superko cycles, seki and counting.

- **Scoring:** area scoring (stones plus surrounded empty points), 7.5 komi on every board. It is
  simpler to teach and to compute than territory scoring, and it removes the "must I fill this
  point?" confusion at the end. Lesson 4 mentions that clubs often count territory instead, and
  that the result is almost always the same.
- **Handicap:** stones on the standard star points, komi 0.5 for handicap games.

**Engine: KataGo, if a spike passes.** [KataGo](https://github.com/lightvector/KataGo) is the
standard open Go engine, and since version 1.15 (2024) it ships a **human-style network trained
on human games that can be told to play like a given rank**, which is the Go version of what
Chess hoped to get from Maia. Neither its fitness for phones nor its license is verified yet, so
a one-day spike runs before build 2:

1. Confirm the license of the code (believed permissive) and of each network we would ship.
2. Run a small KataGo network in the browser, in a Web Worker, with ONNX Runtime Web or
   TensorFlow.js, on an iPhone. Measure size, memory and time per move on 9x9 and 19x19.
3. Check whether the human-style network can be shrunk enough to ship, and how weak its weakest
   setting is.

**How the opponent plays at your level:** from about 20 kyu up, the human-style network at your
rank, if it fits on a phone. Below that, and as the fallback, the engine's move probabilities
sampled with a rank-tuned temperature and a cap on how often it plays the best move, so a 30-kyu
opponent really does leave stones in atari. Beginners at stage 1 face a hand-written Capture Go
player with deliberate blind spots, which needs no engine at all.

**Fallback if the spike fails:** a small Monte Carlo player we write ourselves for 9x9, which is
plenty for stages 1 to 5, and GNU Go compiled to WebAssembly for 13x13 and 19x19. GNU Go is
GPL-3, so in that case the app becomes GPL-3, as Chess is. If KataGo passes, the app can be MIT,
like Cards.

**The same engine serves the coach:** score lead, territory ownership and best moves, computed on
the device, then checked and sent to the Worker as structured facts. Only one engine is loaded at
a time and it shuts down between games, to stay inside older iPhones' memory.

## Look, sound, app and privacy

**Art.** Our own SVG board and stones in prignano-theme colours that follow light and dark mode:
a warm, flat board with thin lines, and stones with a soft highlight rather than photographic
slate and shell. Teaching marks are part of the art system: liberty dots, atari rings, a
territory wash in each player's colour, and a gentle pulse on the stone a lesson is about. Big
touch targets on 9x9; on 19x19 a placed stone shows a ghost first and needs a second tap, so
fat-finger mistakes don't happen on a phone.

**Sound.** Our own short sounds, recorded or synthesised: a wooden click for a stone, a softer
double click for a capture, a quiet chime when a lesson check passes. Off with one tap, and
nothing plays on a loop.

**Accessibility.** Every point is reachable by keyboard and announced to screen readers by
coordinate ("D4, black, 2 liberties"). Stones are told apart by more than colour in the
high-contrast setting.

**Installable app.** The pinball recipe (installable-web-app.md in ai-brain): a manifest, icons,
a cache-first service worker with a content-hash version a test keeps fresh. Lessons, problems
and the small engine are cached at install, so learning works fully offline; bigger networks are
cached the first time they're used.

**Stack.** Plain JavaScript and SVG, no build step, one Cloudflare Worker with two Durable
Objects (room, budget), Workers Builds deploys on merge to `main`. The room and coach code is
ported from Chess.

**Privacy.** The defaults assume children will play, whatever the age rating ends up being:

- Progress, rank, games and problem history stay on the device, with an export and import file
  because Safari can clear storage. "Delete my data" clears it all and the coach's usage key.
- No analytics, ads, trackers or third-party scripts, a strict Content-Security-Policy, and the
  theme header pinned by commit with an integrity hash, as in Chess.
- Rooms keep nothing after they close. The Worker keeps no game records or request logs.
- Claude receives only the game, the engine facts, the stage and the level. Kids' data stays on
  the device, or in Claude and Cloudflare only.

## Build plan

Four PRs, one at a time, after Gradient Descent and whatever else is ahead in the queue:

1. **Board, rules and stages 1 to 2:** board, stones, sounds, rules module with tests, Capture Go
   against the hand-written player, the first 12 lessons, PWA, deploy to the subdomain.
2. **Engine, ranks and the rest of the path:** the KataGo spike first, then the opponent,
   handicap, Glicko-2 kyu rank, stages 3 to 6, the Problems tab with at least 300 checked
   problems, counting and the territory map.
3. **Coach:** Worker, Cloudflare Access, budget and limits, review and "Explain this move", free
   on-device notes, privacy page.
4. **Rooms:** ported live rooms, handicap and komi options, byo-yomi clocks, the dead-stone
   agreement.

Launch ends with the `content/games.json` PR in prignanodotai-web. The owner's steps: create the
repo (done, 2026-11-11), add the domain, create the Anthropic workspace with its limit and put
the key in the Worker secret, and add the coach path to Cloudflare Access.

## Open questions for the owner

1. **Age rating.** Recommended: all ages, with the coach behind the existing family allowlist, as
   in Chess.
2. **Two on one device.** Keep a simple pass-and-play board for parent and child? Recommended
   yes.
3. **Coach budget.** $5 a month on Sonnet 5.5, like Cards? Chess uses $10.
4. **19x19 in v1.** Recommended yes (stage 6), but it could slip to a later PR if the engine
   spike shows it is too slow on phones.

## For the Fable red team

Ask it to push hardest on these:

- Can Claude's reviews stay accurate when it can't read a Go board itself? Try to make it state
  a wrong fact from valid structured input.
- The dead-stone agreement in rooms: can a player stall, grief or force an unfair result?
- Is the learning path really beatable by a 7-year-old and a 45-year-old, and where would each
  give up?
- KataGo and network licenses, browser memory on older iPhones, and the GPL fallback's effect on
  the license.
- Problem sources: is anything at risk of copying a copyrighted collection?
- Room abuse and spend controls, as for Chess and Cards.
