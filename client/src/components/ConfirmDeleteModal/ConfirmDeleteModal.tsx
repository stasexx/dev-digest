"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Button, Modal } from "@devdigest/ui";

const MODAL_WIDTH = 440;

/**
 * Delete confirmation dialog built on the `Modal` primitive: title, a short
 * text naming the item, Cancel / Delete (danger) buttons and the modal's own
 * close cross.
 *
 * Rendered through a portal so a dimmed (opacity) or grid parent cannot affect
 * it. React synthetic events still bubble through portals, so every click is
 * stopped here — a click inside the dialog must never reach the card's onClick.
 */
export function ConfirmDeleteModal({
  title,
  itemName,
  itemKind = "item",
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Name of the entity being deleted — shown in the body text. */
  itemName: string;
  /** Lower-case noun for the body text, e.g. "skill" / "agent". */
  itemKind?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      <Modal
        width={MODAL_WIDTH}
        title={title}
        onClose={onCancel}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button kind="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button kind="danger" icon="Trash" onClick={onConfirm} loading={pending} disabled={pending}>
              Delete
            </Button>
          </div>
        }
      >
        <div style={{ padding: "18px 24px", fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          Delete {itemKind}{" "}
          <strong style={{ color: "var(--text-primary)" }}>&ldquo;{itemName}&rdquo;</strong>? This cannot be
          undone.
        </div>
      </Modal>
    </div>,
    document.body,
  );
}
