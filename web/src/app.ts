import { renderBoard } from './board.js';
import { QUICK_QUESTIONS, answerQuestion } from './qa.js';
import { playCaptureClick, playPassChime, playStoneClick, speakText, stopSpeech } from './sound.js';
import {
  SavedGame,
  UserState,
  clearAllState,
  exportStateJson,
  importStateJson,
  loadState,
  saveState,
} from './storage.js';
import {
  BLACK,
  EMPTY,
  GOAL_CAPTURE_TARGET,
  GOAL_SAVE_TARGET,
  PASS_POINT,
  PLAY_OK,
  PLAY_SUICIDE,
  PLAY_SUPERKO,
  RulesEngine,
  WARN_CAPTURE,
  WARN_FILL_OWN_EYE,
  WARN_PUT_IN_ATARI,
  WARN_SAVED_ATARI,
  WARN_SELF_ATARI,
  WHITE,
  coordLabel,
  tagsToConcepts,
} from './wasm.js';

interface DemoMove {
  idx: number;
  color: number;
}

interface LessonProblem {
  size: number;
  turn: number;
  stones: [number, number][];
  goal: 'play' | 'reduce_to_one' | 'capture_target' | 'save_target' | 'pass';
  targetPoint: number;
  acceptedMoves: number[];
  prompt: string;
  hint: string;
}

interface Lesson {
  id: string;
  stage: number;
  title: string;
  summary: string;
  demo: {
    size: number;
    stones: [number, number][];
    moves: DemoMove[];
    caption: string;
  };
  problems: LessonProblem[];
}

interface Stage {
  id: number;
  title: string;
  subtitle: string;
  gate: string;
}

interface LessonsPayload {
  stages: Stage[];
  lessons: Lesson[];
}

interface BankProblem extends LessonProblem {
  id: string;
  category: 'capture' | 'escape' | 'tactics';
  level: number;
  source: string;
}

interface ProblemsPayload {
  problems: BankProblem[];
}

type Tab = 'learn' | 'problems' | 'computer' | 'shared' | 'friend' | 'qa';

const DAY_MS = 24 * 60 * 60 * 1000;

let engine: RulesEngine;
let lessonsData: LessonsPayload;
let problemsData: ProblemsPayload;
let state: UserState = loadState();
let activeTab: Tab = 'learn';

// Learn state
let currentLesson: Lesson | null = null;
let learnPhase: 'list' | 'demo' | 'problem' = 'list';
let problemIndex = 0;
let demoTimer: number | null = null;
let lessonFeedback = '';

// Problems tab state
let problemFilter: 'all' | 'capture' | 'escape' | 'tactics' | 'due' = 'all';
let activeBankProblem: BankProblem | null = null;
let bankFeedback = '';

// Play state (computer & shared)
let currentGame: SavedGame | null = null;
let ghostPoint = -1;
let playNote = '';
let territoryOverlay: Uint8Array | null = null;
let deadOverlay: Uint8Array | null = null;
let scoreSummary = '';
let coachNotes = '';
let coachVoice: 'beginner' | 'club' = 'beginner';
let showPrivacy = false;

// Live room ("Play a friend") state
interface RemoteRoomState {
  code: string;
  size: number;
  handicap: number;
  komiX2: number;
  clocksOn: boolean;
  phase: 'waiting' | 'playing' | 'marking' | 'finished' | 'expired';
  moves: number[];
  turn: number;
  winner: number;
  blackMs: number;
  whiteMs: number;
  deadMarks: number[];
  accept: [boolean, boolean];
  noDeadMarksNextPass: boolean;
  score: { black: number; white: number } | null;
}

let roomJoinCode = '';
let roomSeat: 1 | 2 | 0 = 0;
let roomToken = '';
let roomState: RemoteRoomState | null = null;
let roomSocket: WebSocket | null = null;
let roomStatus = '';
let roomSizeOpt = 9;
let roomHandicapOpt = 0;
let roomClocksOpt = false;

interface QAMessage {
  q: string;
  title: string;
  answer: string;
  lessonId?: string;
}
let qaHistory: QAMessage[] = [];
let qaInputDraft = '';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatWarnings(flags: number, eli5: boolean): string {
  if (!eli5 || flags === 0) return '';
  const parts: string[] = [];
  if (flags & WARN_CAPTURE) parts.push('Nice capture!');
  if (flags & WARN_SAVED_ATARI) parts.push('You saved your stone from atari!');
  if (flags & WARN_PUT_IN_ATARI) parts.push('Their stone has 1 liberty left (atari)!');
  if (flags & WARN_SELF_ATARI) parts.push('Careful: that stone only has 1 liberty left.');
  if (flags & WARN_FILL_OWN_EYE) parts.push('Heads up: that fills your own eye.');
  return parts.join(' ');
}

function statusMessage(code: number): string {
  if (code === PLAY_SUICIDE) return 'Not allowed: a stone needs at least one liberty (unless it captures).';
  if (code === PLAY_SUPERKO) return 'This would repeat an earlier position (ko rule).';
  return 'That spot is not legal.';
}

function computeEndOfGameScore(game: SavedGame): void {
  if (game.captureTarget > 0) {
    const winnerName = engine.winner === BLACK ? 'Black' : 'White';
    scoreSummary = `${winnerName} wins Capture Go!`;
    territoryOverlay = null;
    deadOverlay = null;
    return;
  }

  if (!deadOverlay) {
    const grid = engine.getGrid();
    const { ownership } = engine.estimateOwnership(48);
    const dead = new Uint8Array(grid.length);
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === BLACK && ownership[i] <= -60) dead[i] = 1;
      else if (grid[i] === WHITE && ownership[i] >= 60) dead[i] = 1;
    }
    deadOverlay = dead;
  }

  const sc = engine.scoreWithDead(deadOverlay);
  territoryOverlay = sc.territory;
  const winnerName = sc.black > sc.white ? 'Black' : sc.white > sc.black ? 'White' : 'Draw';
  scoreSummary = `Area score — Black ${sc.black}, White ${sc.white} (${winnerName} wins). Tap stones to toggle dead/alive.`;
}

function replaySavedGame(game: SavedGame): void {
  engine.newGame(game.size, game.komiX2, game.captureTarget);
  if (game.handicap >= 2) {
    engine.setupHandicap(game.handicap);
  }
  for (const mv of game.moves) {
    engine.play(mv);
  }
  territoryOverlay = null;
  deadOverlay = null;
  scoreSummary = '';
  if (engine.winner !== 0) {
    computeEndOfGameScore(game);
  }
}

