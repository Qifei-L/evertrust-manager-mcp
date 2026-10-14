# Native record links and corrections

`resolve_record_links` batches up to ten explicit `resource` plus `key` or
`reference` lookups in the selected company. A complete unique reference scan
returns a native form key and hash; duplicate/incomplete scans do not. This is
lookup evidence, not an inferred relationship to a GL row. It never guesses a
resource from transaction descriptions. Missing upstream GL identifiers remain
missing.

Raw `get_transactions` optionally accepts `resolve_account_candidates:true`.
Candidates come from exact names or exact `code - name` labels in a complete
same-company chart. Native identity fields remain unchanged. Duplicate chart
labels produce ambiguity, not a selected ID. The opt-in option cannot be used
with aggregated GL results.

## Corrections with a durable checkpoint

1. Read each original native form and hash. Confirm the requested company and
   authorized changes. Search before creating missing records separately.
2. `prepare_record_changes` accepts 1..20 `update`/`delete` operations. It stores
   encrypted before/after snapshots, an immutable `preview_hash`, and a 24-hour
   expiry. It performs no Manager writes. Duplicate targets are rejected.
3. Inspect the preview. `apply_record_changes` requires the exact task ID and
   hash. It claims the saved task using ETag compare-and-swap, verifies the live
   company/token and all original hashes before any mutation, then checkpoints
   before each dispatch and verifies the native result.
4. A rejected, interrupted, discarded or unverified write stops the batch. No
   later mutation is dispatched. An uncertain result is never automatically
   retried, undone or deleted/recreated. A saved dispatch marker survives a
   process crash; a repeated call reads/refuses the existing task rather than
   replaying it. Read `get_record_change_task` and inspect Manager before
   preparing only the remaining changes as a new task.

This is not a Manager transaction. Successful earlier records remain changed
if a later operation fails. Deletes are hard deletes and must be specifically
authorized. User authorization and accounting judgment remain with the Skill.
The task hash binds exact content; it does not itself authorize a mutation.

Optional `ledger_check` uses the complete generic GL aggregation:

```json
{
  "group_by": ["account"],
  "sum_fields": ["amount"],
  "expect_unchanged": true,
  "absolute_tolerance": 0.00000001
}
```

The check refuses an incomplete baseline or changed totals at preflight.
After all writes, it reports differences in the requested dimensions/sums.
`completed_review_required` means native writes verified but the final ledger
check failed or did not match. Repeating apply will not replay those writes.
Do not interpret generic sums as closing balances, inventory valuation or
invoice allocation. Use native account/currency/party evidence to choose
dimensions. The existing GL reducer cannot detect concurrent edits preserving
the same totals. Per-record before/after forms and hashes remain the storage
verification evidence.

No create/import operations, background queue or automatic resume is added.
The executor stops between records after its execution time bound. A timeout
or crash can leave a claimed task requiring manual inspection.

## Client errors

MCP `tools/call` may return HTTP 200 for a failure. Check JSON-RPC `error`,
`result.isError` and the structured operation status. `rejected`, `uncertain`,
`unverified`, `verification_failed` and stopped/review-required batches set the
MCP error flag. A completed-task read is successful and has no side effects.

Validation errors expose `argument_details` with tool, required/allowed names,
missing/unknown arguments and known typo suggestions, without argument values.
For example, `get_coa_item` expects `item_key`; passing `key` returns both the
missing required name and the suggestion to use `item_key`. This does not
silently rewrite arguments. `get_tool_contract` remains the source for exact
deployed schemas.

Tests use isolated simulated companies only. No real client books are changed
to test batch writes.
