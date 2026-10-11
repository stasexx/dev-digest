"use client";

import React from "react";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";

const MODAL_WIDTH = 640;

const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "rubric", label: "rubric" },
  { value: "convention", label: "convention" },
  { value: "security", label: "security" },
  { value: "custom", label: "custom" },
];

/** Create-skill modal — name / description / type / markdown body. */
export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && body.trim().length > 0 && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    create.mutate(
      { name: name.trim(), description: description.trim(), type, source: "manual", body },
      {
        onSuccess: (skill) => {
          onClose();
          onCreated?.(skill);
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title="Create skill"
      subtitle="A skill is a reusable block of review instructions that agents can link."
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canSubmit} loading={create.isPending}>
            {create.isPending ? "Creating…" : "Create skill"}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "20px 24px 4px" }}>
        <FormField label="Name" required>
          <TextInput value={name} onChange={setName} placeholder="e.g. API error handling" aria-label="Name" />
        </FormField>
        <FormField
          label="Description"
          hint={
            <>
              The description is the skill&rsquo;s interface — it is what decides when the skill gets applied.
              Write it as a directive, e.g. &ldquo;Use when reviewing HTTP handlers: check that every error
              path returns a typed error response.&rdquo;
            </>
          }
        >
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder="Use when … / Check that …"
            aria-label="Description"
          />
        </FormField>
        <FormField label="Type">
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={TYPE_OPTIONS} />
        </FormField>
        <FormField label="Body (Markdown)" required>
          <Textarea
            value={body}
            onChange={setBody}
            rows={10}
            mono
            placeholder={"# Skill title\n\n- Rule one\n- Rule two"}
          />
        </FormField>
        {error && <p style={{ color: "var(--error-text)", fontSize: 13, marginBottom: 16 }}>{error}</p>}
      </div>
    </Modal>
  );
}
