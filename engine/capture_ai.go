package engine

// ChooseMove selects a computer move for b.Turn.
// level:
//   0 = very gentle Capture Go (misses ataris ~40% of the time, plays randomly often)
//   1 = gentle Capture Go (takes captures, sometimes misses saving own atari)
//   2 = solid Capture Go (takes captures, saves atari, extends liberties)
//   3 = Stage 3 real-game 7x7/9x9 player (avoids own eyes, captures, basic territory)
func ChooseMove(b *Board, level int, seed uint64) int {
	if b.Winner != Empty {
		return PassPoint
	}
	if seed == 0 {
		seed = uint64(b.MoveCount+1)*0x9e3779b97f4a7c15 ^ b.Hash ^ 0x517cc1b727220a95
	}
	rng := func() uint64 {
		seed ^= seed << 13
		seed ^= seed >> 7
		seed ^= seed << 17
		return seed
	}

	nPts := b.NumPoints()
	color := b.Turn
	opp := Opponent(color)

	var legal [MaxPoints]int
	legalCount := 0
	for i := 0; i < nPts; i++ {
		if b.IsLegal(i) == PlayOK {
			legal[legalCount] = i
			legalCount++
		}
	}
	if legalCount == 0 {
		return PassPoint
	}

	// Score each legal move using simple tactical features + level blind spots.
	bestScore := -1_000_000
	var bestMoves [MaxPoints]int
	bestCount := 0

	var stones, libs [MaxPoints]int
	var visited [MaxPoints]uint8
	var nb [4]int

	for li := 0; li < legalCount; li++ {
		p := legal[li]
		score := 0

		// Never fill own true eye in real-game mode (level >= 3) or level 2.
		if level >= 2 && b.IsOwnEye(p, color) {
			score -= 5000
		}

		// Simulate move on a clone
		cp := b.Clone()
		prevCaps := cp.Captures[color]
		cp.Play(p)
		gained := cp.Captures[color] - prevCaps

		if gained > 0 {
			if level == 0 && (rng()%100) < 40 {
				// Level 0 blind spot: occasionally misses an immediate capture
				score += 5
			} else {
				score += 1000 + gained*200
			}
		}

		myLibs := cp.GroupLiberties(p)
		if myLibs == 1 {
			if level >= 2 {
				score -= 400 // avoid self-atari
			} else if level == 1 && (rng()%100) < 60 {
				score -= 200
			}
		} else if myLibs >= 3 {
			score += 20
		}

		// Check if this move saves an adjacent friendly group from atari
		nbCount := b.neighbors(p, &nb)
		for j := 0; j < nbCount; j++ {
			np := nb[j]
			if b.Grid[np] == color {
				if b.GroupLiberties(np) == 1 && myLibs > 1 {
					if level == 0 && (rng()%100) < 65 {
						// Level 0 often ignores atari
					} else if level == 1 && (rng()%100) < 35 {
						// Level 1 sometimes misses atari
					} else {
						score += 600
					}
				}
			} else if b.Grid[np] == opp {
				// Putting opponent in atari
				if cp.Grid[np] == opp && cp.GroupLiberties(np) == 1 {
					if level >= 1 {
						score += 250
					}
				}
				// Contact / pressure
				score += 15
			}
		}

		// Encourage center/star-point play early on small boards
		r, c := p/b.Size, p%b.Size
		dr := r - b.Size/2
		dc := c - b.Size/2
		if dr < 0 {
			dr = -dr
		}
		if dc < 0 {
			dc = -dc
		}
		if b.CaptureTarget > 0 {
			score += (b.Size - (dr + dc)) * 4
		} else {
			// In real games, avoid 1st line early unless capturing/saving
			if r == 0 || r == b.Size-1 || c == 0 || c == b.Size-1 {
				score -= 25
			}
			// Prefer 3rd line / star points
			if (r == 2 || r == b.Size-3) && (c == 2 || c == b.Size-3) {
				score += 25
			}
		}

		// Add small jitter so games vary
		jitter := int(rng() % 18)
		if level == 0 {
			jitter = int(rng() % 120)
		} else if level == 1 {
			jitter = int(rng() % 45)
		}
		score += jitter

		if score > bestScore {
			bestScore = score
			bestMoves[0] = p
			bestCount = 1
		} else if score == bestScore {
			bestMoves[bestCount] = p
			bestCount++
		}
	}

	// In real games (CaptureTarget == 0), pass if only terrible/own-eye moves remain
	if b.CaptureTarget == 0 && b.MoveCount >= b.Size*b.Size/2 && bestScore < -1000 {
		return PassPoint
	}

	_ = stones
	_ = libs
	_ = visited
	return bestMoves[int(rng()%uint64(bestCount))]
}