function startNewGame(
  mode: 'computer' | 'shared',
  size: number,
  komiX2: number,
  captureTarget: number,
  level: number,
  handicap = 0
): void {
  const actualKomi = handicap >= 2 ? 1 : komiX2;
  currentGame = {
    mode,
    size,
    komiX2: actualKomi,
    captureTarget,
    level,
    handicap,
    assisted: state.eli5Mode,
    playerColor: BLACK,
    moves: [],
    updatedAt: Date.now(),
  };
  ghostPoint = -1;
  replaySavedGame(currentGame);
  playNote =
    handicap >= 2
      ? `${handicap}-stone handicap game. Computer (White) to play.`
      : mode === 'computer'
      ? 'Your turn (Black).'
      : 'Black to play.';
  state.savedGame = currentGame;
  saveState(state);
  render();

  if (mode === 'computer' && engine.turn === WHITE) {
    triggerComputerMove();
  }
}

function recordRankedOutcome(playerWon: boolean): string {
  if (!currentGame || currentGame.assisted || currentGame.captureTarget > 0) {
    return '';
  }
  if (playerWon) {
    state.winStreak += 1;
    state.lossStreak = 0;
    if (state.winStreak >= 2 && state.gtgLevel < 10) {
      state.gtgLevel += 1;
      state.winStreak = 0;
      saveState(state);
      return ` Two wins in a row! Level up to GTG Level ${state.gtgLevel}.`;
    }
  } else {
    state.lossStreak += 1;
    state.winStreak = 0;
    if (state.lossStreak >= 3 && state.gtgLevel > 1) {
      state.gtgLevel -= 1;
      state.lossStreak = 0;
      saveState(state);
      return ` Suggested adjustment: GTG Level ${state.gtgLevel}.`;
    }
  }
  saveState(state);
  return '';
}

function triggerComputerMove(): void {
  window.setTimeout(() => {
    if (!currentGame || engine.winner !== 0 || engine.turn !== WHITE) return;
    const aiMove =
      currentGame.captureTarget > 0
        ? engine.chooseMove(currentGame.level)
        : engine.chooseMoveGTG(currentGame.level);
    const aiPrevCaps = engine.captures(WHITE);
    engine.play(aiMove);
    currentGame.moves.push(aiMove);
    currentGame.updatedAt = Date.now();
    replaySavedGame(currentGame);
    state.savedGame = currentGame;
    saveState(state);

    if (aiMove === PASS_POINT) {
      playPassChime(state.soundOn);
    } else if (engine.captures(WHITE) > aiPrevCaps) {
      playCaptureClick(state.soundOn);
    } else {
      playStoneClick(state.soundOn);
    }

    if (engine.winner !== 0) {
      const rankMsg = recordRankedOutcome(engine.winner === BLACK);
      playNote = scoreSummary + rankMsg;
      playPassChime(state.soundOn);
    } else {
      playNote =
        aiMove === PASS_POINT
          ? 'Computer passed. Your turn!'
          : `Computer played ${coordLabel(currentGame.size, aiMove)}. Your turn!`;
    }
    render();
  }, 220);
}

function handleBoardSelectInGame(idx: number): void {
  if (!currentGame) return;

  // Allow toggling dead stones after double-pass in real games
  if (engine.winner !== 0) {
    if (currentGame.captureTarget === 0 && deadOverlay) {
      const grid = engine.getGrid();
      if (idx >= 0 && idx < grid.length && grid[idx] !== EMPTY) {
        deadOverlay[idx] = deadOverlay[idx] ? 0 : 1;
        computeEndOfGameScore(currentGame);
        playNote = scoreSummary;
        render();
      }
    }
    return;
  }

  if (currentGame.mode === 'computer' && engine.turn !== currentGame.playerColor) return;

  // Two-tap ghost stone on 13x13 and 19x19
  if (currentGame.size >= 13 && idx !== PASS_POINT && ghostPoint !== idx) {
    if (engine.isLegal(idx) === PLAY_OK) {
      ghostPoint = idx;
      playNote = `Tap ${coordLabel(currentGame.size, idx)} again to place stone.`;
      render();
      return;
    }
  }
  ghostPoint = -1;

  if (state.eli5Mode) {
    currentGame.assisted = true;
  }

  const activeColor = engine.turn;
  const prevCaps = engine.captures(activeColor);
  const warnings = idx === PASS_POINT ? 0 : engine.detectWarnings(idx);
  const res = engine.play(idx);
  if (res !== PLAY_OK) {
    playNote = statusMessage(res);
    render();
    return;
  }

  const capturedNow = engine.captures(activeColor) > prevCaps;
  if (idx === PASS_POINT) {
    playPassChime(state.soundOn);
  } else if (capturedNow) {
    playCaptureClick(state.soundOn);
  } else {
    playStoneClick(state.soundOn);
  }

  currentGame.moves.push(idx);
  currentGame.updatedAt = Date.now();
  replaySavedGame(currentGame);
  state.savedGame = currentGame;
  saveState(state);

  const warnText = formatWarnings(warnings, state.eli5Mode);
  if (engine.winner !== 0) {
    if (currentGame.mode === 'computer' && engine.winner === BLACK && currentGame.captureTarget === 1) {
      state.captureWinsStage1 += 1;
      saveState(state);
    }
    const rankMsg = currentGame.mode === 'computer' ? recordRankedOutcome(engine.winner === BLACK) : '';
    playNote = scoreSummary + rankMsg;
    playPassChime(state.soundOn);
    render();
    return;
  }

  if (currentGame.mode === 'computer' && engine.turn === WHITE) {
    playNote = warnText || 'Computer is thinking...';
    render();
    triggerComputerMove();
    return;
  }

  const nextPlayer = engine.turn === BLACK ? 'Black' : 'White';
  playNote = warnText ? `${warnText} — ${nextPlayer} to play.` : `${nextPlayer} to play.`;
  render();
}

function undoLastMove(): void {
  if (!currentGame || currentGame.moves.length === 0) return;
  currentGame.assisted = true;
  if (currentGame.mode === 'computer') {
    currentGame.moves.pop();
    if (currentGame.moves.length > 0 && engine.turn === WHITE) {
      currentGame.moves.pop();
    }
  } else {
    currentGame.moves.pop();
  }
  ghostPoint = -1;
  replaySavedGame(currentGame);
  state.savedGame = currentGame;
  saveState(state);
  playNote = 'Move undone (unranked).';
  render();
}

