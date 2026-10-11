import type { ChangedSymbol, RankedDownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/utils/githubUrls";

/** `file:line` label shown for a caller. */
export function formatLocation(file: string, line: number): string {
  return `${file}:${line}`;
}

/** GitHub deep-link to the caller line, or null when the repo name or sha is unknown. */
export function callerHref(
  repoFullName: string | null | undefined,
  sha: string | null | undefined,
  file: string,
  line: number,
): string | null {
  if (!repoFullName || !sha) return null;
  return githubBlobUrl(repoFullName, sha, file, line);
}

/** Changed symbols that have no downstream callers (deduped, original order). */
export function withoutCallers(
  changed: ChangedSymbol[],
  downstream: Pick<RankedDownstreamImpact, "symbol">[],
): string[] {
  const withCallers = new Set(downstream.map((d) => d.symbol));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of changed) {
    if (withCallers.has(c.name) || seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c.name);
  }
  return out;
}
