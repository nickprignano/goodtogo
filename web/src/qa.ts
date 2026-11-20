// Local, zero-LLM Q&A matcher for Go rules, terms, and Good to Go features.
// Runs 100% on the device with no network requests.

export interface QAEntry {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
  eli5Answer: string;
  lessonId?: string;
}

export const QA_ENTRIES: QAEntry[] = [
  {
    id: 'goal',
    title: 'How do you win Go?',
    keywords: ['win', 'goal', 'objective', 'point', 'points', 'score', 'territory', 'space', 'how to play', 'basics'],
    answer:
      'In standard Go, you win by surrounding more total area (your stones on the board plus empty intersections completely surrounded by your color) than your opponent. In Stage 1–2 Capture Go, the first player to capture the target number of stones wins.',
    eli5Answer:
      'Think of building fences around empty land! At the end, whoever has the most stones + fenced-in empty spots wins. In Capture Go (Stages 1–2), you just race to capture stones first!',
    lessonId: 's3-habits',
  },
  {
    id: 'liberties',
    title: 'What are liberties?',
    keywords: ['liberty', 'liberties', 'breathe', 'breathing', 'dot', 'dots', 'empty'],
    answer:
      'Liberties are the empty intersections directly connected to a stone or group along the grid lines (up, down, left, right—never diagonally). Connected stones of the same color share their liberties.',
    eli5Answer:
      'Liberties are a stone’s breathing spots—the empty dots right next to it on the lines (not diagonal). When stones hold hands in a row, they share breathing spots!',
    lessonId: 's1-liberties',
  },
  {
    id: 'capture',
    title: 'How do you capture stones?',
    keywords: ['capture', 'capturing', 'take', 'remove', 'prisoner', 'surround'],
    answer:
      'When you place a stone that covers the very last liberty of an opponent’s stone or connected group, those opponent stones are immediately removed from the board as captures.',
    eli5Answer:
      'Cover every breathing dot around an enemy stone (or group) and—pop!—it comes off the board.',
    lessonId: 's1-capturing',
  },
  {
    id: 'atari',
    title: 'What does atari mean?',
    keywords: ['atari', 'red', 'ring', 'warning', 'one liberty', '1 liberty', 'danger'],
    answer:
      'Atari means a stone or group has only 1 liberty left. If the player does not save it (by extending, connecting, or capturing an adjacent enemy group), the opponent can capture it on the next move.',
    eli5Answer:
      'Atari means “watch out, only 1 breathing spot left!” In ELI5 Helper mode, a red ring appears around stones in atari.',
    lessonId: 's1-atari',
  },
  {
    id: 'suicide',
    title: "Why can't I play there? (No suicide)",
    keywords: ['illegal', 'cant', "can't", 'why', 'not allowed', 'suicide', 'self-capture', 'blocked', 'zero liberties'],
    answer:
      'A move is illegal if your placed stone (and its connected group) would have zero liberties—unless that move immediately captures at least one opponent stone first, which creates liberties.',
    eli5Answer:
      'You aren’t allowed to drop a stone into a spot with zero breathing room—unless doing so captures the enemy stones around it first!',
    lessonId: 's2-suicide',
  },
  {
    id: 'ko',
    title: 'What is ko (repeating a position)?',
    keywords: ['ko', 'superko', 'repeat', 'recapture', 'infinite', 'loop', 'back and forth'],
    answer:
      'The ko rule prevents infinite back-and-forth captures. You cannot play a move that recreates an earlier board position. You must play at least one move elsewhere (a ko threat) before recapturing.',
    eli5Answer:
      'You can’t immediately take back a single stone if it makes the exact same board repeat forever. Play somewhere else first, then come back!',
    lessonId: 's4-ko',
  },
  {
    id: 'two-eyes',
    title: 'What are two eyes and why do they live?',
    keywords: ['eye', 'eyes', 'two eyes', 'live', 'alive', 'immortal', 'unkillable', 'false eye'],
    answer:
      'An eye is an empty space surrounded by your stones. A group with two separate eyes can never be captured, because the opponent cannot fill both last liberties at once without committing illegal suicide. A false eye has enemy stones on its corners and can be poked out.',
    eli5Answer:
      'Two separate inside holes (“two eyes”) keep a group safe forever, because your opponent isn’t allowed to jump into both holes at the same time!',
    lessonId: 's2-two-eyes',
  },
  {
    id: 'counting',
    title: 'How does counting & scoring work?',
    keywords: ['count', 'counting', 'area', 'score', 'scoring', 'territory', 'dead', 'pass', 'end'],
    answer:
      'When both players pass, the game ends. Good to Go uses area scoring: 1 point for every stone you have on the board plus 1 point for every empty intersection surrounded only by your color. Dead stones inside enemy territory are removed before counting.',
    eli5Answer:
      'When both players pass, the app counts every stone you have on the board plus every empty spot trapped inside your fences!',
    lessonId: 's3-counting',
  },
  {
    id: 'komi',
    title: 'What is komi (7.5 points)?',
    keywords: ['komi', '7.5', '7.5 points', '0.5', 'half', 'white', 'first move', 'advantage'],
    answer:
      'Because Black gets the advantage of playing first, White receives extra points called komi: 7.5 points in even games (or 0.5 in handicap games). The .5 prevents ties.',
    eli5Answer:
      'Black gets to go first, which is a nice head start—so White gets 7.5 bonus points to keep things fair. The “.5” means there can never be a tie!',
    lessonId: 's3-counting',
  },
  {
    id: 'handicap',
    title: 'What are handicap stones?',
    keywords: ['handicap', 'star', 'hoshi', 'head start', 'extra stones'],
    answer:
      'Handicap stones are 2 to 9 Black stones placed on the star points before White makes the first move, giving a newer player a fair game against a stronger opponent. Komi drops to 0.5.',
    eli5Answer:
      'If one player is stronger, the other player gets to put 2 or more Black stones on the board at the start as a head start!',
  },
  {
    id: 'ladders-nets',
    title: 'What are ladders and nets?',
    keywords: ['ladder', 'net', 'snapback', 'throw-in', 'throw in', 'tactic', 'tactics'],
    answer:
      'Ladders chase an enemy stone in a zig-zag toward the edge of the board. Nets surround it loosely from a step away so it has no escape. Snapbacks and throw-ins sacrifice a stone to immediately capture a larger group back.',
    eli5Answer:
      'Ladders chase a stone zig-zag into the wall, nets block its escape from a step away, and snapbacks give up 1 stone to gobble up a bigger group!',
    lessonId: 's4-ladders',
  },
  {
    id: 'coordinates',
    title: 'Why is there no letter "I" on Go boards?',
    keywords: ['coordinate', 'coordinates', 'letter', 'letters', 'letter i', 'skip', 'd4', 'board'],
    answer:
      'Standard Go board coordinates label columns A through T but skip the letter "I" so it is never confused with the number "1".',
    eli5Answer:
      'Go boards skip the letter “I” so nobody mixes it up with the number “1”!',
  },
  {
    id: 'eli5-mode',
    title: 'What does ELI5 Helper mode do?',
    keywords: ['eli5', 'helper', 'toggle', 'blue dot', 'unranked', 'coach'],
    answer:
      'ELI5 Helper mode keeps blue liberty dots, red atari rings, and plain-language warnings turned on during games, and sets the AI Coach to Beginner voice. Ranked games vs the computer played with it on do not change your GTG level.',
    eli5Answer:
      'Turning ELI5 Helper ON shows blue breathing dots, red “watch out!” rings, and friendly hints while you play!',
  },
];

