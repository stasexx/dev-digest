"use client";

import type { DiffFindingCardProps } from "@/components/diff-viewer";
import { FindingCard } from "../FindingCard";

/** Module-level adapter (never define it inside a render): the Agent-runs card, expanded. */
export function DiffFindingCard({ finding, pending, onAction }: DiffFindingCardProps) {
  return <FindingCard f={finding} defaultExpanded pending={pending} onAction={onAction} />;
}
