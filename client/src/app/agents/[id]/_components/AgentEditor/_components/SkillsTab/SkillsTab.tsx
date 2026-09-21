"use client";
import React from "react";
import { Badge, Skeleton, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkills, useAgentSkillLinks, useSetAgentSkills } from "../../../../../../../lib/hooks/skills";

export function SkillsTab({ agentId }: { agentId: string }) {
  const { data: allSkills, isLoading: skillsLoading } = useSkills();
  const { data: links, isLoading: linksLoading } = useAgentSkillLinks(agentId);
  const setSkills = useSetAgentSkills();

  const [orderedIds, setOrderedIds] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const dragItem = React.useRef<number | null>(null);
  const dragOverItem = React.useRef<number | null>(null);

  // Initialize from server data
  React.useEffect(() => {
    if (links) {
      const sorted = [...links].sort((a, b) => a.order - b.order);
      setOrderedIds(sorted.map((l) => l.skill_id));
    }
  }, [links]);

  if (skillsLoading || linksLoading) return <Skeleton height={200} />;

  const skillMap = new Map((allSkills ?? []).map((s: Skill) => [s.id, s]));
  const linkedSet = new Set(orderedIds);

  // "Enabled" here = linked to this agent (the on/off toggle of the row).
  const enabledCount = orderedIds.filter((id) => skillMap.has(id)).length;
  const matchesSearch = (sk: Skill) => !search || sk.name.toLowerCase().includes(search.toLowerCase());

  const filteredSkills = (allSkills ?? []).filter(matchesSearch);

  const toggleLink = (skillId: string) => {
    const next = linkedSet.has(skillId)
      ? orderedIds.filter((id) => id !== skillId)
      : [...orderedIds, skillId];
    setOrderedIds(next);
    setSkills.mutate({ agentId, skillIds: next });
  };

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const next = [...orderedIds];
    const draggedId = next.splice(dragItem.current, 1)[0]!;
    next.splice(dragOverItem.current, 0, draggedId);
    dragItem.current = null;
    dragOverItem.current = null;
    setOrderedIds(next);
    setSkills.mutate({ agentId, skillIds: next });
  };

  return (
    <div style={{ maxWidth: 580 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {enabledCount} of {(allSkills ?? []).length} enabled
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills by name…"
          aria-label="Search skills"
          style={{
            marginLeft: "auto",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            padding: "4px 10px",
            fontSize: 12,
            color: "var(--text-primary)",
            outline: "none",
            width: 160,
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Order matters — drag enabled skills to reorder. Disabled skills cannot be dragged.
      </p>

      {/* Linked skills (ordered, draggable) */}
      {orderedIds.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {orderedIds.map((skillId, idx) => {
            const sk = skillMap.get(skillId);
            // Search hides non-matching rows; `idx` stays the real position in the order.
            if (!sk || !matchesSearch(sk)) return null;
            return (
              <div
                key={skillId}
                data-testid="skill-row-enabled"
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 6, marginBottom: 4,
                  border: "1px solid var(--border)", background: "var(--bg-surface)",
                  cursor: "grab",
                }}
              >
                <span style={{ color: "var(--text-muted)", cursor: "grab", flexShrink: 0, fontSize: 14 }}>⠿</span>
                <Toggle on onChange={() => toggleLink(skillId)} size={14} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{sk.name}</span>
                <Badge color="var(--text-secondary)" mono>{sk.type}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Disabled (unlinked) skills — not draggable and not drop targets. */}
      {filteredSkills
        .filter((s: Skill) => !linkedSet.has(s.id))
        .map((sk: Skill) => (
          <div
            key={sk.id}
            data-testid="skill-row-disabled"
            draggable={false}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 6, marginBottom: 4,
              border: "1px solid var(--border)", opacity: 0.7,
            }}
          >
            <div style={{ width: 14, flexShrink: 0 }} />
            <Toggle on={false} onChange={() => toggleLink(sk.id)} size={14} />
            <span style={{ flex: 1, fontSize: 13 }}>{sk.name}</span>
            <Badge color="var(--text-secondary)" mono>{sk.type}</Badge>
          </div>
        ))}
    </div>
  );
}
