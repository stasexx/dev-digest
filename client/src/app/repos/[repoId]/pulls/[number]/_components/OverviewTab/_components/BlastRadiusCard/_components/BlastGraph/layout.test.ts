import { describe, it, expect } from "vitest";
import type { RankedDownstreamImpact } from "@devdigest/shared";
import { buildBlastGraph, truncateLabel } from "./layout";
import { DOWNSTREAM, FACTS } from "./fixtures";

describe("buildBlastGraph", () => {
  const graph = buildBlastGraph(DOWNSTREAM, FACTS);
  const ofKind = (k: string) => graph.nodes.filter((n) => n.kind === k);

  it("creates nodes per kind for the PR #6 fixture", () => {
    expect(ofKind("symbol")).toHaveLength(4);
    expect(ofKind("caller")).toHaveLength(6);
    expect(ofKind("endpoint")).toHaveLength(3);
    expect(ofKind("cron")).toHaveLength(0);
  });

  it("assigns columns by kind", () => {
    expect(ofKind("symbol").every((n) => n.column === 0)).toBe(true);
    expect(ofKind("caller").every((n) => n.column === 1)).toBe(true);
    expect(ofKind("endpoint").every((n) => n.column === 2)).toBe(true);
  });

  it("emits symbol->caller and caller->endpoint edges", () => {
    const symEdges = graph.edges.filter((e) => e.from.startsWith("sym:"));
    const epEdges = graph.edges.filter((e) => e.to.startsWith("ep:"));
    expect(symEdges).toHaveLength(6);
    expect(epEdges).toHaveLength(3);
    for (const e of graph.edges) {
      expect(graph.nodes.some((n) => n.id === e.from)).toBe(true);
      expect(graph.nodes.some((n) => n.id === e.to)).toBe(true);
    }
  });

  it("never gives two nodes of a column the same y", () => {
    for (const col of [0, 1, 2]) {
      const ys = graph.nodes.filter((n) => n.column === col).map((n) => n.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
  });

  it("centres shorter columns vertically", () => {
    const mid = (col: number) => {
      const c = graph.nodes.filter((n) => n.column === col);
      return (Math.min(...c.map((n) => n.y)) + Math.max(...c.map((n) => n.y + n.height))) / 2;
    };
    expect(mid(0)).toBeCloseTo(mid(1));
    expect(mid(2)).toBeCloseTo(mid(1));
    expect(graph.height).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(buildBlastGraph(DOWNSTREAM, FACTS)).toEqual(buildBlastGraph(DOWNSTREAM, FACTS));
  });

  it("de-duplicates callers, endpoints and edges shared between symbols", () => {
    const shared: RankedDownstreamImpact[] = [
      { ...DOWNSTREAM[0]! },
      { ...DOWNSTREAM[0]!, symbol: "other" },
    ];
    const g = buildBlastGraph(shared, FACTS);
    expect(g.nodes.filter((n) => n.kind === "symbol")).toHaveLength(2);
    expect(g.nodes.filter((n) => n.kind === "caller")).toHaveLength(2);
    expect(g.nodes.filter((n) => n.kind === "endpoint")).toHaveLength(3);
    expect(g.edges.filter((e) => e.from.startsWith("sym:"))).toHaveLength(4);
    expect(g.edges.filter((e) => e.to.startsWith("ep:"))).toHaveLength(3);
  });

  it("adds cron nodes separately from endpoints", () => {
    const g = buildBlastGraph([DOWNSTREAM[0]!], {
      [DOWNSTREAM[0]!.callers[0]!.file]: { endpoints: [], crons: ["0 * * * *"] },
    });
    expect(g.nodes.filter((n) => n.kind === "cron")).toHaveLength(1);
    expect(g.nodes.filter((n) => n.kind === "endpoint")).toHaveLength(0);
  });

  it("returns an empty layout for empty input", () => {
    expect(buildBlastGraph([], {})).toMatchObject({ nodes: [], edges: [], height: 0 });
  });
});

describe("truncateLabel", () => {
  it("keeps short labels and ellipsises long ones", () => {
    expect(truncateLabel("abc", 5)).toBe("abc");
    expect(truncateLabel("abcdefgh", 5)).toBe("abcd…");
  });
});
