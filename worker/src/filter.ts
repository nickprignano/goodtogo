export interface CoachMomentReply {
  summary: string;
  concept: string;
  idea: string;
}

const COORD_RE = /\b[A-HJ-T](1[0-9]|[1-9])\b/i;
const PAIR_RE = /\(\s*\d+\s*,\s*\d+\s*\)/;

const TERM_TO_TAG: [RegExp, string[]][] = [
  [/\bko\b/i, ['ko']],
  [/\bself[-\s]?atari\b/i, ['self_atari']],
  [/\batari\b/i, ['atari', 'saved_atari', 'self_atari']],
  [/\bcaptur(e|ed|ing)\b/i, ['capture', 'ko']],
  [/\b(own\s+eye|two\s+eyes|false\s+eye)\b/i, ['own_eye']],
  [/\bcorner\b/i, ['corner_opening']],
  [/\bladder\b/i, ['ladder']],
  [/\bnet\b/i, ['net']],
  [/\bsnapback\b/i, ['snapback']],
  [/\bseki\b/i, ['seki']],
  [/\bthrow[-\s]?in\b/i, ['throw_in']],
  [/\b(dead|alive|unsettled)\b/i, ['status_changed']],
  [/\bsuicide\b/i, ['suicide']],
];

export function filterCoachReply(
  reply: unknown,
  allowedTags: string[]
): { ok: true; reply: CoachMomentReply } | { ok: false; reason: string } {
  if (!reply || typeof reply !== 'object') {
    return { ok: false, reason: 'invalid_shape' };
  }
  const r = reply as Record<string, unknown>;
  if (typeof r.summary !== 'string' || typeof r.concept !== 'string' || typeof r.idea !== 'string') {
    return { ok: false, reason: 'missing_fields' };
  }
  const summary = r.summary.trim();
  const concept = r.concept.trim();
  const idea = r.idea.trim();

  if (!summary || !idea || summary.length > 320 || idea.length > 320) {
    return { ok: false, reason: 'length_bounds' };
  }

  const allowedSet = new Set(allowedTags);
  if (concept !== 'general' && !allowedSet.has(concept)) {
    return { ok: false, reason: `untagged_concept:${concept}` };
  }

  const combined = `${summary} ${idea}`.replace(/\{(?:p\d+|group[A-Za-z0-9]+)\}/g, '');
  if (COORD_RE.test(combined) || PAIR_RE.test(combined)) {
    return { ok: false, reason: 'coordinate_leak' };
  }

  for (const [re, tags] of TERM_TO_TAG) {
    if (re.test(combined)) {
      const permitted = tags.some((t) => allowedSet.has(t));
      if (!permitted) {
        return { ok: false, reason: `untagged_term:${re.source}` };
      }
    }
  }

  return { ok: true, reply: { summary, concept, idea } };
}
