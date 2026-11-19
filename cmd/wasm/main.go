package main

import (
	"unsafe"

	"github.com/nickprignano/goodtogo/engine"
)

var (
	board       *engine.Board
	gridBuf     [engine.MaxPoints]uint8
	libsBuf     [engine.MaxPoints]uint8
	terrBuf     [engine.MaxPoints]uint8
	ownBuf      [engine.MaxPoints]int8
	deadBuf     [engine.MaxPoints]uint8
	lastBlackX2 int32
	lastWhiteX2 int32
)

func ensureBoard() {
	if board == nil {
		board = engine.NewBoard(9, 15, 0)
	}
}

func main() {}

//export gtg_new_game
func gtg_new_game(size, komiX2, captureTarget int32) {
	board = engine.NewBoard(int(size), int(komiX2), int(captureTarget))
}

//export gtg_set_stone
func gtg_set_stone(idx, color int32) {
	ensureBoard()
	board.SetStone(int(idx), uint8(color))
}

//export gtg_set_turn
func gtg_set_turn(turn int32) {
	ensureBoard()
	if turn == int32(engine.Black) || turn == int32(engine.White) {
		board.Turn = uint8(turn)
	}
}

//export gtg_reset_history
func gtg_reset_history() {
	ensureBoard()
	board.ResetHistory()
}

//export gtg_play
func gtg_play(idx int32) int32 {
	return int32(board.Play(int(idx)))
}

//export gtg_is_legal
func gtg_is_legal(idx int32) int32 {
	return int32(board.IsLegal(int(idx)))
}

//export gtg_detect_warnings
func gtg_detect_warnings(idx int32) uint32 {
	return board.DetectMoveWarnings(int(idx))
}

//export gtg_choose_move
func gtg_choose_move(level int32, seed uint32) int32 {
	return int32(engine.ChooseMove(board, int(level), uint64(seed)))
}

//export gtg_solve
func gtg_solve(firstMove, goal, targetPoint, maxDepth, regionRadius int32) int32 {
	if engine.SolveProblem(board, int(firstMove), int(goal), int(targetPoint), int(maxDepth), int(regionRadius)) {
		return 1
	}
	return 0
}

//export gtg_get_turn
func gtg_get_turn() int32 { return int32(board.Turn) }

//export gtg_get_winner
func gtg_get_winner() int32 { return int32(board.Winner) }

//export gtg_get_captures
func gtg_get_captures(color int32) int32 {
	if color == int32(engine.Black) || color == int32(engine.White) {
		return int32(board.Captures[color])
	}
	return 0
}

//export gtg_get_move_count
func gtg_get_move_count() int32 { return int32(board.MoveCount) }

//export gtg_get_last_move
func gtg_get_last_move() int32 { return int32(board.LastMove) }

//export gtg_get_size
func gtg_get_size() int32 { return int32(board.Size) }

//export gtg_grid_ptr
func gtg_grid_ptr() uintptr {
	n := board.NumPoints()
	for i := 0; i < n; i++ {
		gridBuf[i] = board.Grid[i]
	}
	return uintptr(unsafe.Pointer(&gridBuf[0]))
}

//export gtg_libs_ptr
func gtg_libs_ptr() uintptr {
	board.PointLibertyCounts(&libsBuf)
	return uintptr(unsafe.Pointer(&libsBuf[0]))
}

//export gtg_score_black_x2
func gtg_score_black_x2() int32 {
	bx2, wx2, terr := board.AreaScore()
	lastBlackX2 = int32(bx2)
	lastWhiteX2 = int32(wx2)
	terrBuf = terr
	return lastBlackX2
}

//export gtg_score_white_x2
func gtg_score_white_x2() int32 {
	return lastWhiteX2
}

//export gtg_terr_ptr
func gtg_terr_ptr() uintptr {
	return uintptr(unsafe.Pointer(&terrBuf[0]))
}

//export gtg_setup_handicap
func gtg_setup_handicap(stones int32) {
	ensureBoard()
	board.SetupHandicap(int(stones))
}

//export gtg_choose_move_gtg
func gtg_choose_move_gtg(gtgLevel int32, seed uint32) int32 {
	ensureBoard()
	return int32(engine.ChooseMoveGTG(board, int(gtgLevel), uint64(seed)))
}

//export gtg_estimate_ownership
func gtg_estimate_ownership(playouts int32, seed uint32) int32 {
	ensureBoard()
	leadX2, own := engine.EstimateOwnership(board, int(playouts), uint64(seed))
	ownBuf = own
	return int32(leadX2)
}

//export gtg_ownership_ptr
func gtg_ownership_ptr() uintptr {
	return uintptr(unsafe.Pointer(&ownBuf[0]))
}

//export gtg_dead_ptr
func gtg_dead_ptr() uintptr {
	return uintptr(unsafe.Pointer(&deadBuf[0]))
}

//export gtg_score_with_dead_black_x2
func gtg_score_with_dead_black_x2() int32 {
	ensureBoard()
	bx2, wx2, terr := board.AreaScoreWithDead(&deadBuf)
	lastBlackX2 = int32(bx2)
	lastWhiteX2 = int32(wx2)
	terrBuf = terr
	return lastBlackX2
}
