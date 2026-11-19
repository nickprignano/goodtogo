package engine

// SetupHandicap places standard star-point handicap stones (2..9) for Black,
// sets komi to 0.5 (KomiX2 = 1), sets Turn to White, and resets history.
func (b *Board) SetupHandicap(stones int) {
	if stones < 2 {
		return
	}
	if stones > 9 {
		stones = 9
	}

	var lo, mid, hi int
	switch b.Size {
	case 5:
		lo, mid, hi = 1, 2, 3
	case 7:
		lo, mid, hi = 2, 3, 4
	case 9:
		lo, mid, hi = 2, 4, 6
	case 13:
		lo, mid, hi = 3, 6, 9
	case 19:
		lo, mid, hi = 3, 9, 15
	default:
		lo, mid, hi = 2, b.Size/2, b.Size-3
	}

	pt := func(r, c int) int { return r*b.Size + c }
	// Standard Japanese/AGA star-point order:
	// 0: top-right, 1: bottom-left, 2: bottom-right, 3: top-left,
	// 4: center, 5: left, 6: right, 7: top, 8: bottom
	tr := pt(lo, hi)
	bl := pt(hi, lo)
	br := pt(hi, hi)
	tl := pt(lo, lo)
	ce := pt(mid, mid)
	le := pt(mid, lo)
	ri := pt(mid, hi)
	tp := pt(lo, mid)
	bt := pt(hi, mid)

	var coords []int
	switch stones {
	case 2:
		coords = []int{tr, bl}
	case 3:
		coords = []int{tr, bl, br}
	case 4:
		coords = []int{tr, bl, br, tl}
	case 5:
		coords = []int{tr, bl, br, tl, ce}
	case 6:
		coords = []int{tr, bl, br, tl, le, ri}
	case 7:
		coords = []int{tr, bl, br, tl, le, ri, ce}
	case 8:
		coords = []int{tr, bl, br, tl, le, ri, tp, bt}
	default:
		coords = []int{tr, bl, br, tl, le, ri, tp, bt, ce}
	}

	for _, idx := range coords {
		b.SetStone(idx, Black)
	}
	b.KomiX2 = 1
	b.Turn = White
	b.ResetHistory()
}

// AreaScoreWithDead computes area score after removing any stones marked dead[i] == 1.
func (b *Board) AreaScoreWithDead(dead *[MaxPoints]uint8) (blackX2 int, whiteX2 int, territory [MaxPoints]uint8) {
	cp := b.Clone()
	nPts := cp.NumPoints()
	for i := 0; i < nPts; i++ {
		if dead[i] != 0 {
			cp.SetStone(i, Empty)
		}
	}
	return cp.AreaScore()
}
