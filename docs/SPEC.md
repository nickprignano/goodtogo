# Good to Go spec (v1)

Status: merged as a draft in PR #1 (2026-11-11), then red-teamed with Fable the same day (table at
the end; every finding folded in). Still to come: the owner's answers to the open questions and
an outside review by Gemini, both folded into this file. Builds wait for this app's turn in the
queue: one build at a time, Gradient Descent first.

## What it is

**Good to Go** (GTG) is a Go app at `gtg.prignano.ai` whose main job is to take someone who has
never played Go to finishing full games. It is built the way Chess and Cards are: plain
JavaScript and SVG with no build step, static files plus one Cloudflare Worker, installable as an
app (PWA) from day one.

Three parts, in order of importance:

1. **Learn.** A guided path of short interactive lessons and problems, starting with "capture
   one stone to win" on a tiny board and reaching a counted game early. Lessons unlock as you
   show you can do the thing, not by reading.
2. **Play the computer.** A ladder of on-device computer players, each beatable, with handicap
   stones below the weakest one. Two people can also share one device.
3. **Play a friend.** A 6-character room code, reconnect, the server is the referee, no chat and
   no names. Ported from Chess and Cards.

A **coach** runs through all three: free, instant notes on the device, and a Claude-written
review of a game's three biggest moments plus a few "Explain this move" taps, for signed-in
allowlisted adults under a hard spend cap.

## Decisions so far

| # | Question | Answer |
| --- | --- | --- |
| 1 | What to build | A Go game like Chess and Cards, with learning to play Go as the main objective (owner, 2026-11-11) |
| 2 | Name | **Good to Go**, at `gtg.prignano.ai`, repo `nickprignano/goodtogo` (owner, 2026-11-11) |
| 3 | Age rating | Open. Recommended: all ages for the app; the Claude coach for allowlisted adults, children using it on a parent's sign-in |
| 4 | Reviews | Fable red team (done, 2026-11-11) and a Gemini outside review (owner, 2026-11-11) |
| - | License | MIT. Every part is our own; the room and coach Worker code is ported from Chess (GPL-3.0-or-later), which the owner may relicense because the Chess history has only the owner's and Claude's commits (checked 2026-11-11). No GPL engine is shipped (see "Engine") |

## Goals and non-goals

Success is a new player playing and counting their first small-board game within their first
hour, a full 9x9 game within their first few sessions, and a 19x19 game within a few weeks.

**Goals**

- Teach Go from zero by doing: every idea is a board you touch within 30 seconds, shown first
  and explained second, so a child who can't read yet can follow.
- Keep the player winning about half their games, by moving up and down a ladder of computer
  players and adding handicap stones at the bottom.
- Make the end of the game, which confuses most beginners, simple: the app counts, explains the
  count and shows who owns what.
- Reuse the Chess and Cards designs for the coach, rooms, budget, sign-in and PWA, including every
  fix their reviews adopted, so this is mostly new Go content.

**Not in v1**

- Online ranked play against strangers, accounts, chat, spectators or friends lists.
- A kyu rank calibrated against human players. The app shows "GTG levels" until a calibration
  exists, so it never promises "you are 15 kyu".
- KataGo's human-style network (99 MB, weakest profile 20 kyu; see "Engine").
- Byo-yomi clocks, a free komi picker, a "Strong" coach voice, endgame problems, and classical
  problem collections. All can come later.
- Purchases, ads, streaks, daily-bonus mechanics or anything that rewards time spent over
  learning.

## The learning path

The path has six stages and about 28 lessons. Each lesson is one idea on three to six boards. It
is shown first (a short animation of the idea), then done, and the words are short, read aloud
by the device's own speech voice when audio is on. A lesson ends in a check: solve 4 of 5
problems. A failed check offers new problems at once, as often as needed; nothing is
time-limited, and anyone can skip ahead by passing a stage's test.

