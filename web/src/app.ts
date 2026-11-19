import { renderBoard } from './board.js';
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
  DRAW,
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

type Tab = 'learn' | 'computer' | 'shared';

let engine: RulesEngine;
let lessonsData: LessonsPayload;
let state: UserState = loadState();
let activeTab: Tab = 'learn';

// Learn state
let currentLesson: Lesson | null = null;
let learnPhase: 'list' | 'demo' | 'problem' = 'list';
let problemIndex = 0;
let demoTimer: number | null = null;
let lessonFeedback = '';

// Play state (computer & shared)
let currentGame: SavedGame | null = null;
let ghostPoint = -1;
let playNote = '';
let territoryOverlay: Uint8Array | null = null;
let scoreSummary = '';

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

function replaySavedGame(game: SavedGame): void {
  engine.newGame(game.size, game.komiX2, game.captureTarget);
  for (const mv of game.moves) {
    engine.play(mv);
  }
  territoryOverlay = null;
  scoreSummary = '';
  if (engine.winner !== 0 && game.captureTarget === 0) {
    const sc = engine.areaScore();
    territoryOverlay = sc.territory;
    const winnerName = engine.winner === BLACK ? 'Black' : engine.winner === WHITE ? 'White' : 'Draw';
    scoreSummary = `Final area score — Black ${sc.black}, White ${sc.white} (${winnerName} wins)`;
  } else if (engine.winner !== 0) {
    const winnerName = engine.winner === BLACK ? 'Black' : 'White';
    scoreSummary = `${winnerName} wins Capture Go!`;
  }
}

function startNewGame(mode: 'computer' | 'shared', size: number, komiX2: number, captureTarget: number, level: number): void {
  currentGame = {
    mode,
    size,
    komiX2,
    captureTarget,
    level,
    playerColor: BLACK,
    moves: [],
    updatedAt: Date.now(),
  };
  ghostPoint = -1;
  playNote = mode === 'computer' ? 'Your turn (Black).' : 'Black to play.';
  replaySavedGame(currentGame);
  state.savedGame = currentGame;
  saveState(state);
  render();
}

function handleBoardSelectInGame(idx: number): void {
  if (!currentGame || engine.winner !== 0) return;
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

  const prevCaps = engine.captures(engine.turn);
  const warnings = idx === PASS_POINT ? 0 : engine.detectWarnings(idx);
  const res = engine.play(idx);
  if (res !== PLAY_OK) {
    playNote = statusMessage(res);
    render();
    return;
  }

  const capturedNow = engine.captures(currentGame.mode === 'computer' ? BLACK : (engine.turn === BLACK ? WHITE : BLACK)) > prevCaps;
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
    playNote = scoreSummary;
    playPassChime(state.soundOn);
    render();
    return;
  }

  if (currentGame.mode === 'computer' && engine.turn === WHITE) {
    playNote = warnText || 'Computer is thinking...';
    render();
    window.setTimeout(() => {
      if (!currentGame || engine.winner !== 0 || engine.turn !== WHITE) return;
      const aiMove = engine.chooseMove(currentGame.level);
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
        playNote = scoreSummary;
        playPassChime(state.soundOn);
      } else {
        playNote = aiMove === PASS_POINT ? 'Computer passed. Your turn!' : `Computer played ${coordLabel(currentGame.size, aiMove)}. Your turn!`;
      }
      render();
    }, 240);
    return;
  }

  const nextPlayer = engine.turn === BLACK ? 'Black' : 'White';
  playNote = warnText ? `${warnText} — ${nextPlayer} to play.` : `${nextPlayer} to play.`;
  render();
}