// --- Learn mode ---

function clearDemoTimer(): void {
  if (demoTimer !== null) {
    window.clearTimeout(demoTimer);
    demoTimer = null;
  }
}

function startLesson(lesson: Lesson): void {
  clearDemoTimer();
  currentLesson = lesson;
  learnPhase = 'demo';
  problemIndex = 0;
  lessonFeedback = lesson.demo.caption;
  setupLessonDemo(lesson);
  speakText(`${lesson.title}. ${lesson.summary}`, state.speechOn);
  render();
}

function setupLessonDemo(lesson: Lesson): void {
  clearDemoTimer();
  engine.newGame(lesson.demo.size, 0, 0);
  for (const [idx, color] of lesson.demo.stones) {
    engine.setStone(idx, color);
  }
  engine.resetHistory();

  let step = 0;
  const playNext = () => {
    if (learnPhase !== 'demo' || currentLesson?.id !== lesson.id) return;
    if (step >= lesson.demo.moves.length) return;
    const mv = lesson.demo.moves[step];
    engine.setTurn(mv.color);
    engine.play(mv.idx);
    playStoneClick(state.soundOn);
    step++;
    render();
    if (step < lesson.demo.moves.length) {
      demoTimer = window.setTimeout(playNext, 850);
    }
  };
  if (lesson.demo.moves.length > 0) {
    demoTimer = window.setTimeout(playNext, 650);
  }
}

function setupProblem(prob: LessonProblem): void {
  engine.newGame(prob.size, 15, 0);
  for (const [idx, color] of prob.stones) {
    engine.setStone(idx, color);
  }
  engine.setTurn(prob.turn);
  engine.resetHistory();
  lessonFeedback = prob.prompt;
  speakText(prob.prompt, state.speechOn);
}

function handleProblemMove(idx: number): void {
  if (!currentLesson || learnPhase !== 'problem') return;
  const prob = currentLesson.problems[problemIndex];
  if (!prob) return;

  if (idx !== PASS_POINT && engine.isLegal(idx) !== PLAY_OK) {
    lessonFeedback = statusMessage(engine.isLegal(idx));
    render();
    return;
  }

  let solved = prob.acceptedMoves.includes(idx);
  if (!solved && prob.goal === 'capture_target') {
    solved = engine.solve(idx, GOAL_CAPTURE_TARGET, prob.targetPoint, 3, 2);
  } else if (!solved && prob.goal === 'save_target') {
    solved = engine.solve(idx, GOAL_SAVE_TARGET, prob.targetPoint, 3, 2);
  }

  if (solved) {
    engine.play(idx);
    playPassChime(state.soundOn);
    if (problemIndex + 1 < currentLesson.problems.length) {
      lessonFeedback = 'Great job! Next problem...';
      render();
      window.setTimeout(() => {
        if (learnPhase !== 'problem' || !currentLesson) return;
        problemIndex++;
        setupProblem(currentLesson.problems[problemIndex]);
        render();
      }, 850);
    } else {
      if (!state.completedLessons.includes(currentLesson.id)) {
        state.completedLessons.push(currentLesson.id);
        saveState(state);
      }
      lessonFeedback = `Lesson complete! You finished "${currentLesson.title}".`;
      speakText(lessonFeedback, state.speechOn);
      render();
    }
  } else {
    lessonFeedback = `Not quite — ${prob.hint}`;
    speakText(lessonFeedback, state.speechOn);
    render();
  }
}

// --- Problems tab (Daily + Spaced Repetition) ---

function getDailyProblem(): BankProblem {
  const today = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
  }
  const matched = problemsData.problems.filter((p) => Math.abs(p.level - state.gtgLevel) <= 2);
  const pool = matched.length > 0 ? matched : problemsData.problems;
  return pool[hash % pool.length];
}

function getDueProblemIds(now = Date.now()): string[] {
  return Object.entries(state.problemReviews)
    .filter(([, rev]) => rev.dueAt <= now)
    .map(([id]) => id);
}

function openBankProblem(prob: BankProblem): void {
  activeBankProblem = prob;
  engine.newGame(prob.size, 15, 0);
  for (const [idx, color] of prob.stones) {
    engine.setStone(idx, color);
  }
  engine.setTurn(prob.turn);
  engine.resetHistory();
  bankFeedback = prob.prompt;
  speakText(prob.prompt, state.speechOn);
  render();
}

function handleBankProblemMove(idx: number): void {
  if (!activeBankProblem) return;
  const prob = activeBankProblem;
  if (engine.isLegal(idx) !== PLAY_OK) {
    bankFeedback = statusMessage(engine.isLegal(idx));
    render();
    return;
  }

  let solved = prob.acceptedMoves.includes(idx);
  if (!solved && prob.goal === 'capture_target') {
    solved = engine.solve(idx, GOAL_CAPTURE_TARGET, prob.targetPoint, 3, 2);
  } else if (!solved && prob.goal === 'save_target') {
    solved = engine.solve(idx, GOAL_SAVE_TARGET, prob.targetPoint, 3, 2);
  }

  if (solved) {
    engine.play(idx);
    playPassChime(state.soundOn);
    if (!state.solvedProblems.includes(prob.id)) {
      state.solvedProblems.push(prob.id);
    }
    delete state.problemReviews[prob.id];
    saveState(state);
    bankFeedback = 'Solved! Pick another problem or tap Next.';
    speakText('Solved!', state.speechOn);
    render();
  } else {
    const prev = state.problemReviews[prob.id]?.intervalDays ?? 0;
    const nextDays = prev === 0 ? 1 : prev === 1 ? 3 : 7;
    state.problemReviews[prob.id] = {
      intervalDays: nextDays,
      dueAt: Date.now() + nextDays * DAY_MS,
    };
    saveState(state);
    bankFeedback = `Not quite (scheduled to review in ${nextDays} day${nextDays === 1 ? '' : 's'}) — ${prob.hint}`;
    speakText(prob.hint, state.speechOn);
    render();
  }
}

