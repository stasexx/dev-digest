import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

afterEach(cleanup);

function setup() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const onParentClick = vi.fn();
  render(
    <div onClick={onParentClick}>
      <ConfirmDeleteModal
        title="Delete skill"
        itemKind="skill"
        itemName="API errors"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>,
  );
  return { onConfirm, onCancel, onParentClick };
}

describe("ConfirmDeleteModal", () => {
  it("renders a dialog naming the item", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete skill")).toBeInTheDocument();
    expect(screen.getByText(/API errors/)).toBeInTheDocument();
  });

  it("Delete calls onConfirm and does not bubble to the parent", () => {
    const { onConfirm, onCancel, onParentClick } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("Cancel and the close cross call onCancel, never onConfirm", () => {
    const { onConfirm, onCancel, onParentClick } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
