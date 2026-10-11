import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRefreshOnRunsSettled } from "./reviews";

function setup(initial: { prId: string | null; running: boolean }) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook((p: { prId: string | null; running: boolean }) => useRefreshOnRunsSettled(p.prId, p.running), {
    wrapper,
    initialProps: initial,
  });
  return { spy, ...hook };
}

describe("useRefreshOnRunsSettled", () => {
  it("does nothing on initial false", () => {
    const { spy } = setup({ prId: "p1", running: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it("invalidates reviews and pr-runs on true -> false", () => {
    const { spy, rerender } = setup({ prId: "p1", running: true });
    expect(spy).not.toHaveBeenCalled();
    rerender({ prId: "p1", running: false });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews", "p1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["pr-runs", "p1"] });
  });

  it("does nothing on false -> false or true -> true", () => {
    const a = setup({ prId: "p1", running: false });
    a.rerender({ prId: "p1", running: false });
    expect(a.spy).not.toHaveBeenCalled();
    const b = setup({ prId: "p1", running: true });
    b.rerender({ prId: "p1", running: true });
    expect(b.spy).not.toHaveBeenCalled();
  });

  it("does nothing when prId is null", () => {
    const { spy, rerender } = setup({ prId: null, running: true });
    rerender({ prId: null, running: false });
    expect(spy).not.toHaveBeenCalled();
  });
});
