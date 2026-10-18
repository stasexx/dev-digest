import { describe, expect, it } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classifier.js';
import { ROLE_ORDER } from './constants.js';

type Row = [path: string, role: SmartDiffRole, note: string];

/**
 * Path -> role table. Rule precedence is boilerplate > tests > wiring > docs,
 * with `core` as the fallback; the first matching rule wins.
 */
const TABLE: Row[] = [
  // ---- boilerplate ----
  ['pnpm-lock.yaml', 'boilerplate', 'lock'],
  ['client/pnpm-lock.yaml', 'boilerplate', 'nested lock (basename match)'],
  ['package-lock.json', 'boilerplate', 'lock'],
  ['yarn.lock', 'boilerplate', 'lock'],
  ['Cargo.lock', 'boilerplate', '*.lock'],
  ['dist/bundle.js', 'boilerplate', 'root dist/**'],
  ['build/output.css', 'boilerplate', 'root build/**'],
  ['src/components/__snapshots__/View.test.tsx.snap', 'boilerplate', 'snapshot'],
  // TRICKY 1: a snapshot inside __tests__ is boilerplate, because the snapshot
  // rule is checked before the tests rule (first match wins).
  ['__tests__/__snapshots__/x.snap', 'boilerplate', 'TRICKY 1: snapshot rule above tests rule'],
  ['server/src/__tests__/__snapshots__/x.snap', 'boilerplate', 'TRICKY 1, nested'],
  ['src/api.generated.ts', 'boilerplate', '*.generated.*'],
  ['public/vendor/jquery.min.js', 'boilerplate', '*.min.js'],
  // ---- tests ----
  ['server/src/modules/smart-diff/classifier.test.ts', 'tests', '*.test.ts'],
  ['client/src/components/X/X.test.tsx', 'tests', '*.test.tsx'],
  ['server/test/reviews.it.test.ts', 'tests', '*.it.test.ts'],
  ['src/foo.spec.ts', 'tests', '*.spec.ts'],
  ['src/foo.spec.tsx', 'tests', '*.spec.tsx (extension)'],
  ['server/test/helpers/pg.ts', 'tests', '**/test/**'],
  ['src/__tests__/util.ts', 'tests', '**/__tests__/**'],
  ['e2e/specs/05-pr-diff.flow.json', 'tests', 'root e2e/**'],
  // TRICKY 3: decision - e2e docs describe the flows and are reviewed with them,
  // so e2e/README.md is `tests` (e2e/** sits above the docs rule).
  ['e2e/README.md', 'tests', 'TRICKY 3: e2e docs travel with their flows'],
  // ---- wiring ----
  ['server/src/modules/index.ts', 'wiring', 'barrel'],
  ['client/src/components/diff-viewer/index.ts', 'wiring', 'barrel'],
  ['server/vitest.config.ts', 'wiring', '*.config.*'],
  ['client/next.config.mjs', 'wiring', '*.config.*'],
  ['client/tsconfig.json', 'wiring', 'tsconfig*.json'],
  ['.eslintrc.cjs', 'wiring', '.eslintrc*'],
  ['.env.example', 'wiring', '.env*'],
  ['docker-compose.yml', 'wiring', 'docker-compose*.yml'],
  ['.github/workflows/ci.yml', 'wiring', '.github/**'],
  // TRICKY 2: markdown under .claude/ drives agent behaviour, so the
  // .claude/** wiring rule is checked above the docs rule.
  ['.claude/skills/security/SKILL.md', 'wiring', 'TRICKY 2: .claude/** above docs'],
  ['package.json', 'wiring', 'D4: dependency manifest needs a real look'],
  ['server/package.json', 'wiring', 'D4: dependency manifest'],
  // ---- docs ----
  ['README.md', 'docs', 'README'],
  ['docs/plans/smart-diff.md', 'docs', 'docs/**'],
  ['server/docs/api-contracts.md', 'docs', '**/*.md'],
  ['CHANGELOG.md', 'docs', 'CHANGELOG'],
  ['LICENSE', 'docs', 'LICENSE'],
  // ---- core (fallback) ----
  ['server/src/modules/smart-diff/classifier.ts', 'core', 'fallback'],
  ['src/config.ts', 'core', 'D4: no ".config." segment'],
  ['src/build/plan.ts', 'core', 'D4: build/** is root-anchored'],
  ['src/index.tsx', 'core', 'D4: barrel = index.ts / index.js only'],
  ['./server/src/app.ts', 'core', 'leading ./ normalised'],
];

describe('classifyFile (path -> role)', () => {
  it.each(TABLE)('%s -> %s (%s)', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('normalises backslashes', () => {
    expect(classifyFile('server\\test\\x.ts')).toBe('tests');
  });

  it('first match wins: a path matching boilerplate and tests is boilerplate', () => {
    expect(classifyFile('src/__tests__/a.generated.ts')).toBe('boilerplate');
    expect(classifyFile('test/yarn.lock')).toBe('boilerplate');
  });
});

describe('ROLE_ORDER', () => {
  it('equals the contract enum order (cannot drift)', () => {
    expect([...ROLE_ORDER]).toEqual(SmartDiffRole.options);
  });
});
