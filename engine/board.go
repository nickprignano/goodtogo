package engine

// Color represents a board intersection state or player.
const (
	Empty uint8 = 0
	Black uint8 = 1
	White uint8 = 2
	Draw  uint8 = 3
)

const (
	MaxSize   = 19
	MaxPoints = MaxSize * MaxSize
	PassPoint = -1
	NoMove    = -2
)

// Play status codes returned by Play and IsLegal.
const (
	PlayOK          = 0
	PlayOutOfBounds = 1
	PlayOccupied    = 2
	PlaySuicide     = 3
	PlaySuperko     = 4
	PlayGameOver    = 5
)

// Warning / concept bitflags for on-device helper notes.
const (
	WarnCapture      uint32 = 1 << 0
	WarnPutInAtari   uint32 = 1 << 1
	WarnSelfAtari    uint32 = 1 << 2
	WarnFillOwnEye   uint32 = 1 << 3
	WarnSavedAtari   uint32 = 1 << 4
)

// zobristKeys holds deterministic 64-bit keys for [point][color (1..2)].
var (
	zobristKeys [MaxPoints][3]uint64
	zobristInit bool
)

func ensureZobrist() {
	if zobristInit {
		return
	}
	zobristInit = true
	var s uint64 = 0x9e3779b97f4a7c15
	next := func() uint64 {
		s += 0x9e3779b97f4a7c15
		z := s
		z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9
		z = (z ^ (z >> 27)) * 0x94d049bb133111eb
		return z ^ (z >> 31)
	}
	for i := 0; i < MaxPoints; i++ {
		zobristKeys[i][Black] = next()
		zobristKeys[i][White] = next()
	}
}

// Opponent returns the opposite stone color.
func Opponent(c uint8) uint8 {
	if c == Black {
		return White
	}
	if c == White {
		return Black
	}
	return Empty
}

// Board holds the complete state of a Go or Capture Go game.
type Board struct {
	Size          int
	Grid          [MaxPoints]uint8
	Turn          uint8
	Captures      [3]int
	Passes        int
	LastMove      int
	MoveCount     int
	CaptureTarget int // 0 = standard Go; >0 = Capture Go (first to N captures wins)
	Winner        uint8
	KomiX2        int // komi * 2 (e.g. 15 = 7.5, 1 = 0.5)
	Hash          uint64
	History       []uint64
}

// NewBoard creates an empty board of the given size (5, 7, 9, 13, or 19).
func NewBoard(size int, komiX2 int, captureTarget int) *Board {
	ensureZobrist()
	if size < 2 || size > MaxSize {
		size = 9
	}
	b := &Board{
		Size:          size,
		Turn:          Black,
		LastMove:      NoMove,
		CaptureTarget: captureTarget,
		KomiX2:        komiX2,
		History:       make([]uint64, 1, 64),
	}
	b.History[0] = 0
	return b
}

// Clone returns an independent copy of the board.
func (b *Board) Clone() *Board {
	cp := *b
	cp.History = make([]uint64, len(b.History), cap(b.History))
	copy(cp.History, b.History)
	return &cp
}

// NumPoints returns Size * Size.
func (b *Board) NumPoints() int {
	return b.Size * b.Size
}

// SetStone places or clears a stone directly (for lesson/problem setup) and updates Hash.
func (b *Board) SetStone(idx int, color uint8) {
	if idx < 0 || idx >= b.NumPoints() {
		return
	}
	old := b.Grid[idx]
	if old == color {
		return
	}
	if old != Empty {
		b.Hash ^= zobristKeys[idx][old]
	}
	if color != Empty {
		b.Hash ^= zobristKeys[idx][color]
	}
	b.Grid[idx] = color
}

// ResetHistory resets the superko history to the current board hash.
func (b *Board) ResetHistory() {
	b.History = b.History[:0]
	b.History = append(b.History, b.Hash)
}

