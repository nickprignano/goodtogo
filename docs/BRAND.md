# Good to Go — Brand Identity Guide (`v1.0.0`)

**Product:** Good to Go (`go.prignano.ai`)  
**Studio:** Quiet Arcades (`prignano.ai` / `prignano-theme`)  
**Format:** All-ages, installable Progressive Web App (PWA) for learning and playing Go—from a first 5×5 Capture Go game to full 19×19 play.

## 1. Visual Philosophy — *The Quiet Goban*

Good to Go belongs to the **Quiet Arcades** studio family (`prignano.ai` / `prignano-theme`): calm, tactile, modern editorial software that respects the player's time and focus. There are no streak flames, confetti cannons, coin counters, third-party font trackers, or cluttered sidebars.

Traditional Go equipment endures because of its material honesty: warm golden *kaya* wood, matte *Nachi* black slate stones, luminous *hamaguri* white clamshell stones, and crisp *urushi* lacquer lines. Good to Go translates those physical materials into crisp **SVG geometry** and **CSS custom properties**:

- **Tactile without skeuomorphic bloat:** Subtle vector lighting and 1–2px mineral rims give black slate and white shell stones physical weight without heavy raster woodgrain textures.
- **Scales across ages and board sizes:** The visual hierarchy stays calm and legible whether an 8-year-old is counting liberties on a **5×5** Capture Go board or an adult is playing a full **19×19** evening game.
- **Daylight paper & lamp-lit evening slate:** Light mode pairs warm Washi paper (`#F7F5F0`) with sunlit Hon-Kaya (`#DCB56E`). Dark mode pairs Evening Slate (`#111317`) with dimmed, lamp-lit Kaya (`#826135`)—preventing nighttime glare while keeping both black and white stones effortlessly distinct.

## 2. Cultural Respect & Authenticity

Go (*Weiqi* 围棋 in China, *Baduk* 바둑 in Korea, *Igo* 囲碁 in Japan) carries more than four millennia of shared East Asian intellectual and artistic heritage. Good to Go honors that lineage with quiet dignity and geometric clarity:

- **100% original nomenclature and artwork:** Every mark, stone style, teaching indicator, and copy pattern is custom-designed for `go.prignano.ai`—never borrowing names, mascots, audio, or board graphics from existing Go servers, apps, or books.
- **Zero stereotypes or faux-calligraphy:** Never use "brushstroke/chop-suey" novelty fonts, orientalist motifs, gong tropes, or caricature avatars. Let clean modern typography and authentic goban proportions speak for themselves.
- **Accurate, welcoming terminology:** Introduce traditional Go vocabulary naturally alongside plain English—*liberties* (breathing spaces), *atari* (one breathing space left), *komi* (points given to White for playing second), and *hoshi* (star points)—explaining each term cleanly in context.

## 3. Tone of Voice — *The Patient Teacher*

Good to Go speaks like a warm, unhurried teacher sitting across a wooden board. Plain English comes first so kids feel confident immediately, without talking down to adults.

