package engine

// Coach concept bitflags for deterministic tagging.
const (
	TagCapture    uint32 = 1 << 0
	TagAtari      uint32 = 1 << 1
	TagSelfAtari  uint32 = 1 << 2
	TagSavedAtari uint32 = 1 << 3
	TagOwnEye     uint32 = 1 << 4
	TagKo         uint32 = 1 << 5
	TagCorner     uint32 = 1 << 6
)

// DetectCoachTags inspects a move on board `b` (before it is played) and returns
// deterministic Tag* flags for the coach.
func DetectCoachTags(b *Board, idx int) uint32 {
	if idx < 0 || idx >= b.NumPoints() || b.Grid[idx] != Empty {
		return 0
	}

	// Reuse existing warning flags for capture, atari, self-atari, saved-atari, own-eye
	tags := b.DetectMoveWarnings(idx)

	// Check Ko shape: captures 1 stone and leaves the newly played stone in atari
	if (tags & WarnCapture) != 0 {
		cp := b.Clone()
		prevCaps := cp.Captures[b.Turn]
		if cp.Play(idx) == PlayOK && cp.Captures[b.Turn]-prevCaps == 1 && cp.GroupLiberties(idx) == 1 {
			tags |= TagKo
		}
	}

	// Early corner opening move (3rd or 4th line)
	if b.MoveCount < 8 && b.Size >= 7 {
		r, c := idx/b.Size, idx%b.Size
		if (r == 2 || r == 3 || r == b.Size-3 || r == b.Size-4) &&
			(c == 2 || c == 3 || c == b.Size-3 || c == b.Size-4) {
			tags |= TagCorner
		}
	}

	return tags
}
