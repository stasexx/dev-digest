import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import { DegradedNotice } from "./DegradedNotice";

afterEach(cleanup);

function renderNotice(over: Partial<React.ComponentProps<typeof DegradedNotice>> = {}) {
  const onResync = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <DegradedNotice
        reason="no_data"
        indexStatus="degraded"
        onResync={onResync}
        resyncPending={false}
        resyncStarted={false}
        {...over}
      />
    </NextIntlClientProvider>,
  );
  return onResync;
}

describe("DegradedNotice", () => {
  it("renders the reason copy and index status", () => {
    renderNotice();
    expect(screen.getByText("Index incomplete")).toBeTruthy();
    expect(screen.getByText("This repository has not been indexed yet.")).toBeTruthy();
    expect(screen.getByText("index status: degraded")).toBeTruthy();
  });

  it("calls onResync when Resync is clicked", () => {
    const onResync = renderNotice();
    fireEvent.click(screen.getByRole("button", { name: /Resync/ }));
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("replaces the button with a started message", () => {
    renderNotice({ resyncStarted: true });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Resync started/)).toBeTruthy();
  });
});
