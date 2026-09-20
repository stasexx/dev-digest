"use client";

import React from "react";
import { Badge, Button, Drawer, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SOURCE_LABEL } from "../SkillCard";

const DRAWER_WIDTH = 640;

const metaLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-muted)",
  marginBottom: 4,
};

/** Side-panel preview: name, type, source, version, description, rendered body. */
export function SkillPreviewDrawer({
  skill,
  onClose,
  onOpen,
}: {
  skill: Skill;
  onClose: () => void;
  /** Navigate to the full skill page (tabs: config / preview / versioning / stats). */
  onOpen: () => void;
}) {
  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={skill.name}
      subtitle="Skill preview"
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose}>
            Close
          </Button>
          <Button kind="primary" icon="ExternalLink" onClick={onOpen}>
            Open skill
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={metaLabel}>Type</div>
          <Badge color="var(--text-secondary)" mono>
            {skill.type}
          </Badge>
        </div>
        <div>
          <div style={metaLabel}>Source</div>
          <span style={{ fontSize: 13 }}>{SOURCE_LABEL[skill.source] ?? skill.source}</span>
        </div>
        <div>
          <div style={metaLabel}>Version</div>
          <span className="mono" style={{ fontSize: 13 }}>
            v{skill.version}
          </span>
        </div>
        <div>
          <div style={metaLabel}>Status</div>
          <span style={{ fontSize: 13 }}>{skill.enabled ? "Enabled" : "Disabled"}</span>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={metaLabel}>Description</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          {skill.description || "No description"}
        </div>
      </div>

      <div style={metaLabel}>Body</div>
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px",
          background: "var(--bg-elevated)",
        }}
      >
        <Markdown>{skill.body}</Markdown>
      </div>
    </Drawer>
  );
}
