/**
 * blast module constants. Caller cap and BFS depth are NOT defined here -
 * they come from `../repo-intel/constants.ts` (single source of truth).
 */

/** Newest N commits of the default branch scanned for prior PRs. */
export const MAX_HISTORY_COMMITS = 200;

/** PR-numbered commits (newest first) whose changed files are inspected. */
export const MAX_PRIOR_PR_CANDIDATES = 50;

/** Prior PRs returned to the client. */
export const MAX_PRIOR_PRS = 10;

/** "Merge pull request #12 from owner/branch" -> [1]=number, [2]=owner, [3]=ref. */
export const MERGE_PR_SUBJECT = /^Merge pull request #(\d+) from ([^\s/]+)\/(\S+)/;

/** "Add thing (#12)" -> [1]=title, [2]=number. */
export const SQUASH_PR_SUBJECT = /^(.*\S)\s+\(#(\d+)\)$/;
