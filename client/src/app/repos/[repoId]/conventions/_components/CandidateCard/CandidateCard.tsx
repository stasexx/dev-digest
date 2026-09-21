/* CandidateCard — one extracted convention: rule, category, code-verified evidence
   (clickable through to GitHub), confidence, and Accept / Reject / Edit. Edit is
   inline — the card swaps its header for a small form, no navigation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfidenceNum, FormField, Icon, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionUpdateInput } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function CandidateCard({
  candidate: c,
  repoFullName,
  gitRef,
  pending,
  onUpdate,
}: {
  candidate: ConventionCandidate;
  repoFullName?: string | null;
  /** Branch (or sha) evidence links point at. */
  gitRef?: string | null;
  pending?: boolean;
  onUpdate: (patch: ConventionUpdateInput) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(c.rule);
  const [category, setCategory] = React.useState(c.category);
  const accepted = c.status === "accepted";

  const startEdit = () => {
    setRule(c.rule);
    setCategory(c.category);
    setEditing(true);
  };
  const save = () => {
    if (!rule.trim()) return;
    onUpdate({ rule: rule.trim(), category: category.trim() || c.category });
    setEditing(false);
  };

  const where = `${c.evidence_path}${c.evidence_line ? `:${c.evidence_line}` : ""}`;
  const href =
    repoFullName && c.evidence_path
      ? githubBlobUrl(repoFullName, gitRef || "main", c.evidence_path, c.evidence_line ?? undefined)
      : null;

  return (
    <article style={s.card(accepted)} aria-label={c.rule}>
      {editing ? (
        <div style={s.editForm}>
          <FormField label={t("card.ruleLabel")}>
            <Textarea value={rule} onChange={setRule} rows={2} />
          </FormField>
          <FormField label={t("card.categoryLabel")}>
            <TextInput value={category} onChange={setCategory} />
          </FormField>
        </div>
      ) : (
        <div style={s.head}>
          <div style={s.rule}>{c.rule}</div>
          <Badge color="var(--text-secondary)" bg="var(--bg-hover)">
            {c.category}
          </Badge>
          <span style={s.confidence}>
            <ConfidenceNum value={c.confidence} />
          </span>
        </div>
      )}

      {href ? (
        <a className="mono" style={s.evidenceLink} href={href} target="_blank" rel="noreferrer noopener">
          <Icon.ExternalLink size={11} /> {where}
        </a>
      ) : (
        <span className="mono" style={{ ...s.evidenceLink, color: "var(--text-muted)" }}>
          {where}
        </span>
      )}
      {c.evidence_snippet && (
        <pre className="mono" style={s.snippet}>
          {c.evidence_snippet}
        </pre>
      )}

      <div style={s.actions}>
        {editing ? (
          <>
            <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!rule.trim()}>
              {t("card.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              kind={accepted ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              disabled={pending}
              aria-pressed={accepted}
              // Accept is a toggle: a second click returns the candidate to "pending".
              onClick={() => onUpdate({ status: accepted ? "pending" : "accepted" })}
            >
              {accepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button kind="ghost" size="sm" icon="X" disabled={pending} onClick={() => onUpdate({ status: "rejected" })}>
              {t("card.reject")}
            </Button>
            <Button kind="ghost" size="sm" icon="Edit" disabled={pending} onClick={startEdit}>
              {t("card.edit")}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
