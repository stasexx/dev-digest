import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import { FALLBACK_ROLE } from "./constants";

/**
 * "Findings of the latest review" (plan D1, mirrors server `selectLatestReviewFindings`):
 * the newest `kind:'review'` review per agent (null agent = one bucket), unioned.
 * Ties keep the API order (newest first). Accepted/dismissed findings stay in.
 */
export function selectLatestFindings(reviews?: ReviewRecord[]): FindingRecord[] {
  const newest = new Map<string, ReviewRecord>();
  for (const r of reviews ?? []) {
    if (r.kind !== "review") continue;
    const bucket = r.agent_id ?? "\u0000null-agent";
    const cur = newest.get(bucket);
    if (!cur || Date.parse(r.created_at) > Date.parse(cur.created_at)) newest.set(bucket, r);
  }
  return [...newest.values()].flatMap((r) => r.findings);
}

/** Findings keyed by file, sorted by start_line; only paths present in the PR. */
export function groupFindingsByPath(
  findings: FindingRecord[],
  paths: Set<string>,
): Map<string, FindingRecord[]> {
  const out = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    if (!paths.has(f.file)) continue;
    const list = out.get(f.file) ?? [];
    list.push(f);
    out.set(f.file, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.start_line - b.start_line);
  return out;
}

/**
 * Role groups for rendering: role order from the response, GitHub order inside a
 * group, paths unknown to the response go to `core`, empty roles are skipped.
 */
export function buildRoleGroups(
  smart: SmartDiffResponse,
  files: PrFile[],
): { role: SmartDiffRole; files: PrFile[] }[] {
  const roleOf = new Map<string, SmartDiffRole>();
  for (const g of smart.groups) for (const f of g.files) roleOf.set(f.path, g.role);

  const buckets = new Map<SmartDiffRole, PrFile[]>();
  for (const f of files) {
    const role = roleOf.get(f.path) ?? FALLBACK_ROLE;
    const list = buckets.get(role) ?? [];
    list.push(f);
    buckets.set(role, list);
  }
  const order = smart.groups.map((g) => g.role);
  if (!order.includes(FALLBACK_ROLE)) order.unshift(FALLBACK_ROLE);
  return order
    .filter((role) => (buckets.get(role)?.length ?? 0) > 0)
    .map((role) => ({ role, files: buckets.get(role) ?? [] }));
}

/** Number of files (not findings) that have at least one finding. */
export function countFilesWithFindings(
  files: PrFile[],
  byPath: ReadonlyMap<string, FindingRecord[]>,
): number {
  return files.filter((f) => (byPath.get(f.path)?.length ?? 0) > 0).length;
}

export type DiffReviewState = "running" | "none" | "clean" | "has";

export function diffReviewState(
  reviews: ReviewRecord[] | undefined,
  running: boolean,
  findingsInDiff: number,
): DiffReviewState {
  if (running) return "running";
  if (!(reviews ?? []).some((r) => r.kind === "review")) return "none";
  return findingsInDiff > 0 ? "has" : "clean";
}
