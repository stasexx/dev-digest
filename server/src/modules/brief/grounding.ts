import type { BlastRadius, BriefModelOutput, ReviewFocusItem, Risk } from '@devdigest/shared';
import { BRIEF_MAX_REVIEW_FOCUS, BRIEF_MAX_RISKS } from './constants.js';
import type { GroundingResult } from './types.js';

/**
 * Grounding of the model output: every cited file must be a changed file or
 * appear in the blast map. Pure; exact (case-sensitive) matching.
 */

/** Changed files, plus blast symbol files and caller files when blast is present. */
export function buildAllowedSet(changedPaths: readonly string[], blast: BlastRadius | null): Set<string> {
  const allowed = new Set<string>(changedPaths);
  if (blast) {
    for (const s of blast.changed_symbols) allowed.add(s.file);
    for (const d of blast.downstream) for (const c of d.callers) allowed.add(c.file);
  }
  return allowed;
}

/** Strip a trailing `:N` / `:N-M` (kept as `suffix`), then a leading `./` or `/`. */
export function normaliseRef(ref: string): { path: string; suffix: string } {
  const trimmed = ref.trim();
  const m = /:(\d+(?:-\d+)?)$/.exec(trimmed);
  const suffix = m ? `:${m[1] ?? ''}` : '';
  const withoutSuffix = m ? trimmed.slice(0, trimmed.length - suffix.length) : trimmed;
  return { path: withoutSuffix.replace(/^(?:\.\/|\/)+/, ''), suffix };
}

/**
 * Keep only grounded items, dedupe focus by (file, line), keep model order,
 * cap at 8 + 8 and count what was dropped.
 *  - `dropped.risks`: risks removed because none of their refs was grounded;
 *  - `dropped.risk_refs`: ungrounded refs removed from risks that survived;
 *  - `dropped.review_focus`: focus items citing a file outside the allowed set.
 */
export function groundBriefOutput(output: BriefModelOutput, allowed: ReadonlySet<string>): GroundingResult {
  let droppedRisks = 0;
  let droppedRefs = 0;
  const groundedRisks: Risk[] = [];
  for (const risk of output.risks) {
    const kept: string[] = [];
    for (const ref of risk.file_refs) {
      const { path, suffix } = normaliseRef(ref);
      if (allowed.has(path)) kept.push(`${path}${suffix}`);
    }
    if (kept.length === 0) {
      droppedRisks++;
      continue;
    }
    droppedRefs += risk.file_refs.length - kept.length;
    groundedRisks.push({ ...risk, file_refs: kept });
  }

  let droppedFocus = 0;
  let duplicates = 0;
  const seen = new Set<string>();
  const groundedFocus: ReviewFocusItem[] = [];
  for (const item of output.review_focus) {
    const { path } = normaliseRef(item.file);
    if (!allowed.has(path)) {
      droppedFocus++;
      continue;
    }
    const key = `${path}\u0000${item.line}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    groundedFocus.push({ ...item, file: path });
  }

  return {
    risks: groundedRisks.slice(0, BRIEF_MAX_RISKS),
    reviewFocus: groundedFocus.slice(0, BRIEF_MAX_REVIEW_FOCUS),
    dropped: {
      risks: droppedRisks,
      risk_refs: droppedRefs,
      review_focus: droppedFocus,
      duplicates,
      over_cap: {
        risks: Math.max(0, groundedRisks.length - BRIEF_MAX_RISKS),
        review_focus: Math.max(0, groundedFocus.length - BRIEF_MAX_REVIEW_FOCUS),
      },
    },
  };
}
