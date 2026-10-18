import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("renders custom labels without needing the prReview namespace", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{}} onError={() => {}}>
        <VerdictBanner
          verdict="approve"
          summary="Looks fine."
          score={90}
          findingsCount={2}
          blockers={1}
          labels={{
            verdict: { request_changes: "RC", approve: "Ship it", comment: "Note" },
            findingsCount: "2 found",
            blockers: " + 1 blocking",
            prScore: "SCORE",
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByText(/2 found \+ 1 blocking/)).toBeInTheDocument();
    expect(screen.getByText("SCORE")).toBeInTheDocument();
  });
});
