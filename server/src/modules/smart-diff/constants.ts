import type { SmartDiffRole } from '@devdigest/shared';

/** Display order of the role groups (matches the `SmartDiffRole` enum order). */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export interface RoleRule {
  /** Glob this regex implements (documentation only; matching uses `re`). */
  glob: string;
  re: RegExp;
}

export interface RoleRuleSet {
  role: Exclude<SmartDiffRole, 'core'>;
  rules: RoleRule[];
}

/**
 * Classification rules in PRECEDENCE order: the first rule set that matches wins.
 * Anything that matches nothing is `core`. Paths are normalised to forward
 * slashes without a leading `./` before matching.
 */
export const ROLE_RULES: readonly RoleRuleSet[] = [
  {
    role: 'boilerplate',
    rules: [
      { glob: '*.lock', re: /(^|\/)[^/]+\.lock$/ },
      { glob: 'pnpm-lock.yaml', re: /(^|\/)pnpm-lock\.yaml$/ },
      { glob: 'package-lock.json', re: /(^|\/)package-lock\.json$/ },
      { glob: 'dist/** (repo root)', re: /^dist\// },
      { glob: 'build/** (repo root)', re: /^build\// },
      { glob: '**/__snapshots__/**', re: /(^|\/)__snapshots__\// },
      { glob: '*.snap', re: /\.snap$/ },
      { glob: '*.generated.*', re: /(^|\/)[^/]+\.generated\.[^/]+$/ },
      { glob: '*.min.js', re: /\.min\.js$/ },
    ],
  },
  {
    role: 'tests',
    rules: [
      { glob: '**/*.test.ts(x) (incl. *.it.test.ts)', re: /\.test\.tsx?$/ },
      { glob: '**/*.spec.ts(x)', re: /\.spec\.tsx?$/ },
      { glob: '**/test/**', re: /(^|\/)test\// },
      { glob: '**/tests/**', re: /(^|\/)tests\// },
      { glob: '**/__tests__/**', re: /(^|\/)__tests__\// },
      { glob: 'e2e/** (repo root)', re: /^e2e\// },
    ],
  },
  {
    role: 'wiring',
    rules: [
      { glob: 'index.ts / index.js (barrels)', re: /(^|\/)index\.[jt]s$/ },
      { glob: '*.config.*', re: /(^|\/)[^/]+\.config\.[^/]+$/ },
      { glob: 'tsconfig*.json', re: /(^|\/)tsconfig[^/]*\.json$/ },
      { glob: '.eslintrc*', re: /(^|\/)\.eslintrc[^/]*$/ },
      { glob: '.env*', re: /(^|\/)\.env[^/]*$/ },
      { glob: 'docker-compose*.yml', re: /(^|\/)docker-compose[^/]*\.ya?ml$/ },
      { glob: '.github/**', re: /^\.github\// },
      { glob: '**/.claude/**', re: /(^|\/)\.claude\// },
      { glob: 'package.json', re: /(^|\/)package\.json$/ },
    ],
  },
  {
    role: 'docs',
    rules: [
      { glob: '**/*.md(x)', re: /\.mdx?$/ },
      { glob: 'docs/**', re: /^docs\// },
      { glob: 'README*', re: /(^|\/)README[^/]*$/ },
      { glob: 'CHANGELOG*', re: /(^|\/)CHANGELOG[^/]*$/ },
      { glob: 'LICENSE*', re: /(^|\/)LICENSE[^/]*$/ },
    ],
  },
];
