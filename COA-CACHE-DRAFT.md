# Unpublished COA scope and structure-cache changes

This is a separate local commit following the unpublished reporting/Business Details draft. No source has been pushed and no version/deployment has been created. Integrate into the other channel's latest source and rerun checks before publishing.

## Behavior

- Skill chooses checks by operation: target/native duplicate index for name/code; destination and active ancestors for creation/moves; related siblings for Position; full available tree only for large reorganizations/reviews.
- Canonical `prepare_coa_changes` reuses one current chart read and request-local form resolutions. Name/code-only previews do not fetch unrelated native account settings or parent paths; `validation_scope` states what was checked. Existing compatibility edit transport follows the same scope.
- `get_coa_item(include_path:false)` reads current native settings without ancestry. Its default behavior remains unchanged.
- `get_coa_structure` builds an encrypted immutable snapshot of accounts, discovered groups and active relationships with concurrency limited to four. Subsequent pages use that snapshot rather than native APIs. Page size limits remain unchanged.
- Cache scope is caller + stable connection ID, with company-name/token-hash checks. Native route metadata is separately isolated by token hash. Snapshots expire after five minutes. `refresh:true` starts a new snapshot and invalidates old cursors.
- Writes invalidate snapshots before PUT, including uncertain outcomes. Current native item hashes, duplicate checks, parent dependencies, execution leases and write/read-back verification remain in place. Cached data never authorizes a write or replaces a current precondition.
- A changed chart or invalidated generation during snapshot construction rejects the build. A slow prior build cannot overwrite a later refresh. Expired snapshot files are pruned on a subsequent build.

## Validation

The eight-node mock measured 22 native requests for the first cold build and **zero native requests across all three subsequent pages**. A simple canonical rename read one target form and one complete chart index. Account creation read only its required group ancestry and creation endpoint. These are request-count results, not measured production latency.

Coverage includes fixed snapshot contents after external edits; force refresh; expiry; caller/connection/token isolation; write invalidation; concurrent refresh/build fencing; duplicate names/codes; external duplicate races; stale-record conflicts; cycle rejection; and the existing COA/business/connector/history/report/party regression suites.

Manager may omit unused/unattached groups from available inventory. That remains explicit and is not fabricated from cache. Cold group membership/inventory checks can still require native discovery where no current evidence exists. Read-only cached structure can lag external Manager edits until refresh/expiry; a native multi-request traversal is not an atomic Manager transaction.

Files: `worker/index.js`, `skills/evertrust-books-accounting/SKILL.md`, regenerated `worker/accounting-skill.js`, `scripts/test-coa-cache.mjs`, and the adjusted operation-scope expectation in `scripts/test-coa.mjs`.
