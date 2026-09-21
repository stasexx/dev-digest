/* SkillCard — type badge, source label, version, linked-agent count,
   enabled toggle, delete (with confirmation modal). */
"use client";

import React from "react";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "../../../../lib/hooks/skills";
import { SOURCE_LABEL } from "./constants";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const agentCount = skill.agent_count ?? 0;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        cursor: "pointer",
        marginBottom: 4,
        background: active ? "var(--bg-active)" : "transparent",
        border: active ? "1px solid var(--border-active)" : "1px solid transparent",
        opacity: skill.enabled ? 1 : 0.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon.Sparkles size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {skill.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title="Delete"
          aria-label="Delete"
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash
            size={14}
            style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined}
          />
        </button>
      </div>
      {skill.description && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {skill.description}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Badge color="var(--text-secondary)" mono>
          {skill.type}
        </Badge>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          ✎ {SOURCE_LABEL[skill.source] ?? skill.source}
        </span>
        {skill.source !== "manual" && (
          <Badge color="var(--warning-text)" icon="AlertTriangle" style={{ fontSize: 10 }}>
            needs vetting
          </Badge>
        )}
        <span
          className="mono"
          style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}
        >
          <span title="Current version">v{skill.version}</span>
          {" · "}
          <span title="Agents using this skill">
            {agentCount} {agentCount === 1 ? "agent" : "agents"}
          </span>
        </span>
      </div>
      {confirming && (
        <ConfirmDeleteModal
          title="Delete skill"
          itemKind="skill"
          itemName={skill.name}
          pending={del.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => del.mutate(skill.id, { onSettled: () => setConfirming(false) })}
        />
      )}
    </div>
  );
}
