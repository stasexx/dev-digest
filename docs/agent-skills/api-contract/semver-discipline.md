# semver-discipline

**Description (directive):** Apply when a diff changes a public contract OR a version field (`package.json` version, API version prefix, OpenAPI `info.version`, CHANGELOG). Decide which SemVer bump the change requires and flag any PR whose declared bump is smaller than required.

## Decision table
| Change | Required bump |
|---|---|
| Removed/renamed route, field, export; narrowed type; new required input; changed status code, default or error shape | **MAJOR** |
| Dropped support for a runtime/DB/major dependency version that consumers must match | **MAJOR** |
| New endpoint, new optional input, new response field, new export, new enum value (tolerant clients) | **MINOR** |
| Deprecation announced (nothing removed yet) | **MINOR** |
| Bug fix that restores documented behaviour, perf, docs, internal refactor | **PATCH** |
| Bug fix that clients may depend on ("fixing" a long-standing wrong-but-stable output) | treat as **MAJOR** or gate behind a flag |

## Rules
- A breaking change with no MAJOR bump (or no `/vN` route) is CRITICAL. Say which line is breaking and which bump is missing.
- `0.x` is not a loophole inside a product with real consumers: breaking → bump MINOR at least and call it out in the CHANGELOG.
- A MAJOR bump must come with a CHANGELOG/migration note listing each breaking change and its replacement. Missing note → WARNING.
- Version bumped but nothing public changed → SUGGESTION (noise in release history).
- Never recommend "just bump major" as the first option — prefer the additive, non-breaking design and mention the bump as the fallback.

## Examples
**Bad** — breaking change shipped as a patch:
```diff
- "version": "2.4.1",
+ "version": "2.4.2",
```
together with `- full_name` / `+ name` in a response DTO → must be `3.0.0`, or keep `full_name`.

**Good** — additive change, minor bump, changelog entry:
```diff
- "version": "2.4.1",
+ "version": "2.5.0",
```
```md
## 2.5.0
### Added
- `GET /repos/:id/pulls` responses include `findings` (optional).
```
