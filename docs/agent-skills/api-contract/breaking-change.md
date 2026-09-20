# breaking-change

**Description (directive):** Apply to every diff that touches a route, handler, exported function, DTO/schema or event payload. Flag any change that makes an existing, correctly-written client fail or silently misbehave — as CRITICAL — and name the consumer that breaks.

## What counts as the public contract
HTTP method + path + path/query params, request body schema, response body schema, status codes, headers, auth requirements, error shape, exported package symbols, CLI flags, webhook/event payloads, DB columns read by other services.

## Flag as breaking (severity CRITICAL)
- Route removed, renamed, or its method changed (`GET /users/:id` → `GET /user/:id`).
- Path/query/body parameter removed, renamed, or made required; a type narrowed (`string | number` → `number`).
- Response field removed or renamed; type changed; nullable ↔ non-nullable flipped; enum value removed.
- Status code changed for an existing outcome (`200` → `204`, `404` → `400`).
- Default value or default sort/pagination changed.
- New required auth scope / header on an existing endpoint.
- Exported function signature changed (parameter order, required arg added, return type changed).

## Not breaking (do not flag)
- New optional request field; new response field (additive); new endpoint; new enum value **only if** clients are documented to ignore unknown values.
- Internal/private symbols, tests, comments.

## How to report
One finding per broken contract element. Title: `Breaking: <what changed>`. Rationale must state (1) the old contract, (2) the new contract, (3) which caller breaks and how. Suggestion: the non-breaking alternative (add-and-deprecate, new version, alias).

## Examples
**Bad** — silent rename of a response field:
```diff
- return { id: user.id, full_name: user.fullName };
+ return { id: user.id, name: user.fullName };
```
Every client reading `full_name` now gets `undefined`.

**Good** — additive, old field kept and deprecated:
```diff
  return {
    id: user.id,
+   name: user.fullName,
+   /** @deprecated use `name`; removed in v3 */
    full_name: user.fullName,
  };
```

**Bad** — new required param on an existing route:
```diff
- app.get('/repos/:id/pulls', { schema: { params: IdParams } }, …)
+ app.get('/repos/:id/pulls', { schema: { params: IdParams, querystring: z.object({ status: PrStatus }) } }, …)
```
**Good:** `status: PrStatus.optional().default('open')` — existing calls keep working.