func (b *Board) neighbors(idx int, out *[4]int) int {
	n := 0
	r := idx / b.Size
	c := idx % b.Size
	if r > 0 {
		out[n] = idx - b.Size
		n++
	}
	if r+1 < b.Size {
		out[n] = idx + b.Size
		n++
	}
	if c > 0 {
		out[n] = idx - 1
		n++
	}
	if c+1 < b.Size {
		out[n] = idx + 1
		n++
	}
	return n
}

// collectGroup fills stones and liberties for the group at idx.
// Returns counts (numStones, numLiberties).
func (b *Board) collectGroup(idx int, stones *[MaxPoints]int, libs *[MaxPoints]int, visited *[MaxPoints]uint8) (int, int) {
	color := b.Grid[idx]
	if color == Empty {
		return 0, 0
	}
	nPts := b.NumPoints()
	for i := 0; i < nPts; i++ {
		visited[i] = 0
	}

	sCount := 0
	lCount := 0
	stones[sCount] = idx
	sCount++
	visited[idx] = 1

	var nb [4]int
	for head := 0; head < sCount; head++ {
		cur := stones[head]
		nbCount := b.neighbors(cur, &nb)
		for i := 0; i < nbCount; i++ {
			np := nb[i]
			if visited[np] != 0 {
				continue
			}
			nc := b.Grid[np]
			if nc == Empty {
				visited[np] = 2
				libs[lCount] = np
				lCount++
			} else if nc == color {
				visited[np] = 1
				stones[sCount] = np
				sCount++
			}
		}
	}
	return sCount, lCount
}

// GroupLiberties returns the number of liberties of the group at idx (0 if empty).
func (b *Board) GroupLiberties(idx int) int {
	if idx < 0 || idx >= b.NumPoints() || b.Grid[idx] == Empty {
		return 0
	}
	var stones, libs [MaxPoints]int
	var visited [MaxPoints]uint8
	_, lCount := b.collectGroup(idx, &stones, &libs, &visited)
	return lCount
}

// PointLibertyCounts writes the liberty count of each occupied point's group into out (0 for empty).
func (b *Board) PointLibertyCounts(out *[MaxPoints]uint8) {
	nPts := b.NumPoints()
	for i := 0; i < nPts; i++ {
		out[i] = 0
	}
	var stones, libs [MaxPoints]int
	var visited [MaxPoints]uint8
	var done [MaxPoints]uint8
	for i := 0; i < nPts; i++ {
		if b.Grid[i] == Empty || done[i] != 0 {
			continue
		}
		sCount, lCount := b.collectGroup(i, &stones, &libs, &visited)
		val := uint8(lCount)
		if lCount > 255 {
			val = 255
		}
		for j := 0; j < sCount; j++ {
			p := stones[j]
			done[p] = 1
			out[p] = val
		}
	}
}

func (b *Board) hasHash(h uint64) bool {
	for i := len(b.History) - 1; i >= 0; i-- {
		if b.History[i] == h {
			return true
		}
	}
	return false
}

// IsLegal checks if playing at idx (or PassPoint) for b.Turn is legal without mutating b.
func (b *Board) IsLegal(idx int) int {
	if b.Winner != Empty {
		return PlayGameOver
	}
	if idx == PassPoint {
		return PlayOK
	}
	if idx < 0 || idx >= b.NumPoints() {
		return PlayOutOfBounds
	}
	if b.Grid[idx] != Empty {
		return PlayOccupied
	}

	// Simulate on a scratch copy of grid + hash
	color := b.Turn
	opp := Opponent(color)

	b.Grid[idx] = color
	newHash := b.Hash ^ zobristKeys[idx][color]

	var nb [4]int
	nbCount := b.neighbors(idx, &nb)
	var stones, libs [MaxPoints]int
	var visited [MaxPoints]uint8

	var captured [MaxPoints]int
	capCount := 0

	for i := 0; i < nbCount; i++ {
		np := nb[i]
		if b.Grid[np] == opp {
			sCount, lCount := b.collectGroup(np, &stones, &libs, &visited)
			if lCount == 0 {
				for j := 0; j < sCount; j++ {
					sp := stones[j]
					captured[capCount] = sp
					capCount++
					b.Grid[sp] = Empty
					newHash ^= zobristKeys[sp][opp]
				}
			}
		}
	}

	_, myLibs := b.collectGroup(idx, &stones, &libs, &visited)

	// Restore board state before returning
	for i := 0; i < capCount; i++ {
		b.Grid[captured[i]] = opp
	}
	b.Grid[idx] = Empty

	if myLibs == 0 {
		return PlaySuicide
	}
	if b.hasHash(newHash) {
		return PlaySuperko
	}
	return PlayOK
}

