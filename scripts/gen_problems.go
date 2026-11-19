//go:build ignore

package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/quiet-arcades/goodtogo/engine"
)

type Problem struct {
	ID            string   `json:"id"`
	Category      string   `json:"category"`
	Level         int      `json:"level"`
	Size          int      `json:"size"`
	Turn          int      `json:"turn"`
	Stones        [][2]int `json:"stones"`
	Goal          string   `json:"goal"`
	TargetPoint   int      `json:"targetPoint"`
	AcceptedMoves []int    `json:"acceptedMoves"`
	Prompt        string   `json:"prompt"`
	Hint          string   `json:"hint"`
	Source        string   `json:"source"`
}

func main() {
	var problems []Problem
	seen := map[uint64]bool{}

	addIfValid := func(cat string, level, size, turn int, stones [][2]int, goalStr string, goalCode, target int, prompt, hint string) {
		if len(problems) >= 150 {
			return
		}
		b := engine.NewBoard(size, 15, 0)
		for _, s := range stones {
			b.SetStone(s[0], uint8(s[1]))
		}
		b.Turn = uint8(turn)
		b.ResetHistory()

		sig := b.Hash ^ (uint64(size) << 56) ^ (uint64(goalCode) << 48) ^ uint64(target)
		if seen[sig] {
			return
		}

		var accepted []int
		wrongCount := 0
		nPts := b.NumPoints()
		for mv := 0; mv < nPts; mv++ {
			if b.IsLegal(mv) != engine.PlayOK {
				continue
			}
			if engine.SolveProblem(b, mv, goalCode, target, 3, 2) {
				accepted = append(accepted, mv)
			} else {
				wrongCount++
			}
		}

		if len(accepted) == 0 || len(accepted) > 3 || wrongCount == 0 {
			return
		}

		seen[sig] = true
		problems = append(problems, Problem{
			ID:            fmt.Sprintf("p-%03d", len(problems)+1),
			Category:      cat,
			Level:         level,
			Size:          size,
			Turn:          turn,
			Stones:        stones,
			Goal:          goalStr,
			TargetPoint:   target,
			AcceptedMoves: accepted,
			Prompt:        prompt,
			Hint:          hint,
			Source:        "gtg-original-proved",
		})
	}

	// Transform helper: rotate/mirror a relative (dr, dc) inside a 5x5/7x7/9x9 board
	transform := func(size, r, c, rot int) (int, int) {
		switch rot % 4 {
		case 0:
			return r, c
		case 1:
			return c, size - 1 - r
		case 2:
			return size - 1 - r, size - 1 - c
		default:
			return size - 1 - c, r
		}
	}

	pt := func(size, r, c int) int { return r*size + c }

	// 1. Corner & edge captures (Level 1-2) across 5x5, 7x7, 9x9
	for _, size := range []int{5, 7, 9} {
		for rot := 0; rot < 4; rot++ {
			// 1-stone corner capture
			r0, c0 := transform(size, 0, 0, rot)
			r1, c1 := transform(size, 0, 1, rot)
			addIfValid("capture", 1, size, int(engine.Black),
				[][2]int{{pt(size, r0, c0), 2}, {pt(size, r1, c1), 1}},
				"capture_target", engine.GoalCaptureTarget, pt(size, r0, c0),
				"Capture the corner White stone!", "Cover the last liberty along the edge.")

			// 2-stone corner capture
			r2, c2 := transform(size, 1, 1, rot)
			r3, c3 := transform(size, 0, 2, rot)
			r4, c4 := transform(size, 1, 0, rot)
			addIfValid("capture", 2, size, int(engine.Black),
				[][2]int{{pt(size, r0, c0), 2}, {pt(size, r1, c1), 2}, {pt(size, r2, c2), 1}, {pt(size, r3, c3), 1}, {pt(size, r4, c4), 1}},
				"capture_target", engine.GoalCaptureTarget, pt(size, r0, c0),
				"Capture the two White stones in the corner!", "Find their one remaining liberty.")

			// Edge 1-stone capture
			for off := 1; off < size-2; off++ {
				er0, ec0 := transform(size, 0, off, rot)
				er1, ec1 := transform(size, 0, off-1, rot)
				er2, ec2 := transform(size, 0, off+1, rot)
				addIfValid("capture", 1, size, int(engine.Black),
					[][2]int{{pt(size, er0, ec0), 2}, {pt(size, er1, ec1), 1}, {pt(size, er2, ec2), 1}},
					"capture_target", engine.GoalCaptureTarget, pt(size, er0, ec0),
					"Capture the edge White stone!", "Block its last liberty toward the center.")
			}
		}
	}

	// 2. Center captures & 2-stone group captures (Level 2-4)
	for _, size := range []int{5, 7, 9} {
		for r := 1; r < size-1; r++ {
			for c := 1; c < size-1; c++ {
				addIfValid("capture", 2, size, int(engine.Black),
					[][2]int{
						{pt(size, r, c), 2},
						{pt(size, r-1, c), 1},
						{pt(size, r+1, c), 1},
						{pt(size, r, c-1), 1},
					},
					"capture_target", engine.GoalCaptureTarget, pt(size, r, c),
					"Capture the White stone!", "Cover its last remaining liberty.")
			}
		}
	}

	// 3. Atari escapes & connecting to save (Level 2-5)
	for _, size := range []int{5, 7, 9} {
		for r := 1; r < size-1; r++ {
			for c := 1; c < size-1; c++ {
				addIfValid("escape", 3, size, int(engine.Black),
					[][2]int{
						{pt(size, r, c), 1},
						{pt(size, r-1, c), 2},
						{pt(size, r+1, c), 2},
						{pt(size, r, c-1), 2},
					},
					"save_target", engine.GoalSaveTarget, pt(size, r, c),
					"Your Black stone is in atari! Save it.", "Extend to its last liberty to gain breathing room.")
			}
		}
	}

	// 4. False-eye / capture-to-save tactics (Level 5-8)
	for _, size := range []int{5, 7, 9} {
		for rot := 0; rot < 4; rot++ {
			r0, c0 := transform(size, 0, 0, rot)
			r1, c1 := transform(size, 0, 1, rot)
			r2, c2 := transform(size, 1, 0, rot)
			r3, c3 := transform(size, 1, 1, rot)
			r4, c4 := transform(size, 0, 2, rot)
			r5, c5 := transform(size, 2, 0, rot)
			addIfValid("tactics", 6, size, int(engine.Black),
				[][2]int{
					{pt(size, r1, c1), 2},
					{pt(size, r2, c2), 2},
					{pt(size, r3, c3), 1},
					{pt(size, r4, c4), 1},
					{pt(size, r5, c5), 1},
				},
				"capture_target", engine.GoalCaptureTarget, pt(size, r1, c1),
				"White has a false eye in the corner. Capture White!", "Play right inside the corner (A5/corner) to capture.")
			_ = r0
			_ = c0
		}
	}

	// 5. 2-move atari-then-capture (push toward edge, Level 5-9)
	for _, size := range []int{7, 9} {
		for rot := 0; rot < 4; rot++ {
			for off := 1; off < size-2; off++ {
				tR, tC := transform(size, 1, off, rot)
				b1R, b1C := transform(size, 2, off, rot)
				b2R, b2C := transform(size, 1, off-1, rot)
				addIfValid("tactics", 7, size, int(engine.Black),
					[][2]int{
						{pt(size, tR, tC), 2},
						{pt(size, b1R, b1C), 1},
						{pt(size, b2R, b2C), 1},
					},
					"capture_target", engine.GoalCaptureTarget, pt(size, tR, tC),
					"Atari and capture the White stone toward the edge!", "Push White onto the 1st line where it runs out of liberties.")
			}
		}
	}

	out, err := json.MarshalIndent(map[string]any{"problems": problems}, "", "  ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile("web/data/problems.json", out, 0o644); err != nil {
		panic(err)
	}
	fmt.Printf("Generated %d solver-proved problems -> web/data/problems.json\n", len(problems))
}
