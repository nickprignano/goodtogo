package engine

import "testing"

func pt(size, r, c int) int { return r*size + c }

func TestCaptureAndNoSuicide(t *testing.T) {
	b := NewBoard(5, 15, 0)
	// Surround White stone at (2,2) from 3 sides
	b.SetStone(pt(5, 2, 2), White)
	b.SetStone(pt(5, 1, 2), Black)
	b.SetStone(pt(5, 3, 2), Black)
	b.SetStone(pt(5, 2, 1), Black)
	b.ResetHistory()

	if libs := b.GroupLiberties(pt(5, 2, 2)); libs != 1 {
		t.Fatalf("expected 1 liberty, got %d", libs)
	}

	// White playing at (0,0) surrounded by Black is suicide
	b.SetStone(pt(5, 0, 1), Black)
	b.SetStone(pt(5, 1, 0), Black)
	b.Turn = White
	if status := b.IsLegal(pt(5, 0, 0)); status != PlaySuicide {
		t.Fatalf("expected PlaySuicide, got %d", status)
	}

	// Black captures White at (2,2) by playing (2,3)
	b.Turn = Black
	if status := b.Play(pt(5, 2, 3)); status != PlayOK {
		t.Fatalf("expected PlayOK, got %d", status)
	}
	if b.Grid[pt(5, 2, 2)] != Empty {
		t.Fatalf("expected (2,2) to be empty after capture")
	}
	if b.Captures[Black] != 1 {
		t.Fatalf("expected 1 capture, got %d", b.Captures[Black])
	}
}

func TestKoAndSuperko(t *testing.T) {
	b := NewBoard(5, 15, 0)
	// Classic ko shape:
	//   0 1 2 3
	// 0 . B W .
	// 1 B . B W
	// 2 . B W .
	b.SetStone(pt(5, 0, 1), Black)
	b.SetStone(pt(5, 1, 0), Black)
	b.SetStone(pt(5, 2, 1), Black)
	b.SetStone(pt(5, 1, 2), Black)
	b.SetStone(pt(5, 0, 2), White)
	b.SetStone(pt(5, 1, 3), White)
	b.SetStone(pt(5, 2, 2), White)
	b.ResetHistory()

	// White plays at (1,1) capturing Black at (1,2)
	b.Turn = White
	if status := b.Play(pt(5, 1, 1)); status != PlayOK {
		t.Fatalf("white ko capture failed: %d", status)
	}
	if b.Grid[pt(5, 1, 2)] != Empty {
		t.Fatalf("expected (1,2) captured")
	}

	// Black immediate recapture at (1,2) repeats earlier board -> PlaySuperko
	if status := b.Play(pt(5, 1, 2)); status != PlaySuperko {
		t.Fatalf("expected PlaySuperko on immediate recapture, got %d", status)
	}

	// After a ko threat elsewhere, Black can recapture
	if status := b.Play(pt(5, 4, 4)); status != PlayOK {
		t.Fatalf("black ko threat failed: %d", status)
	}
	if status := b.Play(pt(5, 4, 0)); status != PlayOK {
		t.Fatalf("white response failed: %d", status)
	}
	if status := b.Play(pt(5, 1, 2)); status != PlayOK {
		t.Fatalf("black recapture after threat failed: %d", status)
	}
}

func TestCaptureGoWin(t *testing.T) {
	b := NewBoard(5, 0, 1) // Capture Go: first to 1 capture wins
	b.SetStone(pt(5, 0, 0), White)
	b.SetStone(pt(5, 0, 1), Black)
	b.ResetHistory()

	b.Turn = Black
	if status := b.Play(pt(5, 1, 0)); status != PlayOK {
		t.Fatalf("expected PlayOK, got %d", status)
	}
	if b.Winner != Black {
		t.Fatalf("expected Black to win Capture Go, got %d", b.Winner)
	}
	if status := b.Play(pt(5, 2, 2)); status != PlayGameOver {
		t.Fatalf("expected PlayGameOver after winner decided, got %d", status)
	}
}

