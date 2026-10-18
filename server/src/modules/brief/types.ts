import type {
  BlastRadiusResponse,
  BriefGeneration,
  BriefSection,
  ChatMessage,
  Intent,
  Risk,
  ReviewFocusItem,
  SmartDiffRole,
} from '@devdigest/shared';

/**
 * Interfaces shared by the brief module's layers (facts gathering, prompt
 * assembly, grounding, service). Types only - no logic.
 */

export interface BriefFileFact {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  /** Inclusive [start, end] new-side line ranges touched by the diff. */
  changedRanges: Array<[number, number]>;
  findingLines: number[];
}

export interface BriefFacts {
  snapshot: { headSha: string; filesFingerprint: string };
  pr: {
    id: string;
    title: string;
    body: string | null;
    headSha: string;
    additions: number;
    deletions: number;
    filesCount: number;
  };
  files: BriefFileFact[];
  intent: Intent | null;
  blast: {
    status: 'present' | 'partial' | 'missing';
    reason: string | null;
    data: BlastRadiusResponse | null;
  };
  linkedIssue: {
    status: 'present' | 'none' | 'unavailable';
    reason: string | null;
    issue: { number: number; title: string; state: string; body: string | null } | null;
  };
  specs: {
    status: 'present' | 'missing';
    reason: string | null;
    docs: { path: string; text: string }[];
    missingPaths: string[];
  };
}

export type AssembledPrompt =
  | {
      ok: true;
      messages: ChatMessage[];
      inputTokensEstimate: number;
      truncatedSections: BriefSection[];
      removedSections: BriefSection[];
      specs: { read: string[]; truncated: string[]; omitted: string[] };
      filesListed: number;
    }
  | { ok: false; reason: 'fixed_over_budget'; fixedTokensEstimate: number };

export interface GroundingResult {
  risks: Risk[];
  reviewFocus: ReviewFocusItem[];
  dropped: BriefGeneration['dropped'];
}