// --- Rendering ---

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;

  const shell = el('div', 'shell');

  const header = el('header', 'topbar');
  const brand = el('div', 'brand');
  const mark = document.createElement('img');
  mark.src = './icons/logo-mark.svg';
  mark.alt = '';
  mark.className = 'brand-mark';
  const brandText = el('div', 'brand-text');
  brandText.append(el('span', 'brand-title', 'Good to Go'), el('span', 'brand-sub', 'go.prignano.ai'));
  brand.append(mark, brandText);

  const nav = el('nav', 'tabs');
  (['learn', 'problems', 'computer', 'shared', 'friend', 'qa'] as Tab[]).forEach((t) => {
    const label =
      t === 'learn'
        ? 'Learn'
        : t === 'problems'
        ? 'Problems'
        : t === 'computer'
        ? 'Play Computer'
        : t === 'shared'
        ? 'Two on One Device'
        : t === 'friend'
        ? 'Play a Friend'
        : 'Rules Q&A';
    const btn = el('button', `tab ${activeTab === t ? 'active' : ''}`, label);
    btn.addEventListener('click', () => {
      clearDemoTimer();
      stopSpeech();
      activeTab = t;
      if (t === 'problems' && !activeBankProblem) {
        openBankProblem(getDailyProblem());
        return;
      }
      if (t === 'computer' && (!currentGame || currentGame.mode !== 'computer')) {
        if (state.savedGame && state.savedGame.mode === 'computer') {
          currentGame = state.savedGame;
          replaySavedGame(currentGame);
          playNote = 'Resumed your saved game.';
        } else {
          startNewGame('computer', 7, 15, 0, state.gtgLevel, 0);
          return;
        }
      }
      if (t === 'shared' && (!currentGame || currentGame.mode !== 'shared')) {
        if (state.savedGame && state.savedGame.mode === 'shared') {
          currentGame = state.savedGame;
          replaySavedGame(currentGame);
          playNote = 'Resumed shared board.';
        } else {
          startNewGame('shared', 7, 15, 0, 1, 0);
          return;
        }
      }
      render();
    });
    nav.appendChild(btn);
  });

  const controls = el('div', 'toggles');
  const eli5Btn = el(
    'button',
    `pill ${state.eli5Mode ? 'on' : ''}`,
    state.eli5Mode ? 'ELI5 Helper: ON' : 'ELI5 Helper: OFF'
  );
  eli5Btn.title = 'Show liberty dots, atari rings, and simple warnings';
  eli5Btn.addEventListener('click', () => {
    state.eli5Mode = !state.eli5Mode;
    saveState(state);
    render();
  });

  const soundBtn = el('button', `pill ${state.soundOn ? 'on' : ''}`, state.soundOn ? 'Sound: ON' : 'Sound: OFF');
  soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    saveState(state);
    render();
  });

  const speechBtn = el('button', `pill ${state.speechOn ? 'on' : ''}`, state.speechOn ? 'Voice: ON' : 'Voice: OFF');
  speechBtn.addEventListener('click', () => {
    state.speechOn = !state.speechOn;
    if (!state.speechOn) stopSpeech();
    saveState(state);
    render();
  });

  const hcBtn = el('button', `pill ${state.highContrast ? 'on' : ''}`, state.highContrast ? 'Contrast+' : 'Contrast');
  hcBtn.addEventListener('click', () => {
    state.highContrast = !state.highContrast;
    saveState(state);
    render();
  });

  controls.append(eli5Btn, soundBtn, speechBtn, hcBtn);
  header.append(brand, nav, controls);
  shell.appendChild(header);

  const main = el('main', 'main');
  if (activeTab === 'learn') {
    main.appendChild(renderLearn());
  } else if (activeTab === 'problems') {
    main.appendChild(renderProblems());
  } else if (activeTab === 'computer') {
    main.appendChild(renderPlay('computer'));
  } else if (activeTab === 'shared') {
    main.appendChild(renderPlay('shared'));
  } else if (activeTab === 'friend') {
    main.appendChild(renderFriendRoom());
  } else {
    main.appendChild(renderQA());
  }
  shell.appendChild(main);

  const footer = el('footer', 'footer');
  const credit = el('span', 'muted');
  const studioLink = document.createElement('a');
  studioLink.href = 'https://quietarcades.com';
  studioLink.target = '_blank';
  studioLink.rel = 'noopener noreferrer';
  studioLink.className = 'link-btn';
  studioLink.textContent = 'Quiet Arcades';
  credit.append('A ', studioLink, ' game · Progress stays on this device. No analytics or accounts.');
  footer.appendChild(credit);
  const dataBtns = el('div', 'data-btns');

  const exportBtn = el('button', 'link-btn', 'Export');
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([exportStateJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'goodtogo-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  const importBtn = el('button', 'link-btn', 'Import');
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        state = importStateJson(await file.text());
        saveState(state);
        render();
      } catch {
        alert('Could not read that backup file.');
      }
    };
    input.click();
  });

  const delBtn = el('button', 'link-btn danger', 'Delete my data');
  delBtn.addEventListener('click', () => {
    if (confirm('Delete all saved lessons, problems, and games on this device?')) {
      state = clearAllState();
      currentGame = null;
      currentLesson = null;
      activeBankProblem = null;
      learnPhase = 'list';
      render();
    }
  });

  const privBtn = el('button', 'link-btn', 'Privacy');
  privBtn.addEventListener('click', () => {
    showPrivacy = !showPrivacy;
    render();
  });

  dataBtns.append(privBtn, exportBtn, importBtn, delBtn);
  footer.appendChild(dataBtns);
  shell.appendChild(footer);

  if (showPrivacy) {
    const privCard = el('div', 'card');
    privCard.append(
      el('h2', '', 'Privacy'),
      el('p', 'muted', 'All lessons, problem history, and games stay on your device. There are no ads, trackers, or analytics.'),
      el('p', 'muted', 'Outside requests: Cloudflare (static hosting and Access sign-in logs), Google (sign-in for allowlisted adults on the Coach), and Google Gemini API (short-term API retention when a signed-in adult taps AI Coach Review or Explain this move).')
    );
    shell.appendChild(privCard);
  }

  root.replaceChildren(shell);
}

