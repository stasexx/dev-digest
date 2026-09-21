# deprecation-policy

**Description (directive):** Apply when a diff removes, renames or replaces anything public (route, field, parameter, export, event). Require a deprecation path instead of silent removal, and flag removals that skipped it.

## The policy to enforce
1. **Announce, don't delete.** The old element keeps working and is marked deprecated in the same change that introduces its replacement.
2. **Mark it where consumers look:**
   - code: `/** @deprecated use X — removed in vN / after YYYY-MM-DD */`
   - HTTP: `Deprecation: true` and `Sunset: <date>` response headers, plus `Link: <…>; rel="successor-version"`
   - schema/OpenAPI: `deprecated: true`
   - CHANGELOG: a "Deprecated" section naming the replacement.
3. **Give a window.** At least one MINOR release (or a stated date) between deprecation and removal. Removal happens only in a MAJOR.
4. **Make usage visible.** Log/metric once per caller when the deprecated path is hit, so removal is data-driven. No PII in that log.
5. **Removal PR must prove the window passed** — link the deprecating release/PR and state that usage is zero or consumers were migrated.

## Severity
- Public element removed/renamed with no prior deprecation → CRITICAL.
- Deprecated but no replacement named, or no removal version/date → WARNING.
- Deprecated element changed in behaviour during its window → CRITICAL (deprecated ≠ free to break).
- Internal-only symbol removed → do not flag.

## Examples
**Bad** — silent removal:
```diff
- app.get('/pulls/:id/reviews', handler);
```
**Good** — alias kept, clearly sunset:
```diff
+ app.get('/pulls/:id/review-runs', handler);
+ /** @deprecated use GET /pulls/:id/review-runs — removed in v3 (after 2026-12-01) */
  app.get('/pulls/:id/reviews', async (req, reply) => {
+   reply.header('Deprecation', 'true').header('Sunset', 'Tue, 01 Dec 2026 00:00:00 GMT');
+   req.log.warn({ route: '/pulls/:id/reviews' }, 'deprecated route hit');
    return handler(req, reply);
  });
```

**Bad** — field renamed in place. **Good** — return both for one release cycle, mark the old one `@deprecated`, document in CHANGELOG "Deprecated".