| Stage | Board | Lessons (one idea each) | Ends with |
| --- | --- | --- | --- |
| 1. First captures | 5x5, 7x7 | Placing stones, liberties, capturing, atari, saving a stone, "capture one stone to win" | Win 3 games of Capture Go against the computer |
| 2. Groups and eyes | 7x7 | Connecting, cutting, groups share liberties, no suicide, two eyes live | Capture Go to 5 stones |
| 3. Your first real game | 7x7, then 9x9 | Capture Go habits to unlearn, passing, the end of a game, dead stones, counting area, komi | A full 7x7 game, counted by the app with the player (within the first hour); then a 9x9 game |
| 4. Tactics (interleaved with play) | 9x9 | False eyes, ladders, nets, snapbacks, throw-ins, ko and the ko rule | Optional checks; each lesson is suggested by the coach when a game shows the need |
| 5. Playing well on 9x9 | 9x9 | Corners first, extending, invading vs reducing, don't chase, reading three moves ahead | Beat the level-5 computer player on 9x9 |
| 6. Bigger boards | 13x13, then 19x19 | Opening on a bigger board, star points, a few basic corner shapes, joining fights | A full 13x13 game, then a 19x19 game (19x19 only if the engine allows it; see "Engine") |

**Capture Go first.** Stages 1 and 2 use "Capture Go" (the first player to capture wins), a
standard way Go teachers start children and adults. Stage 3 opens with a lesson on the Capture Go
habits that hurt in a real game (chasing every stone, ignoring territory).

**Games are saved as you go.** Every game against the computer or on a shared device is saved on
the device after each move and resumes where you left it; a 19x19 game on a phone can take more
than 30 minutes.

**Problems.** Beside the path there is a **Problems** tab: life and death and tactics, sorted by
GTG level. A problem you get wrong comes back after 1, 3 and 7 days (simple spaced repetition, on
the device). One **daily problem** sits on the home screen. There are no streaks.

**Where problems come from.** v1 ships about 150 problems, all our own: written by us or cut from
computer-vs-computer games. Each one is verified by an **exhaustive local solver** in the rules
module (problems are small, enclosed regions), which proves the answer works against every
defence and lists every correct first move. The engine alone is not trusted for this, since it is
not a problem prover. Classical public-domain collections are out of v1: their modern editions
add and reorganise material, and their problems are far too hard for beginners. If they come
later, diagrams come from pre-1900 printings, cited by page, with our own computed solutions.

**Lessons are content, not code.** Each lesson is a JSON file: a few words per board, the stones,
the goal ("capture the marked stone", "make this group live") and the accepted answers. A CI test
replays every lesson and runs the solver on every problem.

## Play modes

**Play the computer.** Pick 7x7, 9x9 or 13x13 (19x19 if the engine allows it). There is a ladder
of fixed computer players, **GTG levels 1 to 10** per board size. Win two in a row against a level
and the app suggests the next; lose three in a row and it suggests the one below. Below level 1,
you get handicap stones instead. Your level is the highest one you beat regularly; it is shown as
a GTG level, not a kyu rank. Undo is allowed but the game doesn't count toward your level, as
with hints.

**Two on one device.** A shared board for two people, such as a parent and a child, with the
app's counting at the end and no level change. It ships in build 1, before rooms, because it is
cheap and serves the most common way a child learns.

