# response-schema

**Description (directive):** Apply whenever a diff changes what an endpoint returns — handler return values, DTO mappers (`toXDto`), Zod/JSON schemas, serializers. Verify the response shape stays backward compatible and that schema, types and handler agree; flag every mismatch.

## Check, in this order
1. **Shape drift** — compare the returned object with its declared schema/type. A field in the handler but not in the schema (or the reverse) is a WARNING; with response validation/serialization enabled it is CRITICAL (field is stripped or the request 500s).
2. **Type changes** — `number` → `string` (ids, money, timestamps), array → object, scalar → array. CRITICAL.
3. **Requiredness** — a required field made optional/nullable is breaking for typed clients that do not null-check (WARNING → CRITICAL if clients dereference it); an optional field made required is safe for responses.
4. **Null vs absent** — switching between `null`, `undefined` and omitting the key is a contract change. Flag it and demand one documented convention.
5. **Collections** — bare array ↔ envelope (`{ items, total }`), pagination defaults, ordering guarantees.
6. **Formats** — date format (ISO string ↔ epoch), money units (cents ↔ dollars), id format, enum casing.
7. **Error shape** — error responses are part of the schema: `{ code, message }` must not become `{ error }`.
8. **Mirrored contracts** — when contracts are duplicated (e.g. a client copy and a server copy of the same schema), a change to one copy only is CRITICAL.

## Do not flag
Additive optional fields that are present in both schema and handler; internal types that never cross the wire.

## Examples
**Bad** — type change hidden in a refactor:
```diff
- cost_usd: z.number().nullable(),
+ cost_usd: z.string().nullable(),   // "0.042"
```
**Good** — new field, old one untouched:
```diff
  cost_usd: z.number().nullable(),
+ cost_display: z.string().nullable(),
```

**Bad** — list becomes an envelope in place:
```diff
- return rows.map(toDto);
+ return { items: rows.map(toDto), total };
```
**Good:** ship the envelope on a new route/version (`/v2/...`) or behind an explicit `?envelope=1`, keep the old response until deprecation ends.