func TestAreaScoringAndDoublePass(t *testing.T) {
	b := NewBoard(5, 15, 0) // 7.5 komi
	// Black walls off column 1 (5 stones) + column 0 (5 empty) = 10 pts
	// White walls off column 3 (5 stones) + column 4 (5 empty) = 10 pts
	// Column 2 is dame (touches both) = 0 pts
	for r := 0; r < 5; r++ {
		b.SetStone(pt(5, r, 1), Black)
		b.SetStone(pt(5, r, 3), White)
	}
	b.ResetHistory()

	bx2, wx2, terr := b.AreaScore()
	if bx2 != 20 { // 10 * 2
		t.Fatalf("expected Black area*2 = 20, got %d", bx2)
	}
	if wx2 != 20+15 { // 10 * 2 + 7.5 * 2
		t.Fatalf("expected White area*2 = 35, got %d", wx2)
	}
	if terr[pt(5, 0, 0)] != Black || terr[pt(5, 0, 4)] != White || terr[pt(5, 0, 2)] != Empty {
		t.Fatalf("unexpected territory ownership: (0,0)=%d (0,4)=%d (0,2)=%d",
			terr[pt(5, 0, 0)], terr[pt(5, 0, 4)], terr[pt(5, 0, 2)])
	}

	b.Play(PassPoint)
	if b.Winner != Empty {
		t.Fatalf("game should not end on single pass")
	}
	b.Play(PassPoint)
	if b.Winner != White {
		t.Fatalf("expected White to win with komi, got %d", b.Winner)
	}
}

func TestWarningsAndSolver(t *testing.T) {
	b := NewBoard(5, 0, 1)
	b.SetStone(pt(5, 2, 2), White)
	b.SetStone(pt(5, 1, 2), Black)
	b.SetStone(pt(5, 3, 2), Black)
	b.SetStone(pt(5, 2, 1), Black)
	b.ResetHistory()

	b.Turn = Black
	if flags := b.DetectMoveWarnings(pt(5, 2, 3)); (flags & WarnCapture) == 0 {
		t.Fatalf("expected WarnCapture flag, got %d", flags)
	}
	if !SolveProblem(b, pt(5, 2, 3), GoalCaptureTarget, pt(5, 2, 2), 1, 2) {
		t.Fatalf("expected solver to accept capturing move (2,3)")
	}
	if SolveProblem(b, pt(5, 0, 0), GoalCaptureTarget, pt(5, 2, 2), 1, 2) {
		t.Fatalf("expected solver to reject non-capturing move (0,0)")
	}

	// White to save (2,2) in atari
	b.Turn = White
	if flags := b.DetectMoveWarnings(pt(5, 2, 3)); (flags & WarnSavedAtari) == 0 {
		t.Fatalf("expected WarnSavedAtari flag, got %d", flags)
	}
	if !SolveProblem(b, pt(5, 2, 3), GoalSaveTarget, pt(5, 2, 2), 3, 2) {
		t.Fatalf("expected solver to accept saving move (2,3)")
	}
}

func TestChooseMoveLegal(t *testing.T) {
	b := NewBoard(7, 15, 0)
	for lvl := 0; lvl <= 3; lvl++ {
		mv := ChooseMove(b, lvl, 42)
		if mv != PassPoint && b.IsLegal(mv) != PlayOK {
			t.Fatalf("level %d chose illegal move %d", lvl, mv)
		}
	}
}

func TestHandicapAndGTGAndOwnership(t *testing.T) {
	b := NewBoard(9, 15, 0)
	b.SetupHandicap(4)
	if b.Turn != White {
		t.Fatalf("expected White to play first in handicap game, got %d", b.Turn)
	}
	if b.KomiX2 != 1 {
		t.Fatalf("expected 0.5 komi (1), got %d", b.KomiX2)
	}

	mv := ChooseMoveGTG(b, 6, 99)
	if mv != PassPoint && b.IsLegal(mv) != PlayOK {
		t.Fatalf("GTG level 6 chose illegal move %d", mv)
	}

	_, own := EstimateOwnership(b, 24, 99)
	if len(own) != MaxPoints {
		t.Fatalf("unexpected ownership length")
	}

	var dead [MaxPoints]uint8
	dead[pt(9, 2, 2)] = 1
	bx2, _, _ := b.AreaScoreWithDead(&dead)
	if bx2 <= 0 {
		t.Fatalf("expected positive black score")
	}
}
