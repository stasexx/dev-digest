/* diffLink.ts — pure helpers for deep links into the Files changed tab
   (?tab=diff&file=<path>&line=<n>). No React. */

export type DiffTarget =
  | { kind: "none" }
  | { kind: "not_in_diff"; file: string }
  | { kind: "target"; file: string; line: number | null };

const POSITIVE_INT = /^[1-9]\d*$/;

/** "a.ts:12-18" -> { path: "a.ts", line: 12 }; "./a.ts" -> { path: "a.ts", line: null }. */
export function parseFileRef(ref: string): { path: string; line: number | null } {
  let s = (ref ?? "").trim();
  let line: number | null = null;
  const m = /^(.*?):(\d+)(?:-\d+)?$/.exec(s);
  if (m) {
    s = m[1] ?? s;
    const n = Number(m[2]);
    line = Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  while (s.startsWith("./")) s = s.slice(2);
  return { path: s, line };
}

/** Set tab=diff, file, line (removed when null); drop `trace`; keep other params. */
export function buildDiffQuery(
  current: URLSearchParams | string,
  file: string,
  line: number | null,
): string {
  const p = new URLSearchParams(typeof current === "string" ? current : current.toString());
  p.set("tab", "diff");
  p.set("file", file);
  if (line == null) p.delete("line");
  else p.set("line", String(line));
  p.delete("trace");
  return p.toString();
}

/** Validate URL params against the PR's changed paths (exact match; line must be a positive int). */
export function parseDiffTarget(
  fileParam: string | null,
  lineParam: string | null,
  changedPaths: readonly string[],
): DiffTarget {
  if (!fileParam) return { kind: "none" };
  if (!changedPaths.includes(fileParam)) return { kind: "not_in_diff", file: fileParam };
  let line: number | null = null;
  if (lineParam != null && POSITIVE_INT.test(lineParam)) {
    const n = Number(lineParam);
    if (Number.isSafeInteger(n)) line = n;
  }
  return { kind: "target", file: fileParam, line };
}
