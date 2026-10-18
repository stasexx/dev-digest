import { wrapUntrusted } from '../../platform/prompt.js';
import type { BriefSection } from '@devdigest/shared';
import { BRIEF_CUT_ORDER, TRUNCATION_MARKER } from './constants.js';

/**
 * Pure budget helpers for the PR Brief prompt: estimation, deterministic
 * clipping/truncation and the section fitter. No I/O.
 */

/** Same formula as `approxTokens` and the intent classifier. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/** Collects whether any clipping/truncation happened while rendering a section. */
export interface ClipTracker {
  hit: boolean;
}

function dropLoneHighSurrogate(s: string): string {
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s;
}

/**
 * Deterministic single-line clip: whitespace is collapsed, the head is kept
 * and a clipped result ends with `…`. Result length never exceeds `maxChars`.
 */
export function clip(text: string, maxChars: number, tracker?: ClipTracker): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= maxChars) return one;
  if (tracker) tracker.hit = true;
  return dropLoneHighSurrogate(one.slice(0, Math.max(0, maxChars - 1))) + '…';
}

/** Tail-truncate so that the result, marker included, fits `maxTokens`. */
export function truncateTail(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  if (maxChars < TRUNCATION_MARKER.length) return '';
  return dropLoneHighSurrogate(text.slice(0, maxChars - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER;
}

export interface FittedBody {
  /** The body as it appears in the rendered section. */
  body: string;
  /** The fully rendered section text (heading + fence included). */
  text: string;
  truncated: boolean;
}

/**
 * Fit one free-text body into a rendered section of at most `maxChars`
 * characters. `render` wraps the body (heading, untrusted fence); the size is
 * measured AFTER wrapping. Returns null when even the marker alone does not fit.
 */
export function fitBody(args: {
  render: (body: string) => string;
  body: string;
  maxChars: number;
}): FittedBody | null {
  const { render, body, maxChars } = args;
  const full = render(body);
  if (full.length <= maxChars) return { body, text: full, truncated: false };
  let k = maxChars - render('').length - TRUNCATION_MARKER.length;
  for (let i = 0; i < 8 && k >= 0; i++) {
    const cut = dropLoneHighSurrogate(body.slice(0, k)) + TRUNCATION_MARKER;
    const candidate = render(cut);
    if (candidate.length <= maxChars) return { body: cut, text: candidate, truncated: true };
    k -= candidate.length - maxChars;
  }
  const markerOnly = render(TRUNCATION_MARKER);
  return markerOnly.length <= maxChars
    ? { body: TRUNCATION_MARKER, text: markerOnly, truncated: true }
    : null;
}

export interface FittedLines {
  text: string;
  accepted: number;
  truncated: boolean;
}

/**
 * The one generic fitter for list sections. Deterministic:
 *  1. overhead = heading + the untrusted fence;
 *  2. walk `lines` in order, accept a line only if overhead + accepted + this
 *     line + the aggregate lines for everything still unaccepted fit `maxChars`;
 *  3. stop at the first line that does not fit (the accepted set is a prefix);
 *  4. the rest collapses into the caller's aggregate lines (`+K more ...`);
 *  5. when even overhead + aggregates do not fit, return null (section dropped).
 */
export function fitLines<T extends { text: string }>(args: {
  heading: string;
  label: string;
  lines: readonly T[];
  aggregate: (rest: readonly T[]) => string[];
  maxChars: number;
}): FittedLines | null {
  const { heading, label, lines, aggregate, maxChars } = args;
  const render = (texts: string[]) => `${heading}\n${wrapUntrusted(label, texts.join('\n'))}`;
  const accepted: string[] = [];
  for (const [i, line] of lines.entries()) {
    const candidate = [...accepted, line.text, ...aggregate(lines.slice(i + 1))];
    if (render(candidate).length > maxChars) break;
    accepted.push(line.text);
  }
  const rest = aggregate(lines.slice(accepted.length));
  const text = render([...accepted, ...rest]);
  if (text.length > maxChars) return null;
  return { text, accepted: accepted.length, truncated: accepted.length < lines.length };
}

export interface SectionInput {
  name: BriefSection;
  /** Fully rendered section text (heading, fence and aggregates included). */
  text: string;
  /** Allowance this section was rendered against, in estimated tokens. */
  allowanceTokens: number;
}

export type FitSectionsResult =
  | { ok: true; user: string; removed: BriefSection[] }
  | { ok: false; fixedTokensEstimate: number };

/**
 * Join the fixed part and the sections, then enforce the total budget.
 *  - each section is asserted to be within its own allowance (a renderer that
 *    breaks this is a bug, so this throws);
 *  - while system + user exceeds `budgetTokens`, whole sections are removed in
 *    `BRIEF_CUT_ORDER`; fixed content is never cut;
 *  - unused allowance is not reassigned;
 *  - when system + fixed alone exceed the budget, nothing can help: `ok: false`.
 *
 * Scope (Resolved interpretation I-1): the limit applies to the INITIAL
 * system + user request built here. Repair re-prompts inside the single
 * structured call are bounded by maxRetries / maxTokens in the service.
 */
export function fitSections(args: {
  system: string;
  fixed: string;
  sections: readonly SectionInput[];
  budgetTokens: number;
}): FitSectionsResult {
  const { system, fixed, sections, budgetTokens } = args;
  for (const s of sections) {
    const size = estimateTokens(s.text);
    if (size > s.allowanceTokens) {
      throw new Error(`brief section "${s.name}" is ${size} tokens, over its allowance ${s.allowanceTokens}`);
    }
  }
  const fixedTokensEstimate = estimateTokens(system + fixed);
  if (fixedTokensEstimate > budgetTokens) return { ok: false, fixedTokensEstimate };

  const kept = new Map<BriefSection, SectionInput>(sections.map((s) => [s.name, s]));
  const join = () => [fixed, ...sections.filter((s) => kept.has(s.name)).map((s) => s.text)].join('\n\n');
  const removed: BriefSection[] = [];
  for (const name of BRIEF_CUT_ORDER) {
    if (estimateTokens(system + join()) <= budgetTokens) break;
    if (kept.delete(name)) removed.push(name);
  }
  return { ok: true, user: join(), removed };
}