function renderLearn(): HTMLElement {
  const wrap = el('div', 'learn-wrap');

  if (learnPhase === 'list' || !currentLesson) {
    const intro = el('div', 'card');
    const nextLesson =
      lessonsData.lessons.find((l) => !state.completedLessons.includes(l.id)) ?? lessonsData.lessons[0];

    const historyP = el(
      'p',
      'intro-copy',
      'Go (Weiqi in China, Baduk in Korea, Igo in Japan) is the world’s oldest continuously played board game—born in ancient China more than 2,500 years ago. On a simple grid of crossing lines, two players take turns placing black and white stones to surround space and outlast each other.'
    );

    const basics = el('ul', 'basics-list');
    [
      'Play on the line crossings: Black goes first, White goes second, and stones never move once placed.',
      'Breathe through liberties: every stone needs open neighboring dots along the lines. Cover an enemy group’s last liberty to capture it.',
      'Start small, grow naturally: begin on a 5×5 board where the first capture wins, then step up to full territory games on 7×7, 9×9, 13×13, and 19×19.',
    ].forEach((line) => basics.appendChild(el('li', '', line)));

    const startRow = el('div', 'actions');
    const startBtn = el(
      'button',
      'btn primary',
      state.completedLessons.length === 0
        ? `Start Lesson 1: ${nextLesson.title} →`
        : `Continue: ${nextLesson.title} →`
    );
    startBtn.addEventListener('click', () => startLesson(nextLesson));
    startRow.appendChild(startBtn);

    intro.append(
      el('h1', '', 'Learn Go, step by step'),
      historyP,
      basics,
      startRow,
      el(
        'p',
        'muted',
        `Completed ${state.completedLessons.length} of ${lessonsData.lessons.length} lessons · GTG Level ${state.gtgLevel} · Stage 1 Capture Go wins: ${state.captureWinsStage1}/3`
      )
    );
    wrap.appendChild(intro);

    for (const stage of lessonsData.stages) {
      const sec = el('section', 'stage-card');
      sec.append(el('h2', '', stage.title), el('p', 'muted', `${stage.subtitle} — ${stage.gate}`));
      const grid = el('div', 'lesson-grid');
      for (const lesson of lessonsData.lessons.filter((l) => l.stage === stage.id)) {
        const done = state.completedLessons.includes(lesson.id);
        const card = el('button', `lesson-tile ${done ? 'done' : ''}`);
        card.append(
          el('div', 'lesson-title', `${done ? '✓ ' : ''}${lesson.title}`),
          el('div', 'lesson-summary', lesson.summary)
        );
        card.addEventListener('click', () => startLesson(lesson));
        grid.appendChild(card);
      }
      sec.appendChild(grid);
      wrap.appendChild(sec);
    }
    return wrap;
  }

  const panel = el('div', 'play-layout');
  const boardBox = el('div', 'board-box');
  const pulse =
    learnPhase === 'problem' && currentLesson.problems[problemIndex].targetPoint >= 0
      ? [currentLesson.problems[problemIndex].targetPoint]
      : [];

  renderBoard(boardBox, {
    size: engine.size,
    grid: engine.getGrid(),
    liberties: engine.getLiberties(),
    lastMove: engine.lastMove,
    ghostPoint: -1,
    pulsePoints: pulse,
    showHelpers: state.eli5Mode || currentLesson.stage === 1,
    highContrast: state.highContrast,
    disabled: learnPhase === 'demo',
    onSelectPoint: handleProblemMove,
  });

  const side = el('div', 'side-panel card');
  const backBtn = el('button', 'btn secondary', '← All lessons');
  backBtn.addEventListener('click', () => {
    clearDemoTimer();
    stopSpeech();
    learnPhase = 'list';
    render();
  });

  side.append(
    backBtn,
    el('h2', '', currentLesson.title),
    el('p', 'muted', currentLesson.summary),
    el('div', 'feedback-box', lessonFeedback)
  );

  const actions = el('div', 'actions');
  if (learnPhase === 'demo') {
    const replayBtn = el('button', 'btn secondary', 'Replay demo');
    replayBtn.addEventListener('click', () => setupLessonDemo(currentLesson!));

    const tryBtn = el('button', 'btn primary', 'Try it →');
    tryBtn.addEventListener('click', () => {
      clearDemoTimer();
      learnPhase = 'problem';
      problemIndex = 0;
      setupProblem(currentLesson!.problems[0]);
      render();
    });
    actions.append(replayBtn, tryBtn);
  } else {
    const prob = currentLesson.problems[problemIndex];
    side.append(el('div', 'muted', `Problem ${problemIndex + 1} of ${currentLesson.problems.length}`));

    if (prob.goal === 'pass') {
      const passBtn = el('button', 'btn primary', 'Pass');
      passBtn.addEventListener('click', () => handleProblemMove(PASS_POINT));
      actions.appendChild(passBtn);
    }

    const hintBtn = el('button', 'btn secondary', 'Hint');
    hintBtn.addEventListener('click', () => {
      lessonFeedback = prob.hint;
      speakText(prob.hint, state.speechOn);
      render();
    });

    const resetBtn = el('button', 'btn secondary', 'Reset board');
    resetBtn.addEventListener('click', () => {
      setupProblem(prob);
      render();
    });
    actions.append(hintBtn, resetBtn);
  }

  side.appendChild(actions);
  panel.append(boardBox, side);
  wrap.appendChild(panel);
  return wrap;
}

function renderProblems(): HTMLElement {
  const layout = el('div', 'play-layout');
  const boardBox = el('div', 'board-box');
  const prob = activeBankProblem ?? getDailyProblem();

  renderBoard(boardBox, {
    size: engine.size,
    grid: engine.getGrid(),
    liberties: engine.getLiberties(),
    lastMove: engine.lastMove,
    ghostPoint: -1,
    pulsePoints: prob.targetPoint >= 0 ? [prob.targetPoint] : [],
    showHelpers: state.eli5Mode,
    highContrast: state.highContrast,
    onSelectPoint: handleBankProblemMove,
  });

  const side = el('div', 'side-panel card');
  const dueIds = getDueProblemIds();
  const daily = getDailyProblem();

  side.append(
    el('h2', '', `Problem ${prob.id.toUpperCase()} (${prob.category}, Level ${prob.level})`),
    el('div', 'muted', `Solved ${state.solvedProblems.length}/${problemsData.problems.length} · Due for review: ${dueIds.length}`),
    el('div', 'feedback-box', bankFeedback || prob.prompt)
  );

  const actions = el('div', 'actions');
  const dailyBtn = el('button', 'btn secondary small', `Daily (${daily.id})`);
  dailyBtn.addEventListener('click', () => openBankProblem(daily));

  const nextBtn = el('button', 'btn primary', 'Next problem →');
  nextBtn.addEventListener('click', () => {
    const pool =
      problemFilter === 'due'
        ? problemsData.problems.filter((p) => dueIds.includes(p.id))
        : problemFilter === 'all'
        ? problemsData.problems
        : problemsData.problems.filter((p) => p.category === problemFilter);
    const list = pool.length > 0 ? pool : problemsData.problems;
    const curIdx = list.findIndex((p) => p.id === prob.id);
    openBankProblem(list[(curIdx + 1) % list.length]);
  });

  const hintBtn = el('button', 'btn secondary', 'Hint');
  hintBtn.addEventListener('click', () => {
    bankFeedback = prob.hint;
    speakText(prob.hint, state.speechOn);
    render();
  });

  const resetBtn = el('button', 'btn secondary', 'Reset');
  resetBtn.addEventListener('click', () => openBankProblem(prob));

  const explainBtn = el('button', 'btn secondary', 'Explain this move');
  explainBtn.addEventListener('click', async () => {
    bankFeedback = 'Asking coach…';
    render();
    try {
      const res = await fetch('./api/coach/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: prob.id,
          size: prob.size,
          komiX2: 15,
          handicap: 0,
          moves: [],
          moveIndex: 0,
          voice: state.eli5Mode ? 'beginner' : coachVoice,
          eli5: state.eli5Mode,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; label?: string; reply?: { summary: string; idea: string } };
      if (data.ok && data.reply) {
        bankFeedback = `${data.label ?? 'Written by AI'}: ${data.reply.summary} ${data.reply.idea}`;
      } else {
        bankFeedback = `Free note: ${prob.hint}`;
      }
    } catch {
      bankFeedback = `Free note: ${prob.hint}`;
    }
    render();
  });

  actions.append(dailyBtn, hintBtn, resetBtn, explainBtn, nextBtn);
  side.appendChild(actions);

  const filters = el('div', 'presets');
  (['all', 'capture', 'escape', 'tactics', 'due'] as const).forEach((f) => {
    const b = el('button', `btn secondary small ${problemFilter === f ? 'primary' : ''}`, f === 'due' ? `Due (${dueIds.length})` : f);
    b.addEventListener('click', () => {
      problemFilter = f;
      render();
    });
    filters.appendChild(b);
  });
  side.appendChild(filters);

  layout.append(boardBox, side);
  return layout;
}

