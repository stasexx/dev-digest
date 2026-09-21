import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RepoIntel } from '../repo-intel/types.js';
import { isStyleConfigFile, numberLines, safeRelativePath } from './helpers.js';

/**
 * Sample selection for the conventions scan — PURE CODE, no model:
 * style configs by file name (repo root + one level of package folders) plus
 * the top-N source files by repo-intel rank.
 */

export const TOP_FILES = 12;
const MAX_CONFIG_FILES = 8;
const MAX_LINES_PER_FILE = 160;
const MAX_CHARS_PER_FILE = 9_000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

export interface ConventionSample {
  path: string;
  kind: 'config' | 'source';
  /** Line-numbered, truncated content as sent to the model. */
  numbered: string;
}

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

async function findConfigFiles(clonePath: string): Promise<string[]> {
  const found: string[] = [];
  const root = await readdir(clonePath, { withFileTypes: true }).catch(() => []);
  for (const e of root) if (e.isFile() && isStyleConfigFile(e.name)) found.push(e.name);
  // One level down covers multi-package repos (client/, server/, packages/*).
  for (const dir of root) {
    if (!dir.isDirectory() || SKIP_DIRS.has(dir.name) || dir.name.startsWith('.')) continue;
    const inner = await readdir(join(clonePath, dir.name), { withFileTypes: true }).catch(() => []);
    for (const e of inner) if (e.isFile() && isStyleConfigFile(e.name)) found.push(`${dir.name}/${e.name}`);
  }
  return found.sort().slice(0, MAX_CONFIG_FILES);
}

export async function selectConventionSamples(
  repoIntel: RepoIntel,
  repoId: string,
  clonePath: string,
): Promise<ConventionSample[]> {
  const configs = await findConfigFiles(clonePath);
  const ranked = await repoIntel.getConventionSamples(repoId, TOP_FILES);
  const samples: ConventionSample[] = [];
  const seen = new Set<string>();
  const add = async (raw: string, kind: ConventionSample['kind']) => {
    const path = safeRelativePath(raw);
    if (!path || seen.has(path)) return;
    const content = await readClone(clonePath, path);
    if (content == null || !content.trim()) return;
    seen.add(path);
    samples.push({
      path,
      kind,
      numbered: numberLines(content.slice(0, MAX_CHARS_PER_FILE), MAX_LINES_PER_FILE),
    });
  };
  for (const f of configs) await add(f, 'config');
  for (const f of ranked) await add(f, 'source');
  return samples;
}

/** Read a clone file for evidence verification (null when missing / outside the clone). */
export async function readEvidenceFile(clonePath: string, file: string): Promise<string | null> {
  const path = safeRelativePath(file);
  return path ? readClone(clonePath, path) : null;
}
