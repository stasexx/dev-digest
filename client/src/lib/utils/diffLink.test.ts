import { describe, it, expect } from "vitest";
import { parseFileRef, buildDiffQuery, parseDiffTarget } from "./diffLink";

describe("parseFileRef", () => {
  it("takes the first line of a range", () => {
    expect(parseFileRef("a.ts:12-18")).toEqual({ path: "a.ts", line: 12 });
  });
  it("handles single line, no line, and ./ prefix", () => {
    expect(parseFileRef("src/a.ts:7")).toEqual({ path: "src/a.ts", line: 7 });
    expect(parseFileRef("./a.ts")).toEqual({ path: "a.ts", line: null });
    expect(parseFileRef("a b/c#d.ts:3")).toEqual({ path: "a b/c#d.ts", line: 3 });
  });
  it("does not throw on odd input", () => {
    expect(() => parseFileRef("")).not.toThrow();
    expect(parseFileRef("a.ts:0").line).toBeNull();
  });
});

describe("buildDiffQuery", () => {
  it("sets tab/file/line, drops trace, keeps others", () => {
    const q = new URLSearchParams(buildDiffQuery("foo=1&trace=abc&tab=overview", "a.ts", 12));
    expect(q.get("tab")).toBe("diff");
    expect(q.get("file")).toBe("a.ts");
    expect(q.get("line")).toBe("12");
    expect(q.get("foo")).toBe("1");
    expect(q.has("trace")).toBe(false);
  });
  it("deletes line when null and round-trips spaces and #", () => {
    const s = buildDiffQuery(new URLSearchParams("line=5"), "dir x/a#b.ts", null);
    const q = new URLSearchParams(s);
    expect(q.has("line")).toBe(false);
    expect(q.get("file")).toBe("dir x/a#b.ts");
  });
});

describe("parseDiffTarget", () => {
  const paths = ["a.ts", "dir x/a#b.ts"];
  it("none without file", () => {
    expect(parseDiffTarget(null, "3", paths)).toEqual({ kind: "none" });
  });
  it("not_in_diff for unknown file (exact match only)", () => {
    expect(parseDiffTarget("b.ts", null, paths)).toEqual({ kind: "not_in_diff", file: "b.ts" });
    expect(parseDiffTarget("./a.ts", null, paths).kind).toBe("not_in_diff");
  });
  it("target with valid line", () => {
    expect(parseDiffTarget("dir x/a#b.ts", "12", paths)).toEqual({
      kind: "target",
      file: "dir x/a#b.ts",
      line: 12,
    });
  });
  it.each(["-3", "abc", "0", "1.5", "", "01"])("ignores invalid line %s", (l) => {
    expect(parseDiffTarget("a.ts", l, paths)).toEqual({ kind: "target", file: "a.ts", line: null });
  });
  it("null line is fine", () => {
    expect(parseDiffTarget("a.ts", null, paths)).toEqual({ kind: "target", file: "a.ts", line: null });
  });
});