// Play attempts to play at idx (or PassPoint) for b.Turn.
func (b *Board) Play(idx int) int {
	if b.Winner != Empty {
		return PlayGameOver
	}
	if idx == PassPoint {
		b.Passes++
		b.LastMove = PassPoint
		b.MoveCount++
		b.Turn = Opponent(b.Turn)
		if b.Passes >= 2 && b.CaptureTarget == 0 {
			b.finishByScore()
		}
		return PlayOK
	}
	if idx < 0 || idx >= b.NumPoints() {
		return PlayOutOfBounds
	}
	if b.Grid[idx] != Empty {
		return PlayOccupied
	}

	color := b.Turn
	opp := Opponent(color)

	b.Grid[idx] = color
	newHash := b.Hash ^ zobristKeys[idx][color]

	var nb [4]int
	nbCount := b.neighbors(idx, &nb)
	var stones, libs [MaxPoints]int
	var visited [MaxPoints]uint8

	var captured [MaxPoints]int
	capCount := 0

	for i := 0; i < nbCount; i++ {
		np := nb[i]
		if b.Grid[np] == opp {
			sCount, lCount := b.collectGroup(np, &stones, &libs, &visited)
			if lCount == 0 {
				for j := 0; j < sCount; j++ {
					sp := stones[j]
					captured[capCount] = sp
					capCount++
					b.Grid[sp] = Empty
					newHash ^= zobristKeys[sp][opp]
				}
			}
		}
	}

	_, myLibs := b.collectGroup(idx, &stones, &libs, &visited)
	if myLibs == 0 {
		for i := 0; i < capCount; i++ {
			b.Grid[captured[i]] = opp
		}
		b.Grid[idx] = Empty
		return PlaySuicide
	}
	if b.hasHash(newHash) {
		for i := 0; i < capCount; i++ {
			b.Grid[captured[i]] = opp
		}
		b.Grid[idx] = Empty
		return PlaySuperko
	}

	b.Hash = newHash
	b.History = append(b.History, newHash)
	b.Captures[color] += capCount
	b.Passes = 0
	b.LastMove = idx
	b.MoveCount++
	b.Turn = opp

	if b.CaptureTarget > 0 && b.Captures[color] >= b.CaptureTarget {
		b.Winner = color
	}
	return PlayOK
}