| Moment | Good to Go Voice (Do) | Gamified / Cliché Voice (Don't) |
| :--- | :--- | :--- |
| **First 5×5 Lesson** | "Every stone needs breathing spaces—called *liberties*—along the lines next to it. Place a black stone on the blue dot to surround White." | "EPIC COMBO! Smash the enemy piece to level up your Dojo Rank!" |
| **Stone in Atari** | "Heads up: this group is in *atari*—it has only one liberty left. Connect at **F6** to stay safe, or play elsewhere if you see a bigger move." | "DANGER!! Critical blunder detected! Fix immediately!" |
| **Illegal Self-Capture** | "That intersection has no open liberties right now, unless your stone captures the surrounding stones first." | "Invalid move (Error 0x04: Suicide rule violation)." |
| **Game Complete** | "Both players passed. Black holds **24** points of territory and captures; White holds **22.5** (including 5.5 *komi*). Well played—want to review key turns?" | "VICTORY! +50 XP! Share your win streak now!" |

**Voice Rules:**
1. **Plain words, real geometry:** Explain *why* a group is connected ("stones share liberties up, down, left, and right—not diagonally") before naming shapes like *kosumi*.
2. **Curiosity over punishment:** Frame mistakes as interesting board questions rather than flashing error banners.
3. **Calm punctuation:** Use sentence case and measured pacing; avoid all-caps shouting and exclamation-mark inflation.

## 4. Logo System & Mark Geometry

All vector marks are pure, lightweight SVG (`0.8 KB` to `22 KB`) with zero external font dependencies (`Good to Go` in wordmarks and the Open Graph card is outlined directly as precision vector paths).

| Asset Path | ViewBox | Primary Role |
| :--- | :--- | :--- |
| `logo/logo-mark.svg` | `512×512` | Primary square app icon (`rx="108"` kaya tile), splash emblem, and avatar mark. |
| `logo/logo-wordmark.svg` | `365×96` | Adaptive horizontal lockup using `@media (prefers-color-scheme: dark)`. |
| `logo/logo-wordmark-light.svg` | `365×96` | Explicit light-mode horizontal lockup (`#16171A` Sumi ink). |
| `logo/logo-wordmark-dark.svg` | `365×96` | Explicit dark-mode horizontal lockup (`#F0EEE9` Moonlit Paper ink). |
| `icons/favicon.svg` | `32×32` | Pixel-snapped optical reduction tailored for `16×16` and `32×32` browser tabs. |
| `icons/icon-maskable.svg` | `512×512` | Full-bleed adaptive PWA icon (`purpose: "maskable"`). |
| `social/og-card.svg` | `1200×630` | Open Graph social preview card for `https://go.prignano.ai`. |

### Why *"The Open Corner"* Avoids the Othello Trap
A symmetric 2×2 alternating black-white-white-black grid is the universal starting position of Othello/Reversi—not Go. Good to Go's mark depicts a `2×2` intersection lattice where:
- **`[0,0]` & `[1,1]`** hold Nachi black slate stones in a classic diagonal *kosumi* relationship.
- **`[0,1]`** holds a Hamaguri white clamshell stone with a warm mineral rim.
- **`[1,0]`** remains an **open crosshair intersection** marked with Quiet Arcades' Hanko Vermilion point—immediately showing that Go stones sit *on intersections* and leaving an open liberty ("Good to Go").

### Maskable Safe Zone & Sizing Rules
- **W3C Maskable Compliance:** In `icons/icon-maskable.svg`, every stone edge and grid line tip sits within `r = 149px` of `(256, 256)` (`58.2%` of canvas width)—well inside the W3C 80% safe circle (`r = 204.8px`), guaranteeing zero clipping in circle, squircle, and teardrop OS masks.
- **Clearspace:** Maintain at least `25%` of the mark's width on all sides (`20px` clearspace around an `80px` mark).
- **Minimum Size:** Use `icons/favicon.svg` at `16px–32px`, and `logo/logo-mark.svg` at `36px` and above.

## 5. Color System & Contrast (`tokens.css`)

All 13 required CSS custom properties adapt automatically via `:root` and `@media (prefers-color-scheme: dark)` (plus `[data-theme="light"]` and `[data-theme="dark"]` hooks for manual theme toggles).

| Token | Light Mode (Daylight Washi) | Dark Mode (Evening Slate) | Semantic Role & Verified Contrast Notes |
| :--- | :--- | :--- | :--- |
| `--bg` | `#F7F5F0` | `#111317` | App canvas (`prignano-theme` Washi paper / Evening Slate). |
| `--surface` | `#FFFFFF` | `#191C22` | Elevated cards, drawers, player HUD panels, and dialogs. |
| `--text` | `#16171A` | `#F0EEE9` | Primary ink — **16.5:1** (Light) / **16.0:1** (Dark) WCAG AAA on `--bg`. |
| `--muted` | `#555962` | `#9CA2AE` | Secondary copy & labels — **6.4:1** (Light) / **7.3:1** (Dark) WCAG AA+ on `--bg`. |
| `--border` | `#DDD8CE` | `#2A2F3A` | Hairline structural dividers and card outlines. |
| `--accent` | `#C2361E` | `#FF6B4A` | Quiet Arcades Hanko Vermilion CTA — **5.5:1** on `#FFFFFF` / **6.6:1** on `#111317`. |
| `--board` | `#DCB56E` | `#826135` | Goban wood fill. Dark mode sits near the luminance midpoint between black and white stones to prevent glare. |
| `--board-line` | `#382812` | `#1A1208` | Urushi lacquer intersections & star points — **7.3:1** on daylight `--board`. |
| `--stone-black` | `#17191D` | `#111316` | Matte Nachi slate stone fill (paired with `--stone-black-rim` subtle edge). |
| `--stone-white` | `#FAF8F2` | `#ECE8DF` | Warm Hamaguri clamshell stone fill (paired with `--stone-white-rim` mineral outline). |
| `--atari` | `#C42B1C` | `#FF6652` | Urgent 1-liberty danger indicator (warm Persimmon-Vermilion axis). |
| `--liberty` | `#075670` | `#7CE8FF` | Open-liberty dot (cool Cerulean-Cyan axis; **4.2:1** / **4.0:1** direct contrast on `--board` + halo). |
| `--pulse` | `#23538A` | `#7AB4F8` | Last-move indicator, focus halo, and interactive move prompt. |

### Colorblind-Safe Teaching Marks (Double-Encoded Geometry)
Many Go apps color liberties green and atari red—a combination that merges into muddy olive on a yellow-ochre board for players with red-green color deficiency (deuteranopia/protanopia). Good to Go enforces **two independent safeguards**:
1. **Opponent Hue Separation:** Teaching marks pair **Cerulean Blue-Cyan (`--liberty`)** against **Persimmon-Vermilion (`--atari`)**, maintaining strong chromatic and luminance separation across Deuteranopia, Protanopia, and Tritanopia.
2. **Distinct Vector Shapes (Never Color Alone):**
   - **Liberty (`--liberty`):** Small **filled circle (`●`)** framed by a `--mark-halo` ring *on empty intersections*.
   - **Atari (`--atari`):** **Hollow concentric/dashed danger ring (`◎`)** drawn *on threatened stones*.
   - **Last Move / Hint (`--pulse`):** **Single clean target ring (`◯`)** marking the latest move or suggested intersection.

## 6. Typography Stack

Good to Go loads **zero external font files or third-party CDNs**, guaranteeing instant offline PWA startup and full player privacy:

- **Primary UI & Teaching Copy (`--font-sans`):**
  `'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
  Clean geometric forms with open apertures for young readers and crisp small-size legibility.
- **Editorial Lesson Titles (`--font-serif`):**
  `'Newsreader', 'Charter', 'Bitstream Charter', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif`
  Used sparingly for chapter headers, rulebook introductions, and calm post-game summaries.
- **Coordinates, Captures & Clocks (`--font-mono`):**
  `'JetBrains Mono', ui-monospace, 'SFMono-Regular', 'Cascadia Code', Consolas, 'Liberation Mono', monospace`
  Always pair with `font-variant-numeric: tabular-nums` so timers, capture counts, and `A1–T19` coordinates never jitter horizontally. Standard Go coordinates omit **`I`** (`A–H, J–T`) to avoid confusion with `1`.

## 7. Usage Rules & PWA Integration

### Do's & Don'ts
- **Do** keep generous `--bg` margin around the goban so the board stays the calm visual focal point across phone, tablet, and desktop viewports.
- **Do** omit the letter **`I`** in board coordinates (`A B C D E F G H J...`) per international Go convention.
- **Do** honor `prefers-reduced-motion: reduce` by disabling `.gtg-pulse` scaling animations automatically via `tokens.css`.
- **Don't** stretch or rotate the goban mark, recolor stones into neon arcade hues, or overlay busy textures onto `--board`.
- **Don't** convey atari or capture state by sound or color alone—always pair with the geometric ring/dot indicators.

### Drop-In HTML Head Snippet
```html
<link rel="stylesheet" href="/tokens.css">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#F7F5F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111317" media="(prefers-color-scheme: dark)">
<meta property="og:image" content="https://go.prignano.ai/social/og-card.svg">
```
