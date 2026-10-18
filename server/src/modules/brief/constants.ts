import type { BriefSection, SmartDiffRole } from '@devdigest/shared';

// ---- Input budget (estimated tokens) ----
export const BRIEF_INPUT_BUDGET_TOKENS = 8000;
export const BRIEF_FIXED_RESERVE_TOKENS = 1200;
export const BRIEF_SECTION_ALLOWANCE: Record<BriefSection, number> = {
  specs: 2400,
  blast_detail: 1000,
  linked_issue: 600,
  description: 1000,
  files: 1800,
};
/** Sections are cut in this order when the budget is exceeded. */
export const BRIEF_CUT_ORDER: readonly BriefSection[] = [
  'specs',
  'blast_detail',
  'linked_issue',
  'description',
  'files',
];

// ---- File ordering ----
export const BRIEF_FILE_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'wiring',
  'tests',
  'docs',
  'boilerplate',
];
export const BRIEF_FALLBACK_ROLE: SmartDiffRole = 'core';

// ---- Caps and text ----
export const BRIEF_MAX_RISKS = 8;
export const BRIEF_MAX_REVIEW_FOCUS = 8;
export const TRUNCATION_MARKER = '…[truncated]';
export const RISK_KIND_VOCABULARY = [
  'security',
  'auth',
  'dependency',
  'config',
  'migration',
  'performance',
  'concurrency',
  'api_contract',
  'data',
  'other',
] as const;

// ---- Model call ----
export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const BRIEF_MAX_OUTPUT_TOKENS = 4096;
/** 3 attempts in total - the provider's existing cap. */
export const BRIEF_MAX_RETRIES = 2;
export const BRIEF_FEATURE_ID = 'risk_brief';

// ---- Route and fetch ----
export const BRIEF_GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
export const BRIEF_ISSUE_FETCH_TIMEOUT_MS = 3000;

// ---- Deterministic line clipping (applied before section fitting) ----
export const BRIEF_MAX_LINE_CHARS = 400;
export const BRIEF_MAX_NAME_CHARS = 200;
export const BRIEF_MAX_ISSUE_TITLE_CHARS = 300;

// ---- Snapshot ----
export const BRIEF_MAX_SNAPSHOT_RETRIES = 1;