// AreaScore computes Chinese/area scoring: stones on board + empty regions
// surrounded exclusively by one color, plus KomiX2 for White.
func (b *Board) AreaScore() (blackX2 int, whiteX2 int, territory [MaxPoints]uint8) {
	nPts := b.NumPoints()
	var visited [MaxPoints]uint8
	var queue [MaxPoints]int
	var nb [4]int

	for i := 0; i < nPts; i++ {
		c := b.Grid[i]
		if c == Black {
			blackX2 += 2
			territory[i] = Black
			continue
		}
		if c == White {
			whiteX2 += 2
			territory[i] = White
			continue
		}
		if visited[i] != 0 {
			continue
		}

		// Flood-fill empty region
		head := 0
		tail := 0
		queue[tail] = i
		tail++
		visited[i] = 1
		touchesBlack := false
		touchesWhite := false

		for head < tail {
			cur := queue[head]
			head++
			nbCount := b.neighbors(cur, &nb)
			for j := 0; j < nbCount; j++ {
				np := nb[j]
				nc := b.Grid[np]
				if nc == Black {
					touchesBlack = true
				} else if nc == White {
					touchesWhite = true
				} else if visited[np] == 0 {
					visited[np] = 1
					queue[tail] = np
					tail++
				}
			}
		}

		owner := Empty
		if touchesBlack && !touchesWhite {
			owner = Black
			blackX2 += tail * 2
		} else if touchesWhite && !touchesBlack {
			owner = White
			whiteX2 += tail * 2
		}
		for j := 0; j < tail; j++ {
			territory[queue[j]] = owner
		}
	}

	whiteX2 += b.KomiX2
	return blackX2, whiteX2, territory
}

func (b *Board) finishByScore() {
	bx2, wx2, _ := b.AreaScore()
	if bx2 > wx2 {
		b.Winner = Black
	} else if wx2 > bx2 {
		b.Winner = White
	} else {
		b.Winner = Draw
	}
}

// IsOwnEye returns true if idx is an empty point whose orthogonal neighbors
// are all friendly stones (and for a non-edge/corner, most diagonals are friendly).
func (b *Board) IsOwnEye(idx int, color uint8) bool {
	if idx < 0 || idx >= b.NumPoints() || b.Grid[idx] != Empty {
		return false
	}
	var nb [4]int
	nbCount := b.neighbors(idx, &nb)
	for i := 0; i < nbCount; i++ {
		if b.Grid[nb[i]] != color {
			return false
		}
	}
	// Check diagonals to avoid flagging false eyes as true eyes.
	r := idx / b.Size
	c := idx % b.Size
	opp := Opponent(color)
	oppDiag := 0
	totalDiag := 0
	for dr := -1; dr <= 1; dr += 2 {
		for dc := -1; dc <= 1; dc += 2 {
			nr, nc := r+dr, c+dc
			if nr >= 0 && nr < b.Size && nc >= 0 && nc < b.Size {
				totalDiag++
				if b.Grid[nr*b.Size+nc] == opp {
					oppDiag++
				}
			}
		}
	}
	if totalDiag == 4 {
		return oppDiag <= 1
	}
	return oppDiag == 0
}

// DetectMoveWarnings evaluates a legal move at idx for b.Turn and returns Warn* flags.
func (b *Board) DetectMoveWarnings(idx int) uint32 {
	if idx < 0 || idx >= b.NumPoints() || b.Grid[idx] != Empty {
		return 0
	}
	color := b.Turn
	var flags uint32
	if b.IsOwnEye(idx, color) {
		flags |= WarnFillOwnEye
	}

	// Check if an adjacent friendly group was in atari before this move
	var nb [4]int
	nbCount := b.neighbors(idx, &nb)
	wasFriendlyInAtari := false
	for i := 0; i < nbCount; i++ {
		np := nb[i]
		if b.Grid[np] == color && b.GroupLiberties(np) == 1 {
			wasFriendlyInAtari = true
			break
		}
	}

	cp := b.Clone()
	prevCaps := cp.Captures[color]
	if cp.Play(idx) != PlayOK {
		return flags
	}
	if cp.Captures[color] > prevCaps {
		flags |= WarnCapture
	}
	newLibs := cp.GroupLiberties(idx)
	if newLibs == 1 {
		flags |= WarnSelfAtari
	} else if wasFriendlyInAtari && newLibs > 1 {
		flags |= WarnSavedAtari
	}

	opp := Opponent(color)
	for i := 0; i < nbCount; i++ {
		np := nb[i]
		if cp.Grid[np] == opp && cp.GroupLiberties(np) == 1 {
			flags |= WarnPutInAtari
			break
		}
	}
	return flags
}