export const QUICK_QUESTIONS = [
  'How do you win Go?',
  'What is atari?',
  "Why can't I play there?",
  'What is ko?',
  'How does counting work?',
  'What is komi?',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export function answerQuestion(query: string, eli5: boolean): {
  title: string;
  answer: string;
  lessonId?: string;
  matched: boolean;
} {
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      title: 'Ask anything about Go',
      answer: 'Type a question or tap one of the quick questions above.',
      matched: false,
    };
  }

  const tokens = tokenize(q);
  let best: QAEntry | null = null;
  let bestScore = 0;

  for (const entry of QA_ENTRIES) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (kw.includes(' ') && q.includes(kw)) {
        score += 5;
      } else {
        for (const t of tokens) {
          if (kw === t) score += 3;
          else if (kw.length >= 3 && t.length >= 3 && (kw.startsWith(t) || t.startsWith(kw))) score += 1;
        }
      }
    }
    if (entry.title.toLowerCase().includes(q)) score += 4;

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best || bestScore < 3) {
    return {
      title: 'I’m not sure about that one yet',
      answer:
        'Try asking about liberties, atari, capturing, ko, two eyes, komi, counting, handicap stones, or why a move isn’t allowed.',
      matched: false,
    };
  }

  return {
    title: best.title,
    answer: eli5 ? best.eli5Answer : best.answer,
    lessonId: best.lessonId,
    matched: true,
  };
}
