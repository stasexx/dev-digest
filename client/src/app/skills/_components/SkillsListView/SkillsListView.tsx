/* /skills — Skills list. SkillCards + create/import. Clicking a card opens a
   side-panel preview; "Open skill" there navigates to the multi-tab editor at
   /skills/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { ImportDrawer } from "../ImportDrawer";
import { CreateSkillModal } from "../CreateSkillModal";
import { SkillPreviewDrawer } from "../SkillPreviewDrawer";

export function SkillsListView() {
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [importOpen, setImportOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const list = (skills ?? []).filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  // Derived from the live list so toggles/edits are reflected in the open preview.
  const selected = selectedId ? (skills ?? []).find((s) => s.id === selectedId) : undefined;

  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Skills" }]}>
      {importOpen && <ImportDrawer onClose={() => setImportOpen(false)} />}
      {createOpen && (
        <CreateSkillModal onClose={() => setCreateOpen(false)} onCreated={(sk) => setSelectedId(sk.id)} />
      )}
      {selected && (
        <SkillPreviewDrawer
          skill={selected}
          onClose={() => setSelectedId(null)}
          onOpen={() => router.push(`/skills/${selected.id}?tab=config`)}
        />
      )}
      <div style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, flex: 1 }}>Skills</h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "0 10px",
              height: 32,
            }}
          >
            <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              style={{
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "var(--text-primary)",
                width: 180,
              }}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                Add Skill
              </Button>
            }
            items={[
              { label: "Create", icon: "Edit", onClick: () => setCreateOpen(true) },
              { label: "Import", icon: "Upload", onClick: () => setImportOpen(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body="Could not load skills." onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title="No skills yet"
            body="Import a skill from a file or create one from scratch."
            cta="Create skill"
            onCta={() => setCreateOpen(true)}
          />
        )}
        {list.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => setSelectedId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
