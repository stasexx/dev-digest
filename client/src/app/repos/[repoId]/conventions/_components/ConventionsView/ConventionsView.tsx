/* /repos/:repoId/conventions — Conventions Extractor. Run Scan / ReScan, review
   candidates (Accept / Reject / Edit), then build one skill from the accepted ones. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionScanResult } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useRepos } from "@/lib/hooks/core";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { CandidateCard } from "../CandidateCard";
import { CreateSkillModal } from "../CreateSkillModal";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);
  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<ConventionScanResult | null>(null);

  const list = candidates ?? [];
  const acceptedCount = list.filter((c) => c.status === "accepted").length;
  const hasCandidates = list.length > 0;
  const scan = () => extract.mutate(undefined, { onSuccess: setLastScan });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      {modalOpen && (
        <CreateSkillModal
          repoId={repoId}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            router.push("/skills");
          }}
        />
      )}
      <div style={{ padding: "24px 32px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>
              {t("page.headingPrefix")}
              <span className="mono">{repo?.full_name ?? t("page.repoFallback")}</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{t("page.subtitle")}</p>
          </div>
          {acceptedCount > 0 && (
            <Button kind="primary" icon="Sparkles" onClick={() => setModalOpen(true)}>
              {t("page.createSkill", { count: acceptedCount })}
            </Button>
          )}
          {/* Two distinct actions: the first scan vs. regenerating un-reviewed candidates. */}
          {hasCandidates ? (
            <Button icon="RefreshCw" loading={extract.isPending} onClick={scan}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          ) : (
            <Button kind="primary" icon="Search" loading={extract.isPending} onClick={scan}>
              {extract.isPending ? t("page.scanning") : t("page.runScan")}
            </Button>
          )}
        </div>

        {extract.isError && (
          <div role="alert" style={{ marginBottom: 16, fontSize: 13, color: "var(--crit)" }}>
            {t("page.extractionFailed")}: {(extract.error as Error)?.message}
          </div>
        )}
        {lastScan && !extract.isPending && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: "var(--text-muted)" }}>
            {t("page.scanSummary", {
              proposed: lastScan.proposed,
              unverified: lastScan.dropped_unverified,
              known: lastScan.dropped_known,
              files: lastScan.sampled_files.length,
              model: lastScan.model,
            })}
          </div>
        )}

        {isLoading ? (
          <Skeleton height={140} />
        ) : isError ? (
          <ErrorState title={t("page.loadError")} onRetry={() => refetch()} />
        ) : !hasCandidates ? (
          <EmptyState icon="Search" title={t("page.empty.title")} body={t("page.empty.body")} />
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
              {t("page.candidateCount", { count: list.length })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {list.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  repoFullName={repo?.full_name}
                  gitRef={repo?.default_branch}
                  pending={update.isPending}
                  onUpdate={(patch) => update.mutate({ id: c.id, patch })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
