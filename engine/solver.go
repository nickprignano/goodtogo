package engine

// SolveGoal defines what the attacker (initial b.Turn) must achieve.
const (
	GoalCaptureAny    = 1 // Capture at least 1 opponent stone
	GoalCaptureTarget = 2 // Capture the stone/group initially at TargetPoint
	GoalSaveTarget    = 3 // Keep the friendly stone/group at TargetPoint alive with >= 2 liberties (or >1) after defender's best try
)

// SolveProblem checks whether playing `firstMove` solves the problem for b.Turn
// against all defender responses within `maxDepth` plies (e.g., 3 or 5).
// Only empty points within Manhattan distance `regionRadius` of existing stones
// (or all empty points on boards <= 7x7) are searched.
func SolveProblem(b *Board, firstMove int, goal int, targetPoint int, maxDepth int, regionRadius int) bool {
	if b.IsLegal(firstMove) != PlayOK {
		return false
	}
	attacker := b.Turn
	cp := b.Clone()
	prevCaps := cp.Captures[attacker]
	if cp.Play(firstMove) != PlayOK {
		return false
	}

	// Immediate goal check after attacker's first move
	if goalReached(cp, attacker, prevCaps, goal, targetPoint) {
		return true
	}
	if maxDepth <= 1 {
		return false
	}

	// Build candidate region
	candidates := buildCandidates(b, regionRadius)
	return defenderSearch(cp, attacker, prevCaps, goal, targetPoint, maxDepth-1, candidates)
}

func goalReached(b *Board, attacker uint8, initialCaps int, goal int, targetPoint int) bool {
	switch goal {
	case GoalCaptureAny:
		return b.Captures[attacker] > initialCaps
	case GoalCaptureTarget:
		if targetPoint < 0 || targetPoint >= b.NumPoints() {
			return false
		}
		return b.Grid[targetPoint] == Empty
	case GoalSaveTarget:
		if targetPoint < 0 || targetPoint >= b.NumPoints() {
			return false
		}
		return b.Grid[targetPoint] == attacker && b.GroupLiberties(targetPoint) >= 2
	}
	return false
}

func goalFailed(b *Board, attacker uint8, goal int, targetPoint int) bool {
	if goal == GoalSaveTarget {
		if targetPoint < 0 || targetPoint >= b.NumPoints() {
			return true
		}
		return b.Grid[targetPoint] != attacker
	}
	return false
}

func defenderSearch(b *Board, attacker uint8, initialCaps int, goal int, targetPoint int, depth int, candidates []int) bool {
	if depth <= 0 {
		if goal == GoalSaveTarget {
			return b.Grid[targetPoint] == attacker && b.GroupLiberties(targetPoint) >= 2
		}
		return false
	}

	// Defender tries every legal move in candidates (plus PassPoint);
	// attacker must succeed against ALL defender moves.
	triedAny := false
	for _, p := range candidates {
		if b.IsLegal(p) != PlayOK {
			continue
		}
		triedAny = true
		cp := b.Clone()
		cp.Play(p)
		if goalFailed(cp, attacker, goal, targetPoint) {
			return false
		}
		if !attackerSearch(cp, attacker, initialCaps, goal, targetPoint, depth-1, candidates) {
			return false
		}
	}

	// Also allow defender pass
	if !triedAny {
		cp := b.Clone()
		cp.Play(PassPoint)
		return attackerSearch(cp, attacker, initialCaps, goal, targetPoint, depth-1, candidates)
	}
	return true
}

func attackerSearch(b *Board, attacker uint8, initialCaps int, goal int, targetPoint int, depth int, candidates []int) bool {
	if goalReached(b, attacker, initialCaps, goal, targetPoint) {
		return true
	}
	if depth <= 0 {
		return false
	}
	for _, p := range candidates {
		if b.IsLegal(p) != PlayOK {
			continue
		}
		cp := b.Clone()
		cp.Play(p)
		if goalReached(cp, attacker, initialCaps, goal, targetPoint) {
			return true
		}
		if depth > 1 && defenderSearch(cp, attacker, initialCaps, goal, targetPoint, depth-1, candidates) {
			return true
		}
	}
	return false
}

func buildCandidates(b *Board, radius int) []int {
	nPts := b.NumPoints()
	if b.Size <= 5 || radius <= 0 {
		out := make([]int, nPts)
		for i := 0; i < nPts; i++ {
			out[i] = i
		}
		return out
	}
	var out []int
	for i := 0; i < nPts; i++ {
		r, c := i/b.Size, i%b.Size
		near := false
		for j := 0; j < nPts; j++ {
			if b.Grid[j] != Empty {
				jr, jc := j/b.Size, j%b.Size
				dr := r - jr
				if dr < 0 {
					dr = -dr
				}
				dc := c - jc
				if dc < 0 {
					dc = -dc
				}
				if dr+dc <= radius {
					near = true
					break
				}
			}
		}
		if near {
			out = append(out, i)
		}
	}
	return out
}