function renderPlay(mode: 'computer' | 'shared'): HTMLElement {
  const layout = el('div', 'play-layout');
  const boardBox = el('div', 'board-box');

  if (currentGame) {
    renderBoard(boardBox, {
      size: engine.size,
      grid: engine.getGrid(),
      liberties: engine.getLiberties(),
      territory: territoryOverlay,
      deadPoints: deadOverlay,
      lastMove: engine.lastMove,
      ghostPoint,
      showHelpers: state.eli5Mode,
      highContrast: state.highContrast,
      disabled: false,
      onSelectPoint: handleBoardSelectInGame,
    });
  }

  const side = el('div', 'side-panel card');
  side.appendChild(el('h2', '', mode === 'computer' ? `Play Computer (GTG Level ${state.gtgLevel})` : 'Two on one device'));

  const presets = el('div', 'presets');
  if (mode === 'computer') {
    const configs: [string, number, number, number, number, number][] = [
      ['5x5 Capture (1)', 5, 0, 1, 0, 0],
      ['7x7 Capture (5)', 7, 0, 5, 1, 0],
      [`7x7 Level ${state.gtgLevel}`, 7, 15, 0, state.gtgLevel, 0],
      [`9x9 Level ${state.gtgLevel}`, 9, 15, 0, state.gtgLevel, 0],
      ['9x9 +2 Handicap', 9, 1, 0, state.gtgLevel, 2],
      ['13x13 Real Go', 13, 15, 0, state.gtgLevel, 0],
    ];
    for (const [label, sz, komi, cap, lvl, hc] of configs) {
      const b = el('button', 'btn secondary small', label);
      b.addEventListener('click', () => startNewGame('computer', sz, komi, cap, lvl, hc));
      presets.appendChild(b);
    }
  } else {
    for (const sz of [7, 9, 13, 19]) {
      const b = el('button', 'btn secondary small', `${sz}x${sz}`);
      b.addEventListener('click', () => startNewGame('shared', sz, 15, 0, 1, 0));
      presets.appendChild(b);
    }
  }
  side.appendChild(presets);

  if (currentGame) {
    const capTarget =
      currentGame.captureTarget > 0
        ? ` (first to ${currentGame.captureTarget})`
        : currentGame.handicap >= 2
        ? ` (${currentGame.handicap}-stone handicap, 0.5 komi)`
        : ' (Area scoring, 7.5 komi)';
    side.append(
      el('div', 'muted', `${currentGame.size}x${currentGame.size}${capTarget}${currentGame.assisted ? ' · Unranked' : ''}`),
      el('div', 'score-row', `Captures — Black: ${engine.captures(BLACK)} · White: ${engine.captures(WHITE)}`),
      el('div', 'feedback-box', playNote || scoreSummary || 'Make a move.')
    );

    const actions = el('div', 'actions');
    const undoBtn = el('button', 'btn secondary', 'Undo');
    undoBtn.disabled = currentGame.moves.length === 0 || engine.winner !== 0;
    undoBtn.addEventListener('click', undoLastMove);

    const passBtn = el('button', 'btn secondary', 'Pass');
    passBtn.disabled = engine.winner !== 0 || currentGame.captureTarget > 0;
    passBtn.addEventListener('click', () => handleBoardSelectInGame(PASS_POINT));

    const newBtn = el('button', 'btn primary', 'New game');
    newBtn.addEventListener('click', () =>
      startNewGame(
        mode,
        currentGame!.size,
        currentGame!.komiX2,
        currentGame!.captureTarget,
        mode === 'computer' ? state.gtgLevel : currentGame!.level,
        currentGame!.handicap
      )
    );

    actions.append(undoBtn, passBtn, newBtn);
    side.appendChild(actions);

    if (engine.winner !== 0 && currentGame.captureTarget === 0) {
      const coachRow = el('div', 'actions');
      const voiceBtn = el('button', 'btn secondary small', `Coach: ${coachVoice}`);
      voiceBtn.addEventListener('click', () => {
        coachVoice = coachVoice === 'beginner' ? 'club' : 'beginner';
        render();
      });

      const reviewBtn = el('button', 'btn secondary', 'AI Coach Review');
      reviewBtn.addEventListener('click', async () => {
        coachNotes = 'Analyzing key moments…';
        render();

        // Always compute free on-device concept notes as instant fallback
        const freeNotes: string[] = [];
        engine.newGame(currentGame!.size, currentGame!.komiX2, 0);
        if (currentGame!.handicap >= 2) engine.setupHandicap(currentGame!.handicap);
        for (let i = 0; i < currentGame!.moves.length; i++) {
          const mv = currentGame!.moves[i];
          if (mv >= 0) {
            const concepts = tagsToConcepts(engine.detectCoachTags(mv));
            if (concepts.length > 0) {
              freeNotes.push(`Move ${i + 1}: ${concepts[0].note}`);
            }
          }
          engine.play(mv);
        }
        const freeFallback =
          freeNotes.slice(-3).join(' ') || 'Good game! Review your corner openings and group liberties.';

        try {
          const res = await fetch('./api/coach/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              size: currentGame!.size,
              komiX2: currentGame!.komiX2,
              handicap: currentGame!.handicap,
              moves: currentGame!.moves,
              stage: 3,
              voice: state.eli5Mode ? 'beginner' : coachVoice,
              eli5: state.eli5Mode,
            }),
          });
          const data = (await res.json()) as { ok?: boolean; label?: string; reply?: { summary: string; idea: string } };
          if (data.ok && data.reply) {
            coachNotes = `${data.label ?? 'Written by AI'}: ${data.reply.summary} ${data.reply.idea}`;
          } else {
            coachNotes = `Free notes: ${freeFallback}`;
          }
        } catch {
          coachNotes = `Free notes: ${freeFallback}`;
        }
        replaySavedGame(currentGame!);
        render();
      });

      coachRow.append(voiceBtn, reviewBtn);
      side.appendChild(coachRow);
      if (coachNotes) {
        side.appendChild(el('div', 'feedback-box', coachNotes));
      }
    }
  }

  layout.append(boardBox, side);
  return layout;
}

