import type { SmartDiffRole } from '@devdigest/shared';
import { ROLE_RULES } from './constants.js';

/**
 * Classify a PR file path into a Smart Diff role.
 *
 * Pure and HTTP-free: it imports only the role type and the rule constants, so
 * it can be reused outside the route (L08 uses it as a pre-prompt filter).
 * The first rule set in `ROLE_RULES` that matches wins; `core` is the fallback.
 */
export function classifyFile(path: string): SmartDiffRole {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const { role, rules } of ROLE_RULES) {
    if (rules.some((r) => r.re.test(p))) return role;
  }
  return 'core';
}