**Play a friend.** Ported from the Chess live rooms (chess PR #7) with every fix from Cards' two
reviews:

- One player creates a room and shares a 6-character code or a link (`/#room=CODE`, with
  `Referrer-Policy: no-referrer`; the link fills the code and the friend taps Join, so link
  scanners can't take the seat). No sign-in, names, chat or spectators.
- The creator picks board size (9x9, 13x13 or 19x19) and handicap (0 to 9). Komi is fixed: 7.5
  for even games, 0.5 with handicap.
- **Code lookup** uses a registry Durable Object, as in Cards (no KV), so a guessed code never
  wakes a room.
- The server holds the game in Durable Object storage and checks every move with the same rules
  module the browser uses. It stores a hash of every past position for superko and the current
  board, so it never replays the whole game on a message. A rejected superko move says plainly
  "this would repeat an earlier position".
- **Hard caps,** as in Cards: 50 new rooms a day for the app and 10 a day per hashed address, at
  most 1,000 actions per room for its life, at least 0.5 seconds between a seat's actions, one
  stored row per accepted action.
- **Clocks:** off by default, or 10 minutes plus 20 seconds a move when on. With clocks off a
  move still has a 5-minute ceiling. Every deadline (move ceiling, clock, marking timer,
  disconnect claim, room expiry) is stored, and the room's one alarm is always set to the
  earliest.
- **The end of a game.** When both players pass, each device computes its own suggested dead
  stones and the server shows both players only where the suggestions differ. Any toggle clears
  both players' Accept, Accept names a hash of the exact set, and toggles count against the
  action cap. If both accept within 2 minutes, the game is scored. Otherwise (a disagreement or
  the timer running out) play resumes with the disputing player's opponent to move, and at the
  next double pass **every stone on the board is counted as alive**. Under area scoring, playing
  on to capture dead stones costs nothing, so this is fair, and no game ends unscored.
- Reconnect with a seat token, a disconnected player can be claimed as having lost after 3
  minutes, and rooms expire 24 hours after the last move and 7 days at most.
- Hints and the coach are off in rooms for both players; the app says plainly this is
  honour-based. A post-game review is offered once the game is over.

## The coach

The coach follows the Chess and Cards design: the engine and rules module supply every fact,
Claude only puts them into words, and Claude is used only where it adds the most.

**One Go-specific risk shapes everything here:** language models read Go positions badly. Claude
is never asked what is happening on a board, never sees coordinates it could misread, and can
only name ideas the code has detected.

**Free, on the device, instant:**

- Warnings during learning games: "this stone has one liberty left", "that move fills your own
  eye".
- Problem feedback: the solver's refutation of a wrong answer, played out on the board.
- After every game: a territory map, the score, and the three moments where the score lead swung
  most, each with the lesson that teaches the idea detected there.

**Claude, for signed-in allowlisted adults:**

- A **post-game review** of the three biggest moments: what happened, and the one idea that would
  have helped.
- **"Explain this move"** taps, up to 5 a day, on a move in a finished game or a problem.
- Two voices: **Beginner** (one idea, no jargon) and **Club** (names the shape or tactic).

**What Claude sees.** The Worker rebuilds every prompt from its own replay of the game and never
forwards request JSON. For each of the three moments only (not the whole game):

- The local position as a list of moves, each `{n, colour, point}` with passes explicit (handicap
  games start with White, so colour is never inferred from move order).
- **Concept tags** detected by code at that moment: atari, self-atari, ladder works / ladder
  fails, snapback, net, group captured, group's status changed (settled alive, settled dead or
  unsettled, from the engine's ownership; the rules module proves only unconditional life, so
  anything else is "unsettled", never "dead"), and the engine's better move.
- Stones and liberties for the groups involved, recomputed by the Worker from its replay.
- The engine's score lead before and after, as a number in a set range. The Worker can't check
  it; a forged number only misleads the person who forged it.
- The player's stage and the coach level. No free text, names or account details.

**What Claude writes.** A JSON schema with short text fields, a `concept` chosen from the tags
supplied for that moment (code, not Claude, maps it to a lesson link), and placeholders such as
`{p1}` or `{groupA}` instead of coordinates, which the app renders as marks on the board. A
deterministic output filter, with its own test, rejects any reply that contains a coordinate-like
token or names a Go concept (ladder, net, snapback, seki, dead, alive, ko and so on) whose tag
was not supplied. A rejected reply falls back to the free notes and still counts against the
user's limit. The review is labelled "written by AI".

**Spend,** carried over from Chess and Cards with all their fixes: its own Anthropic workspace
with a hard monthly limit ($5 proposed), Sonnet 5.5, the reserve-then-settle budget Durable
Object, a daily cap, and failing closed to the free notes. Also: `ctx.waitUntil()` around the call
and its settlement; reservations not settled within 2 minutes count as spent; the workspace
limit's 400 response is handled; filtered or cut-off replies count against the user; and usage
counters expire on their own and are not reset by "Delete my data". Since only three moments are
sent, a review costs about what a Cards review does; reviews per day are restated from the real
reserve figure in build 3.

**Sign-in:** Cloudflare Access on the coach paths only, Google as provider, a closed allowlist of
adults the owner edits (its own list, not Chess's family list). Children use the coach on a
parent's signed-in device, so no child's email reaches Google or Access through this app.
Everything else works without an account.

## Rules and engine

**Rules: our own module.** Placing, capture, no suicide, positional superko, passing, area
counting and the problem solver. The same file runs in the browser and the Worker. A CI suite
covers captures, ko, superko cycles, seki and counting.

- **Scoring:** area scoring, 7.5 komi for even games, 0.5 with handicap, no extra handicap
  compensation. The stage 3 counting lesson mentions that clubs often count territory instead,
  and that the result is almost always the same.
- **Engine and rules agree:** the engine is set to the same rules (area scoring, positional
  superko, the same komi). A CI test checks that the engine's final score matches the rules
  module's count on a set of finished games.

**Engine: a small KataGo network, if a spike passes.** [KataGo](https://github.com/lightvector/KataGo)
is the standard open Go engine; its code is MIT, and its networks have their own license on
katagotraining.org. There is no official browser build, so the spike is really writing an
engine wrapper in a Web Worker (ONNX Runtime Web or TensorFlow.js, with our own input features)
and is budgeted at several days. It runs before build 2, with pass/fail set first:

1. The license of the specific small network we would ship is confirmed as allowing
   redistribution.
2. On the oldest iPhone we support: 9x9 under 2 seconds a move and under 300 MB of memory.
3. 13x13 and 19x19 are measured the same way; 19x19 ships only if it passes.

**How the computer players are made:** each GTG level is the network's move probabilities sampled
with a level-set temperature, plus **scripted blind spots** that make weak players weak in human
ways (ignores an atari with a set probability, never reads ladders, chases single stones). The
network's own judgement decides when to pass, so a weak player doesn't pass early. Stage 1 and 2
players are hand-written Capture Go players with deliberate blind spots and need no engine.

**If the spike fails:** a small Monte Carlo player of our own for 7x7 and 9x9, which covers
stages 1 to 5, and 13x13 and 19x19 wait for a later engine. GNU Go is not used: it is GPL-3,
which would change the app's license, and at about 5 to 7 kyu it is too strong for beginners
without heavy handicap.

**The same engine serves the coach** (ownership, score lead, better moves), computed on the
device. Only one engine is loaded at a time and it shuts down between games.

## Look, sound, app and privacy

**Art.** Our own SVG board and stones in prignano-theme colours that follow light and dark mode:
a warm, flat board with thin lines, and stones with a soft highlight. Teaching marks are part of
the art system: liberty dots, atari rings, a territory wash in each player's colour, and a gentle
pulse on the stone a lesson is about. Big touch targets on small boards; on 13x13 and 19x19 a
placed stone shows a ghost first and needs a second tap.

**Sound.** Our own short sounds: a wooden click for a stone, a softer double click for a capture,
a quiet chime when a check passes. Lesson words are read aloud by the device's built-in speech
voice when audio is on (nothing leaves the device). Off with one tap.

**Accessibility.** Every point is reachable by keyboard and announced to screen readers by
coordinate ("D4, black, 2 liberties"). Stones are told apart by more than colour in the
high-contrast setting.

**Installable app.** The pinball recipe (installable-web-app.md in ai-brain): a manifest, icons, a
cache-first service worker with a content-hash version a test keeps fresh. Lessons, problems and
the small players are cached at install, so learning works offline; the network is cached the
first time it's used.

**Stack.** Plain JavaScript and SVG, no build step, one Cloudflare Worker with three Durable
Objects (room, registry, budget), Workers Builds deploys on merge to `main`.

**Privacy.** The defaults assume children will play, whatever the age rating:

- Progress, levels, games and problem history stay on the device, with an export and import file
  because Safari can clear storage. "Delete my data" clears them.
- No analytics, ads, trackers or third-party scripts, a strict Content-Security-Policy, and the
  theme header pinned by commit with an integrity hash, as in Chess.
- Rooms keep nothing after they close. The Worker keeps no game records or request logs.
- Claude receives only the three moments' facts, the stage and the level.
- The privacy page names everything outside the device: the jsDelivr request for the theme
  header, Cloudflare (rooms, Access sign-in logs), Google (sign-in for allowlisted adults) and
  Anthropic's short-term API retention.

## Build plan

Four PRs, one at a time, after Gradient Descent and whatever else is ahead in the queue:

1. **Board, rules and stages 1 to 3:** board, stones, sounds, rules module and problem solver with
   tests, Capture Go players, two on one device, saved games, the first lessons through the
   first counted game, PWA, deploy to the subdomain.
2. **Engine, levels and the rest of the path:** the KataGo spike first, then the GTG level ladder,
   handicap, stages 4 to 6, the Problems tab with about 150 solver-checked problems, counting and
   the territory map.
3. **Coach:** Worker, Cloudflare Access, budget and limits, concept tags, output filter, review
   and "Explain this move", free on-device notes, privacy page.
4. **Rooms:** registry and room Durable Objects, hard caps, clocks, the dead-stone agreement.

Launch ends with the `content/games.json` PR in prignanodotai-web. The owner's steps: create the
repo (done, 2026-11-11), add the domain, create the Anthropic workspace with its limit and put the
key in the Worker secret, and set up the coach allowlist in Cloudflare Access.

## Open questions for the owner

1. **Age rating.** Recommended: all ages for the app, the coach for allowlisted adults only.
2. **Coach budget.** $5 a month on Sonnet 5.5, like Cards? Chess uses $10.
3. **19x19 in v1.** Now decided by the engine spike: it ships only if it passes on phones.

## Fable red team (2026-11-11): what it found and what changed

| Finding | Change |
| --- | --- |
| The coach's text was unconstrained: Claude could still write "ladder" or "your group is dead" with no fact behind it | Code detects concepts and passes them as tags; Claude picks from them; a deterministic filter rejects any Go term without its tag |
| A bare move list makes Claude infer colour by parity (wrong with handicap), and coordinates are easy to garble | Moves sent as `{n, colour, point}` with explicit passes; placeholders instead of coordinates; the filter rejects coordinate-like tokens |
| The rules module can't estimate life and death beyond unconditional life; seki would be called dead | Three states from the engine's ownership: settled alive, settled dead, unsettled; the Worker recomputes stones and liberties itself |
| KataGo's human-style network is 99 MB, stops at 20 kyu, and can pass early; shrinking it means retraining | Cut from v1 |
| There is no official KataGo browser build, so the spike is an engine wrapper, not a day's work | Spike budgeted in days with pass/fail numbers set first |
| GNU Go is too strong for beginners and would make the app GPL-3 | Dropped; MIT kept; 13x13 and 19x19 wait for a passing MIT engine |
| Temperature sampling makes random, not human, weak play, and a kyu label without calibration overpromises | GTG levels with scripted blind spots; no kyu claim until calibrated |
| The rank design contradicted itself (plays at your rank and gives handicap; Glicko-2 moved by unrated lessons) | A fixed ladder of levels, handicap only below level 1; level moves on games only; Glicko-2 cut |
| "A second disagreement ends the game unscored" lets the loser void the game | Play resumes, and at the next double pass every stone is counted alive; no unscored result |
| The marking phase could be stalled, spammed, or biased by the creator's device | Each device suggests its own marks, the server shows the diff, toggles clear Accept and count against the cap, Accept names a hash, a 2-minute timer |
| The first-hour goal was impossible: about 18 lessons and 18 test problems before the first real game | A counted 7x7 game right after "two eyes"; tactics optional and interleaved with play |
| A child can't read lesson text; failed checks had no retry; adults stall at the 9x9 to 19x19 jump | Show-then-do boards, device speech, unlimited retries with fresh problems, a 13x13 step, a habits-to-unlearn lesson, saved games |
| Classical problem sources are shakier than stated, too hard for beginners, and the engine is not a problem prover | Classical sources cut from v1; about 150 own problems, each proved by an exhaustive local solver |
| Cards' room fixes weren't carried over (`?room=`, hard caps, single-alarm rule, stall ceiling, disconnect claim) | All carried over, sized for Go |
| Code lookup was unspecified | A registry Durable Object, as in Cards |
| Cards' budget fixes weren't carried over; "Delete my data" reset the usage key | All five adopted; counters expire on their own |
| 400 moves plus group facts made the cost claim wrong | Only the three moments are sent; reviews a day restated in build 3 |
| Children on a Claude allowlist brings minor safeguards, children's-privacy law and a child's email at Google and Access | Adults-only allowlist; children use a parent's sign-in; the privacy page names every outside party |
| The engine and the rules could disagree on score or legality; replaying 400 moves per message risks the CPU limit | Same rules configured in the engine plus a CI agreement test; a plain superko message; position hashes stored |
| MIT plus code ported from GPL-3 Chess holds only without outside contributors | Checked 2026-11-11: only the owner's and Claude's commits |
| Over-building | Cut: human-style network, byo-yomi, the "Strong" voice, Glicko-2, classical and endgame problems, the komi picker; two on one device moved to build 1 |
