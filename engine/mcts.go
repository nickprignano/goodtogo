package engine

import "math"

// ChooseMoveGTG selects a move for GTG levels 1..10.
// Levels 1..3 use tactical heuristics with deliberate blind spots.
// Levels 4..6 use light Monte Carlo playouts (80..240) with occasional blind spots.
// Levels 7..10 use UCT / Monte Carlo evaluation (320..900 playouts).
func ChooseMoveGTG(b *Board, gtgLevel int, seed uint64) int {
	if b.Winner != Empty {
		return PassPoint
	}
	if gtgLevel < 1 {
		gtgLevel = 1
	}
	if gtgLevel > 10 {
		gtgLevel = 10
	}
	if seed == 0 {
		seed = uint64(b.MoveCount+1)*0x9e3779b97f4a7c15 ^ b.Hash ^ 0x517cc1b727220a95
	}

	if gtgLevel <= 3 {
		return ChooseMove(b, gtgLevel, seed)
	}

	playouts := 80
	switch gtgLevel {
	case 4:
		playouts = 80
	case 5:
		playouts = 140
	case 6:
		playouts = 220
	case 7:
		playouts = 340
	case 8:
		playouts = 500
	case 9:
		playouts = 700
	case 10:
		playouts = 950
	}

	// Scale playouts down slightly on 13x13 / 19x19 to keep move time snappy on phones
	if b.Size >= 13 {
		playouts = playouts / 2
	}
	if b.Size == 19 {
		playouts = playouts / 2
	}
	if playouts < 40 {
		playouts = 40
	}

	return mctsChooseMove(b, playouts, gtgLevel, seed)
}

func nextRng(s *uint64) uint64 {
	x := *s
	x ^= x << 13
	x ^= x >> 7
	x ^= x << 17
	*s = x
	return x
}

func mctsChooseMove(b *Board, totalPlayouts int, gtgLevel int, seed uint64) int {
	nPts := b.NumPoints()
	color := b.Turn

	var cands [MaxPoints]int
	candCount := 0
	for i := 0; i < nPts; i++ {
		if b.IsLegal(i) == PlayOK && !b.IsOwnEye(i, color) {
			cands[candCount] = i
			candCount++
		}
	}
	if candCount == 0 {
		return PassPoint
	}

	var visits [MaxPoints]int
	var wins [MaxPoints]float64

	// Seed 1 playout per candidate, then UCB1
	for i := 0; i < candCount && i < totalPlayouts; i++ {
		mv := cands[i]
		w := runPlayoutFromMove(b, mv, color, &seed)
		visits[i] = 1
		wins[i] = w
	}

	for p := candCount; p < totalPlayouts; p++ {
		bestIdx := 0
		bestUCB := -1e9
		logP := math.Log(float64(p + 1))
		for i := 0; i < candCount; i++ {
			v := float64(visits[i])
			ucb := (wins[i] / v) + 0.75*math.Sqrt(logP/v)
			if ucb > bestUCB {
				bestUCB = ucb
				bestIdx = i
			}
		}
		w := runPlayoutFromMove(b, cands[bestIdx], color, &seed)
		visits[bestIdx]++
		wins[bestIdx] += w
	}

	// Pick most visited (with slight noise at levels 4-5)
	bestIdx := 0
	bestScore := -1.0
	for i := 0; i < candCount; i++ {
		sc := float64(visits[i]) + (wins[i]/float64(visits[i]))*0.5
		if gtgLevel <= 5 {
			sc += float64(nextRng(&seed)%10) * 0.25
		}
		if sc > bestScore {
			bestScore = sc
			bestIdx = i
		}
	}

	// Pass if best move has very low winrate late in the game
	winRate := wins[bestIdx] / float64(visits[bestIdx])
	if b.CaptureTarget == 0 && b.MoveCount >= nPts*2/3 && winRate < 0.05 {
		return PassPoint
	}
	return cands[bestIdx]
}

func runPlayoutFromMove(b *Board, firstMove int, rootColor uint8, seed *uint64) float64 {
	sim := b.Clone()
	if sim.Play(firstMove) != PlayOK {
		return 0
	}
	if sim.Winner != Empty {
		if sim.Winner == rootColor {
			return 1.0
		}
		return 0.0
	}

	maxPlies := sim.NumPoints() * 2
	if maxPlies > 260 {
		maxPlies = 260
	}

	for ply := 0; ply < maxPlies && sim.Winner == Empty; ply++ {
		mv := playoutPolicyMove(sim, seed)
		sim.Play(mv)
	}

	if sim.Winner == rootColor {
		return 1.0
	}
	if sim.Winner != Empty {
		return 0.0
	}

	bx2, wx2, _ := sim.AreaScore()
	if rootColor == Black {
		if bx2 > wx2 {
			return 1.0
		}
		return 0.0
	}
	if wx2 > bx2 {
		return 1.0
	}
	return 0.0
}

func playoutPolicyMove(b *Board, seed *uint64) int {
	nPts := b.NumPoints()
	color := b.Turn
	start := int(nextRng(seed) % uint64(nPts))

	// Fast scan from random offset; pick first legal non-own-eye move,
	// preferring captures/atari escapes near LastMove if available.
	if b.LastMove >= 0 {
		var nb [4]int
		nbCount := b.neighbors(b.LastMove, &nb)
		for i := 0; i < nbCount; i++ {
			np := nb[i]
			if b.IsLegal(np) == PlayOK && !b.IsOwnEye(np, color) {
				if (nextRng(seed) % 100) < 60 {
					return np
				}
			}
		}
	}

	for off := 0; off < nPts; off++ {
		p := (start + off) % nPts
		if b.IsLegal(p) == PlayOK && !b.IsOwnEye(p, color) {
			return p
		}
	}
	return PassPoint
}

// EstimateOwnership runs `playouts` fast playouts from `b` to estimate
// per-point ownership (-100 = White, +100 = Black) and returns estimated
// score lead * 2 (positive = Black ahead).
func EstimateOwnership(b *Board, playouts int, seed uint64) (scoreLeadX2 int, ownership [MaxPoints]int8) {
	if playouts <= 0 {
		playouts = 48
	}
	if seed == 0 {
		seed = uint64(b.MoveCount+1)*0x9e3779b97f4a7c15 ^ b.Hash ^ 0x123456789abcdef
	}

	nPts := b.NumPoints()
	var ownerSum [MaxPoints]int
	var leadSum int

	maxPlies := nPts * 2
	if maxPlies > 240 {
		maxPlies = 240
	}

	for p := 0; p < playouts; p++ {
		sim := b.Clone()
		for ply := 0; ply < maxPlies && sim.Winner == Empty; ply++ {
			mv := playoutPolicyMove(sim, &seed)
			sim.Play(mv)
		}
		bx2, wx2, terr := sim.AreaScore()
		leadSum += bx2 - wx2
		for i := 0; i < nPts; i++ {
			if terr[i] == Black {
				ownerSum[i] += 100
			} else if terr[i] == White {
				ownerSum[i] -= 100
			}
		}
	}

	for i := 0; i < nPts; i++ {
		ownership[i] = int8(ownerSum[i] / playouts)
	}
	return leadSum / playouts, ownership
}
