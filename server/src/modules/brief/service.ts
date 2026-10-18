import {
  BlastRadius,
  BriefModelOutput,
  PrBriefRecord,
  type PrBriefResponse,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import type { PullRow } from '../../db/rows.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { Logger } from '../reviews/run-executor.js';
import {
  BRIEF_FEATURE_ID,
  BRIEF_INPUT_BUDGET_TOKENS,
  BRIEF_MAX_OUTPUT_TOKENS,
  BRIEF_MAX_RETRIES,
  BRIEF_MAX_SNAPSHOT_RETRIES,
  BRIEF_SCHEMA_NAME,
} from './constants.js';
import { buildAllowedSet, groundBriefOutput } from './grounding.js';
import { isGenerating, releaseGeneration, tryAcquireGeneration } from './in-flight.js';
import { filesFingerprint, gatherBriefFacts } from './inputs.js';
import { assembleBriefPrompt, buildInputsRecord, deriveMissingInputs } from './prompt.js';
import { BriefRepository } from './repository.js';
import type { AssembledPrompt, BriefFacts } from './types.js';

/**
 * brief module - application layer.
 *
 * get():      stored brief + staleness. Reads the DB only: no model, GitHub or git.
 * generate(): consistent snapshot -> prompt assembly -> exactly ONE structured
 *             model call -> grounding -> SHA-bound upsert into `pr_brief`.
 */

type OkPrompt = Extract<AssembledPrompt, { ok: true }>;
type ErrorCategory = 'provider_error' | 'invalid_output' | 'timeout';

const noopLogger: Logger = { info() {}, warn() {}, error() {}, debug() {} };

function categorize(err: unknown): ErrorCategory {
  if (err instanceof TimeoutError) return 'timeout';
  if (err instanceof ExternalServiceError && /schema validation/i.test(err.message)) {
    return 'invalid_output';
  }
  return 'provider_error';
}

export class BriefService {
  constructor(
    private container: Container,
    private logger: Logger = noopLogger,
    private repo: BriefRepository = new BriefRepository(container.db),
  ) {}

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    let brief: PrBriefRecord | null = null;
    const stored = await this.repo.getJson(prId);
    if (stored !== null) {
      const parsed = PrBriefRecord.safeParse(stored);
      if (parsed.success) brief = parsed.data;
      else {
        this.logger.warn(
          { prId, issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
          'brief: cached record invalid; serving none',
        );
      }
    }
    return {
      brief,
      stale: !!brief && brief.head_sha !== pull.headSha,
      current_head_sha: pull.headSha,
      generating: isGenerating(prId),
    };
  }

  async generate(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) {
      this.logger.info({ prId, code: 'not_found' }, 'brief: refused');
      throw new NotFoundError('Pull request not found');
    }
    if (!tryAcquireGeneration(prId)) {
      this.logger.info({ prId, code: 'brief_generation_in_progress' }, 'brief: refused');
      throw new AppError(
        'brief_generation_in_progress',
        'A brief is already being generated for this pull request.',
        409,
      );
    }
    try {
      await this.runGeneration(workspaceId, prId);
    } finally {
      // Released BEFORE the response is built so `generating` is false for this PR.
      releaseGeneration(prId);
    }
    return this.get(workspaceId, prId);
  }

  private refuse(prId: string, code: string, err: AppError): never {
    this.logger.info({ prId, code }, 'brief: refused');
    throw err;
  }

  private async runGeneration(workspaceId: string, prId: string): Promise<PrBriefRecord> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, BRIEF_FEATURE_ID);

    let llm;
    try {
      llm = await this.container.llm(provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        this.refuse(
          prId,
          'brief_model_not_configured',
          new AppError(
            'brief_model_not_configured',
            `Risk Brief model provider '${provider}' is not configured. Add its API key or pick another model for Risk Brief in Settings.`,
            400,
            { setting: BRIEF_FEATURE_ID, provider },
          ),
        );
      }
      throw err;
    }

    // ---- consistent snapshot: up to 1 + retries assembly passes, no model call ----
    const assemblyStart = Date.now();
    let facts!: BriefFacts;
    let assembled!: AssembledPrompt;
    let snapshotRetries = 0;
    for (let pass = 0; pass <= BRIEF_MAX_SNAPSHOT_RETRIES; pass++) {
      const pull: PullRow | undefined = await this.container.reviewRepo.getPull(workspaceId, prId);
      if (!pull) throw new NotFoundError('Pull request not found');
      const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
      if (!repoRow) throw new NotFoundError('Repository not found');

      facts = await gatherBriefFacts(this.container, this.logger, { workspaceId, pull, repo: repoRow });
      assembled = assembleBriefPrompt(facts);

      const pull2 = await this.container.reviewRepo.getPull(workspaceId, prId);
      const fp2 = filesFingerprint(await this.container.reviewRepo.getPrFiles(prId));
      if (pull2?.headSha === facts.snapshot.headSha && fp2 === facts.snapshot.filesFingerprint) break;
      if (pass < BRIEF_MAX_SNAPSHOT_RETRIES) {
        snapshotRetries++;
        this.logger.info({ prId }, 'brief: snapshot changed during assembly; reassembling');
      }
    }
    const assemblyMs = Date.now() - assemblyStart;

    if (!assembled.ok) {
      this.refuse(
        prId,
        'brief_input_over_budget',
        new AppError(
          'brief_input_over_budget',
          'The pull request title and fixed context alone exceed the Risk Brief input budget.',
          422,
        ),
      );
    }
    const prompt: OkPrompt = assembled;
    this.logger.debug({ prId, messages: prompt.messages }, 'brief: prompt');

    // ---- exactly one structured invocation ----------------------------------
    const base = {
      prId,
      headSha: facts.snapshot.headSha,
      provider,
      model,
      inputTokensEstimate: prompt.inputTokensEstimate,
      inputBudgetTokens: BRIEF_INPUT_BUDGET_TOKENS,
      truncatedSections: prompt.truncatedSections,
      removedSections: prompt.removedSections,
      specs: {
        read: prompt.specs.read.length,
        missing: facts.specs.missingPaths.length,
        truncated: prompt.specs.truncated.length,
        omitted: prompt.specs.omitted.length,
      },
      maxRetries: BRIEF_MAX_RETRIES,
    };
    const started = Date.now();
    let result;
    try {
      result = await llm.completeStructured({
        model,
        schema: BriefModelOutput,
        schemaName: BRIEF_SCHEMA_NAME,
        messages: prompt.messages,
        maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
        maxRetries: BRIEF_MAX_RETRIES,
      });
    } catch (err) {
      // Message only: never details.raw / model output.
      this.logger.info(
        {
          ...base,
          outcome: 'error',
          errorCategory: categorize(err),
          err: err instanceof Error ? err.message : String(err),
          attempts: null,
          tokensIn: null,
          tokensOut: null,
          costUsd: null,
          durationMs: Date.now() - started,
        },
        'brief: model call',
      );
      throw new AppError('brief_model_failed', 'The Risk Brief model call failed or returned invalid output.', 502);
    }
    const durationMs = Date.now() - started;
    this.logger.info(
      {
        ...base,
        outcome: 'ok',
        attempts: result.attempts,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        durationMs,
      },
      'brief: model call',
    );

    // ---- ground, compose, persist -------------------------------------------
    const blastData = facts.blast.status === 'missing' ? null : facts.blast.data;
    const allowed = buildAllowedSet(
      facts.files.map((f) => f.path),
      blastData,
    );
    const grounded = groundBriefOutput(result.data, allowed);

    const record = PrBriefRecord.parse({
      summary: result.data.summary,
      intent: facts.intent,
      blast: blastData ? BlastRadius.parse(blastData) : null,
      risks: { risks: grounded.risks },
      review_focus: grounded.reviewFocus,
      pr_id: prId,
      head_sha: facts.snapshot.headSha,
      generated_at: new Date().toISOString(),
      model: { provider, model },
      missing_inputs: deriveMissingInputs(facts),
      inputs: buildInputsRecord(facts, prompt),
      generation: {
        input_tokens_estimate: prompt.inputTokensEstimate,
        input_budget_tokens: BRIEF_INPUT_BUDGET_TOKENS,
        truncated_sections: prompt.truncatedSections,
        removed_sections: prompt.removedSections,
        attempts: Math.max(1, result.attempts),
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd,
        duration_ms: durationMs,
        dropped: grounded.dropped,
      },
    });
    await this.repo.upsert(prId, record);

    this.logger.info(
      {
        prId,
        dropped: grounded.dropped,
        missingInputs: record.missing_inputs.map((m) => m.input),
        specs: base.specs,
        risks: record.risks.risks.length,
        reviewFocus: record.review_focus.length,
        assemblyMs,
        snapshotRetries,
      },
      'brief: generated',
    );
    return record;
  }
}