function connectRoomSocket(code: string, token: string): void {
  if (roomSocket) {
    roomSocket.close();
    roomSocket = null;
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/rooms/${code}/ws?token=${encodeURIComponent(token)}`);
  roomSocket = ws;
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { type: string; seat?: 1 | 2; state?: RemoteRoomState; reason?: string };
      if (msg.type === 'state' && msg.state) {
        if (msg.seat) roomSeat = msg.seat;
        roomState = msg.state;
        engine.newGame(roomState.size, roomState.komiX2, 0);
        if (roomState.handicap >= 2) engine.setupHandicap(roomState.handicap);
        for (const mv of roomState.moves) engine.play(mv);
        roomStatus =
          roomState.phase === 'waiting'
            ? `Waiting for friend… Share code ${roomState.code}`
            : roomState.phase === 'marking'
            ? 'Double pass! Tap dead stones to mark, then both press Accept.'
            : roomState.phase === 'finished'
            ? roomState.score
              ? `Game over — Black ${roomState.score.black}, White ${roomState.score.white}`
              : `Game over — ${roomState.winner === BLACK ? 'Black' : 'White'} wins`
            : roomState.turn === roomSeat
            ? 'Your turn.'
            : "Friend's turn.";
        render();
      } else if (msg.type === 'error' && msg.reason) {
        roomStatus = msg.reason;
        render();
      }
    } catch {
      // Ignore malformed message
    }
  };
  ws.onclose = () => {
    if (roomState && roomState.phase !== 'finished') {
      roomStatus = 'Disconnected — reconnect with the same code or wait.';
      render();
    }
  };
}

function renderFriendRoom(): HTMLElement {
  const layout = el('div', 'play-layout');

  if (!roomState) {
    const createCard = el('div', 'card side-panel');
    createCard.append(
      el('h2', '', 'Create a room'),
      el('p', 'muted', 'No names, no chat, no sign-in. Hints and the coach are off in rooms (honour-based).')
    );

    const sizeRow = el('div', 'presets');
    for (const sz of [9, 13, 19]) {
      const b = el('button', `btn secondary small ${roomSizeOpt === sz ? 'primary' : ''}`, `${sz}x${sz}`);
      b.addEventListener('click', () => {
        roomSizeOpt = sz;
        render();
      });
      sizeRow.appendChild(b);
    }

    const hcRow = el('div', 'presets');
    for (const hc of [0, 2, 3, 4, 5, 9]) {
      const b = el('button', `btn secondary small ${roomHandicapOpt === hc ? 'primary' : ''}`, hc === 0 ? 'Even (7.5)' : `${hc}H (0.5)`);
      b.addEventListener('click', () => {
        roomHandicapOpt = hc;
        render();
      });
      hcRow.appendChild(b);
    }

    const clockBtn = el('button', `pill ${roomClocksOpt ? 'on' : ''}`, roomClocksOpt ? 'Clocks: 10m + 20s' : 'Clocks: OFF (5m/move)');
    clockBtn.addEventListener('click', () => {
      roomClocksOpt = !roomClocksOpt;
      render();
    });

    const createBtn = el('button', 'btn primary', 'Create room');
    createBtn.addEventListener('click', async () => {
      roomStatus = 'Creating room…';
      render();
      try {
        const res = await fetch('./api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ size: roomSizeOpt, handicap: roomHandicapOpt, clocksOn: roomClocksOpt }),
        });
        const data = (await res.json()) as { ok: boolean; seat?: 1; token?: string; state?: RemoteRoomState; reason?: string };
        if (data.ok && data.token && data.state) {
          roomSeat = 1;
          roomToken = data.token;
          roomState = data.state;
          connectRoomSocket(roomState.code, roomToken);
        } else {
          roomStatus = data.reason ?? 'Could not create room.';
          render();
        }
      } catch {
        roomStatus = 'Rooms require the Cloudflare Worker.';
        render();
      }
    });

    createCard.append(sizeRow, hcRow, clockBtn, createBtn);

    const joinCard = el('div', 'card side-panel');
    joinCard.append(el('h2', '', 'Join a room'));
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 6;
    input.placeholder = '6-char code';
    input.value = roomJoinCode;
    input.addEventListener('input', () => {
      roomJoinCode = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      input.value = roomJoinCode;
    });

    const joinBtn = el('button', 'btn primary', 'Join');
    joinBtn.addEventListener('click', async () => {
      if (roomJoinCode.length !== 6) {
        roomStatus = 'Enter a 6-character room code.';
        render();
        return;
      }
      roomStatus = 'Joining…';
      render();
      try {
        const res = await fetch(`./api/rooms/${roomJoinCode}/join`, { method: 'POST' });
        const data = (await res.json()) as { ok: boolean; seat?: 2; token?: string; state?: RemoteRoomState; reason?: string };
        if (data.ok && data.token && data.state) {
          roomSeat = 2;
          roomToken = data.token;
          roomState = data.state;
          connectRoomSocket(roomState.code, roomToken);
        } else {
          roomStatus = data.reason ?? 'Could not join room.';
          render();
        }
      } catch {
        roomStatus = 'Could not reach room.';
        render();
      }
    });

    joinCard.append(input, joinBtn, el('div', 'muted', roomStatus));
    layout.append(createCard, joinCard);
    return layout;
  }

  // Active room board
  const boardBox = el('div', 'board-box');
  const deadArr = new Uint8Array(roomState.size * roomState.size);
  for (const idx of roomState.deadMarks) deadArr[idx] = 1;

  renderBoard(boardBox, {
    size: roomState.size,
    grid: engine.getGrid(),
    deadPoints: roomState.phase === 'marking' ? deadArr : null,
    lastMove: engine.lastMove,
    ghostPoint,
    showHelpers: false, // Hints off in rooms
    highContrast: state.highContrast,
    disabled: roomState.phase === 'finished' || roomState.phase === 'waiting',
    onSelectPoint: (idx) => {
      if (!roomSocket || !roomState) return;
      if (roomState.phase === 'marking') {
        roomSocket.send(JSON.stringify({ type: 'toggle_mark', idx }));
        return;
      }
      if (roomState.phase === 'playing') {
        if (roomState.size >= 13 && ghostPoint !== idx) {
          if (engine.isLegal(idx) === PLAY_OK) {
            ghostPoint = idx;
            render();
            return;
          }
        }
        ghostPoint = -1;
        roomSocket.send(JSON.stringify({ type: 'play', idx }));
      }
    },
  });

  const side = el('div', 'side-panel card');
  const shareUrl = `${location.origin}/#room=${roomState.code}`;
  side.append(
    el('h2', '', `Room ${roomState.code} (You are ${roomSeat === 1 ? 'Black' : 'White'})`),
    el('div', 'muted', `Share link: ${shareUrl}`),
    el('div', 'feedback-box', roomStatus)
  );

  if (roomState.clocksOn) {
    const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    side.append(el('div', 'score-row', `Clocks — Black ${fmt(roomState.blackMs)} · White ${fmt(roomState.whiteMs)}`));
  }

  const actions = el('div', 'actions');
  if (roomState.phase === 'playing') {
    const passBtn = el('button', 'btn secondary', 'Pass');
    passBtn.disabled = roomState.turn !== roomSeat;
    passBtn.addEventListener('click', () => roomSocket?.send(JSON.stringify({ type: 'play', idx: PASS_POINT })));
    actions.appendChild(passBtn);
  } else if (roomState.phase === 'marking') {
    const marksHash = [...roomState.deadMarks].sort((a, b) => a - b).join(',');
    const accBtn = el('button', 'btn primary', roomState.accept[roomSeat - 1] ? 'Accepted ✓' : 'Accept dead stones');
    accBtn.addEventListener('click', () => roomSocket?.send(JSON.stringify({ type: 'accept_marks', hash: marksHash })));
    const disBtn = el('button', 'btn secondary', 'Disagree (resume)');
    disBtn.addEventListener('click', () => roomSocket?.send(JSON.stringify({ type: 'disagree_marks' })));
    actions.append(accBtn, disBtn);
  }

  const leaveBtn = el('button', 'btn secondary', 'Leave room');
  leaveBtn.addEventListener('click', () => {
    roomSocket?.close();
    roomSocket = null;
    roomState = null;
    roomSeat = 0;
    roomToken = '';
    render();
  });
  actions.appendChild(leaveBtn);
  side.appendChild(actions);

  layout.append(boardBox, side);
  return layout;
}

function submitQA(questionText: string): void {
  const q = questionText.trim();
  if (!q) return;
  const res = answerQuestion(q, state.eli5Mode);
  qaHistory.push({ q, title: res.title, answer: res.answer, lessonId: res.lessonId });
  qaInputDraft = '';
  speakText(res.answer, state.speechOn);
  render();
}

function renderQA(): HTMLElement {
  const card = el('div', 'card qa-wrap');
  card.append(
    el('h1', '', 'Ask about Go'),
    el(
      'p',
      'muted',
      'Instant on-device rules guide—no AI, no internet needed, and nothing you type leaves your device.'
    )
  );

  const chips = el('div', 'presets');
  for (const q of QUICK_QUESTIONS) {
    const b = el('button', 'btn secondary small', q);
    b.addEventListener('click', () => submitQA(q));
    chips.appendChild(b);
  }
  card.appendChild(chips);

  const form = document.createElement('form');
  form.className = 'qa-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'qa-input';
  input.placeholder = 'Ask a question (e.g. "what is atari?", "why can\'t I play there?", "how do we count?")';
  input.value = qaInputDraft;
  input.addEventListener('input', () => {
    qaInputDraft = input.value;
  });

  const askBtn = el('button', 'btn primary', 'Ask');
  askBtn.type = 'submit';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitQA(input.value);
  });
  form.append(input, askBtn);
  card.appendChild(form);

  if (qaHistory.length > 0) {
    const thread = el('div', 'qa-thread');
    for (const item of [...qaHistory].reverse()) {
      const msg = el('div', 'qa-item');
      msg.append(
        el('div', 'qa-q', item.q),
        el('div', 'qa-title', item.title),
        el('p', 'qa-a', item.answer)
      );
      if (item.lessonId) {
        const lesson = lessonsData.lessons.find((l) => l.id === item.lessonId);
        if (lesson) {
          const jump = el('button', 'link-btn', `Open lesson: ${lesson.title} →`);
          jump.addEventListener('click', () => {
            activeTab = 'learn';
            startLesson(lesson);
          });
          msg.appendChild(jump);
        }
      }
      thread.appendChild(msg);
    }
    const clearBtn = el('button', 'btn secondary small', 'Clear questions');
    clearBtn.addEventListener('click', () => {
      qaHistory = [];
      render();
    });
    card.append(thread, clearBtn);
  }

  return card;
}

async function boot(): Promise<void> {
  const [eng, lRes, pRes] = await Promise.all([
    RulesEngine.fromUrl('./rules.wasm'),
    fetch('./data/lessons.json'),
    fetch('./data/problems.json'),
  ]);
  engine = eng;
  lessonsData = (await lRes.json()) as LessonsPayload;
  problemsData = (await pRes.json()) as ProblemsPayload;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const hashMatch = location.hash.match(/room=([A-Z0-9]{6})/i);
  if (hashMatch) {
    roomJoinCode = hashMatch[1].toUpperCase();
    activeTab = 'friend';
  }

  render();
}

boot().catch((err) => {
  const root = document.getElementById('app');
  if (root) {
    root.textContent = `Could not start Good to Go: ${String(err)}`;
  }
});
