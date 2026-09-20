import type {
  ConventionCandidate,
  ConventionScanResult,
  ConventionUpdateInput,
  ConventionsToSkillInput,
  Skill,
} from '@devdigest/shared';
import { ConventionExtraction } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { toSkillDto } from '../skills/helpers.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import { buildSkillBody, normalizeRule, toConventionDto, verifyEvidence } from './helpers.js';
import { readEvidenceFile, selectConventionSamples, type ConventionSample } from './samples.js';

/** Default name of the skill built from accepted conventions. */
export const REPO_CONVENTIONS_SKILL = 'repo-conventions';
const MAX_CANDIDATES = 25;

const SYSTEM_PROMPT = `You extract the de-facto coding conventions of a repository from sample files.

Rules:
- Report only conventions a code reviewer could enforce on a future diff (naming, file layout, imports, error handling, typing, async style, testing, API shape, config-enforced style). No generic best practices that the samples do not demonstrate.
- Each convention must be backed by ONE concrete line you can see in the samples. "evidence.file" is the exact path from a "### FILE:" header; "evidence.line" is the number printed before "|" on that line. Never invent paths or line numbers.
- "rule" is one directive sentence ("Use …", "Never …", "Name … as …").
- "category" is a short lowercase label such as naming, structure, imports, typing, error-handling, async, testing, api, style, tooling.
- "confidence" (0..1) reflects how consistently the samples follow the rule.
- Return at most ${MAX_CANDIDATES} candidates, most consistent first. Prefer project-specific rules over language defaults.`;

function buildUserPrompt(repoFullName: string, samples: ConventionSample[]): string {
  const files = samples
    .map((s) => `### FILE: ${s.path} (${s.kind})\n${s.numbered}`)
    .join('\n\n');
  return `Repository: ${repoFullName}\n\nSample files (line numbers precede "|"):\n\n${files}`;
}

/**
 * Conventions Extractor — samples (pure code) → cheap model → code-level evidence
 * check → persisted candidates the user accepts / rejects / edits → one skill.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    // Rejected candidates stay in the table (so a rescan can't resurrect them) but never reach the UI.
    return rows.filter((r) => r.status !== 'rejected').map(toConventionDto);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionScanResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('Repository is not cloned yet — refresh it first');

    // 1. Sample selection — code only, no model.
    const samples = await selectConventionSamples(this.container.repoIntel, repoId, repo.clonePath);
    if (samples.length === 0) {
      throw new ValidationError('No sample files found — index the repository first');
    }

    // 2. One cheap-model call; the model is picked in Settings → Models → Conventions.
    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: 'ConventionExtraction',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(repo.fullName, samples) },
      ],
      temperature: 0,
    });
    const proposed = result.data.candidates;

    // 3. Evidence check in code + dedup against what the user already reviewed.
    const existing = await this.repo.listForRepo(workspaceId, repoId);
    const known = new Set(
      existing.filter((r) => r.status !== 'pending').map((r) => normalizeRule(r.rule)),
    );
    const fileCache = new Map<string, string | null>();
    const fresh: InsertConvention[] = [];
    let droppedUnverified = 0;
    let droppedKnown = 0;
    for (const c of proposed) {
      const key = normalizeRule(c.rule);
      if (!key) continue;
      if (known.has(key)) {
        droppedKnown += 1;
        continue;
      }
      if (!fileCache.has(c.evidence.file)) {
        fileCache.set(c.evidence.file, await readEvidenceFile(repo.clonePath, c.evidence.file));
      }
      const content = fileCache.get(c.evidence.file);
      const check = content == null ? null : verifyEvidence(content, c.evidence.line);
      if (!check || !check.ok) {
        droppedUnverified += 1;
        continue;
      }
      known.add(key); // also dedups within this scan
      fresh.push({
        workspaceId,
        repoId,
        category: c.category.trim().toLowerCase() || 'general',
        rule: c.rule.trim(),
        evidencePath: c.evidence.file.replace(/^\.?\//, ''),
        evidenceLine: check.line,
        evidenceSnippet: check.snippet,
        confidence: c.confidence,
      });
    }

    await this.repo.replacePending(workspaceId, repoId, fresh);
    return {
      candidates: await this.list(workspaceId, repoId),
      sampled_files: samples.map((s) => s.path),
      proposed: proposed.length,
      dropped_unverified: droppedUnverified,
      dropped_known: droppedKnown,
      model: `${choice.provider}/${choice.model}`,
    };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdateInput,
  ): Promise<ConventionCandidate> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionDto(row);
  }

  /**
   * Accepted candidates → one skill (default `repo-conventions`). Re-running updates
   * the same skill (new version) instead of piling up duplicates. Only accepted
   * candidates feed the generated body; rejected ones can never leak in.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: ConventionsToSkillInput,
  ): Promise<Skill> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = (await this.repo.listForRepo(workspaceId, repoId))
      .filter((r) => r.status === 'accepted')
      .map(toConventionDto);
    if (accepted.length === 0) throw new ValidationError('Accept at least one convention first');

    const name = input.name.trim() || REPO_CONVENTIONS_SKILL;
    const body = input.body?.trim() ? input.body : buildSkillBody(repo.fullName, accepted);
    const description =
      input.description?.trim() ||
      `Apply when reviewing ${repo.fullName}: enforce the ${accepted.length} house conventions extracted from the codebase.`;
    const evidenceFiles = [...new Set(accepted.map((c) => c.evidence_path).filter(Boolean))];

    const skillsRepo = this.container.skillsRepo;
    const existing = (await skillsRepo.list(workspaceId)).find((s) => s.name === name);
    const skill = existing
      ? await skillsRepo.update(workspaceId, existing.id, {
          description,
          body,
          evidenceFiles,
          message: `Rebuilt from ${accepted.length} accepted conventions`,
        })
      : await skillsRepo.insert({
          workspaceId,
          name,
          description,
          type: 'convention',
          source: 'extracted',
          body,
          enabled: true,
          evidenceFiles,
        });
    if (!skill) throw new NotFoundError('Skill not found');

    if (input.agent_id) {
      const agentsRepo = this.container.agentsRepo;
      const agent = await agentsRepo.getById(workspaceId, input.agent_id);
      if (!agent) throw new NotFoundError('Agent not found');
      const linked = await agentsRepo.skillIdsForAgent(agent.id);
      // Append — never disturb the order of skills already on the agent.
      if (!linked.includes(skill.id)) await agentsRepo.linkSkill(agent.id, skill.id, linked.length);
    }
    return toSkillDto(skill);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }
}
