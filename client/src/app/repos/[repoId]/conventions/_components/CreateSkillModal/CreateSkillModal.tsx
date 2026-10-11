/* CreateSkillModal — turn the accepted conventions into one skill. Name,
   description AND the markdown body are editable before saving; the body is
   prefilled by the server from accepted candidates only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, Skeleton, TextInput, Textarea } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionSkillDraft, useCreateSkillFromConventions } from "@/lib/hooks/conventions";

const NO_AGENT = "";

export function CreateSkillModal({
  repoId,
  onClose,
  onCreated,
}: {
  repoId: string;
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const { data: draft, isLoading } = useConventionSkillDraft(repoId, true);
  const { data: agents } = useAgents();
  const create = useCreateSkillFromConventions(repoId);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [agentId, setAgentId] = React.useState(NO_AGENT);

  // Prefill ONCE when the draft arrives — a background refetch must never clobber the user's edits.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (!draft || prefilled.current) return;
    prefilled.current = true;
    setName(draft.name);
    setDescription(draft.description);
    setBody(draft.body);
  }, [draft]);

  const submit = () =>
    create.mutate(
      { name: name.trim(), description: description.trim(), body, agent_id: agentId || undefined },
      { onSuccess: onCreated },
    );

  return (
    <Modal
      width={760}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: draft?.accepted ?? 0 })}
      onClose={onClose}
      footer={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            loading={create.isPending}
            disabled={!name.trim() || !body.trim() || isLoading}
            onClick={submit}
          >
            {t("modal.create")}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <Skeleton height={260} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FormField label={t("modal.name")} required>
            <TextInput value={name} onChange={setName} mono />
          </FormField>
          <FormField label={t("modal.description")} hint={t("modal.descriptionHint")}>
            <Textarea value={description} onChange={setDescription} rows={2} />
          </FormField>
          <FormField label={t("modal.body")} hint={t("modal.bodyHint")} required>
            <Textarea value={body} onChange={setBody} rows={12} mono />
          </FormField>
          <FormField label={t("modal.agent")} hint={t("modal.agentHint")}>
            <SelectInput
              value={agentId}
              onChange={setAgentId}
              options={[
                { value: NO_AGENT, label: t("modal.noAgent") },
                ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </FormField>
          {create.isError && (
            <div style={{ fontSize: 12.5, color: "var(--crit)" }}>
              {(create.error as Error)?.message ?? t("modal.failed")}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