function undoLastMove(): void {
  if (!currentGame || currentGame.moves.length === 0) return;
  if (currentGame.mode === 'computer') {
    // Undo back to player's turn
    currentGame.moves.pop();
    if (currentGame.moves.length > 0 && currentGame.moves.length % 2 === 1) {
      currentGame.moves.pop();
    }
  } else {
    currentGame.moves.pop();
  }
  ghostPoint = -1;
  replaySavedGame(currentGame);
  state.savedGame = currentGame;
  saveState(state);
  playNote = 'Move undone.';
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

// --- Rendering ---

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;

  const shell = el('div', 'shell');

  // Header
  const header = el('header', 'topbar');
  const brand = el('div', 'brand');
  brand.append(el('span', 'brand-title', 'Good to Go'), el('span', 'brand-sub', 'go.prignano.ai'));

  const nav = el('nav', 'tabs');
  (['learn', 'computer', 'shared'] as Tab[]).forEach((t) => {
    const label = t === 'learn' ? 'Learn' : t === 'computer' ? 'Play Computer' : 'Two on One Device';
    const btn = el('button', `tab ${activeTab === t ? 'active' : ''}`, label);
    btn.addEventListener('click', () => {
      clearDemoTimer();
      stopSpeech();
      activeTab = t;
      if (t === 'computer' && (!currentGame || currentGame.mode !== 'computer')) {
        if (state.savedGame && state.savedGame.mode === 'computer') {
          currentGame = state.savedGame;
          replaySavedGame(currentGame);
          playNote = 'Resumed your saved game.';
        } else {
          startNewGame('computer', 5, 0, 1, 0);
          return;
        }
      }
      if (t === 'shared' && (!currentGame || currentGame.mode !== 'shared')) {
        if (state.savedGame && state.savedGame.mode === 'shared') {
          currentGame = state.savedGame;
          replaySavedGame(currentGame);
          playNote = 'Resumed shared board.';
        } else {
          startNewGame('shared', 7, 15, 0, 0);
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
  } else if (activeTab === 'computer') {
    main.appendChild(renderPlay('computer'));
  } else {
    main.appendChild(renderPlay('shared'));
  }
  shell.appendChild(main);

  // Footer with device-local data controls
  const footer = el('footer', 'footer');
  footer.appendChild(el('span', 'muted', 'Progress stays on this device. No analytics or accounts.'));
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
    if (confirm('Delete all saved lessons and games on this device?')) {
      state = clearAllState();
      currentGame = null;
      currentLesson = null;
      learnPhase = 'list';
      render();
    }
  });

  dataBtns.append(exportBtn, importBtn, delBtn);
  footer.appendChild(dataBtns);
  shell.appendChild(footer);

  root.replaceChildren(shell);
}

function renderLearn(): HTMLElement {
  const wrap = el('div', 'learn-wrap');

  if (learnPhase === 'list' || !currentLesson) {
    const intro = el('div', 'card');
    intro.append(
      el('h1', '', 'Learn Go, step by step'),
      el('p', 'muted', `Completed ${state.completedLessons.length} of ${lessonsData.lessons.length} lessons · Stage 1 Capture Go wins: ${state.captureWinsStage1}/3`)
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
  const pulse = learnPhase === 'problem' && currentLesson.problems[problemIndex].targetPoint >= 0
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

function renderPlay(mode: 'computer' | 'shared'): HTMLElement {
  const layout = el('div', 'play-layout');
  const boardBox = el('div', 'board-box');

  if (currentGame) {
    renderBoard(boardBox, {
      size: engine.size,
      grid: engine.getGrid(),
      liberties: engine.getLiberties(),
      territory: territoryOverlay,
      lastMove: engine.lastMove,
      ghostPoint,
      showHelpers: state.eli5Mode,
      highContrast: state.highContrast,
      disabled: engine.winner !== 0,
      onSelectPoint: handleBoardSelectInGame,
    });
  }

  const side = el('div', 'side-panel card');
  side.appendChild(el('h2', '', mode === 'computer' ? 'Play the computer' : 'Two on one device'));

  // Presets
  const presets = el('div', 'presets');
  if (mode === 'computer') {
    const configs: [string, number, number, number, number][] = [
      ['5x5 Capture (1)', 5, 0, 1, 0],
      ['7x7 Capture (5)', 7, 0, 5, 1],
      ['7x7 Real Go', 7, 15, 0, 3],
      ['9x9 Real Go', 9, 15, 0, 3],
    ];
    for (const [label, sz, komi, cap, lvl] of configs) {
      const b = el('button', 'btn secondary small', label);
      b.addEventListener('click', () => startNewGame('computer', sz, komi, cap, lvl));
      presets.appendChild(b);
    }
  } else {
    for (const sz of [7, 9, 13, 19]) {
      const b = el('button', 'btn secondary small', `${sz}x${sz}`);
      b.addEventListener('click', () => startNewGame('shared', sz, 15, 0, 0));
      presets.appendChild(b);
    }
  }
  side.appendChild(presets);

  if (currentGame) {
    const capTarget = currentGame.captureTarget > 0 ? ` (first to ${currentGame.captureTarget})` : ' (Area scoring, 7.5 komi)';
    side.append(
      el('div', 'muted', `${currentGame.size}x${currentGame.size}${capTarget}`),
      el('div', 'score-row', `Captures — Black: ${engine.captures(BLACK)} · White: ${engine.captures(WHITE)}`),
      el('div', 'feedback-box', playNote || scoreSummary || 'Make a move.')
    );

    const actions = el('div', 'actions');
    const undoBtn = el('button', 'btn secondary', 'Undo');
    undoBtn.disabled = currentGame.moves.length === 0;
    undoBtn.addEventListener('click', undoLastMove);

    const passBtn = el('button', 'btn secondary', 'Pass');
    passBtn.disabled = engine.winner !== 0 || currentGame.captureTarget > 0;
    passBtn.addEventListener('click', () => handleBoardSelectInGame(PASS_POINT));

    const newBtn = el('button', 'btn primary', 'New game');
    newBtn.addEventListener('click', () =>
      startNewGame(mode, currentGame!.size, currentGame!.komiX2, currentGame!.captureTarget, currentGame!.level)
    );

    actions.append(undoBtn, passBtn, newBtn);
    side.appendChild(actions);
  }

  layout.append(boardBox, side);
  return layout;
}

async function boot(): Promise<void> {
  const [eng, res] = await Promise.all([
    RulesEngine.fromUrl('./rules.wasm'),
    fetch('./data/lessons.json'),
  ]);
  engine = eng;
  lessonsData = (await res.json()) as LessonsPayload;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
}

boot().catch((err) => {
  const root = document.getElementById('app');
  if (root) {
    root.textContent = `Could not start Good to Go: ${String(err)}`;
  }
});
