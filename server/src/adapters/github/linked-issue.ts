/**
 * Linked-issue rule shared by the GitHub adapter (PR detail) and the PR Brief:
 * the first `#N` in the PR body, optionally prefixed by closes/fixes/resolves.
 */
export const LINKED_ISSUE_PATTERN = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

export function parseLinkedIssueNumber(body: string | null | undefined): number | null {
  if (!body) return null;
  const m = body.match(LINKED_ISSUE_PATTERN);
  return m?.[1] ? Number(m[1]) : null;
}
