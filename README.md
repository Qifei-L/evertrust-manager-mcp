# Evertrust Books

## Prepared release: 0.21.2 (source only)

This maintenance update bounds normalized GL replies to 60,000 characters by default (configurable 12,000–120,000). Oversized raw rows or groups are withheld with `result_complete:false`, explicit budget diagnostics and executable next-request arguments. Raw reads also suggest a complete account aggregation. Native read completeness remains separate from result delivery. Grouping examples appear first in the GL tool description and quick tool selection appears first in the canonical embedded Skill.

COA structure pages now support 100 items, default 50, using the existing isolated snapshot and cursor. System-account 404s and incomplete unused-group inventories remain explicit limitations; no default hierarchy is fabricated. Connection lists identify same-name connection IDs and include an unambiguous selection label. Business Details automatically uses the documented singleton key for keyed GETs; native 404 returns chart-verified display identity and `native_record_not_found` instead of an unhelpful argument error. Registered name, tax ID and base currency remain unverified until an actual native form can be read. Permission failures remain errors. Writes still require an evidenced native key/hash and are unchanged.

GL currency evidence reports missing native money currencies, retains native money objects and refuses sums across multiple evidenced currencies. It does not invent KHR/USD, convert amounts or reconstruct document currency from descriptions. Existing account-candidate and reference-lookup tools are surfaced in the quick workflow; references remain lookup evidence rather than proven GL source identity. This update does not recover absent upstream source keys, attachments, singleton settings or currency data.

The tool catalogue retains all 76 tools. Six identical optional native-row field descriptions previously repeated inside every feed schema are replaced with open native row objects; direct document/item field hints, exact input contracts, required envelopes and existing write protections remain. Regression checks cover catalogue size, response withholding, follow-up requests, missing/mixed currencies, duplicate connection names, missing Business Details keys and larger cached COA pages. Build regenerates the embedded Skill byte-for-byte.

The live service remains on 0.21.1 until explicitly approved deployment under the release policy below. Live diagnosis on 2026-10-15 reproduced key-required Business Details on both GCNIM connections and native missing currency/source IDs in the 1,869-row Industrial ledger. Reading upstream model GUIDs through the advertised keyed forms returned 404; these are not accepted as recovered singleton record keys. No real accounting records were written.

## Current release: 0.21.1

The OAuth consent page preserves same-origin form provenance and allows redirects only to its client's registered callback origin. This fixes real-browser authorization submissions being rejected as `Origin:null`; the 303 response still suppresses referrers. CI now covers an actual Chromium form submission and callback, in addition to HTTP/API tests.

- Railway now supports OAuth authorization-code + S256 PKCE, dynamic client registration, owner consent, expiring access tokens, rotating refresh tokens and revocation. Claude: **Sign in now → Register automatically**; ChatGPT: **OAuth / DCR**. Existing Bearer-token connections still work. This remains one owner's company namespace, not employee account isolation. See [Railway authentication](docs/RAILWAY.md#connect).
- Display transaction documents through the matching native collection/form APIs (`list_records`, `find_record`, `get_record`), preserving original document totals, dates, counterparties, status and lines. GL postings are not transaction documents.
- Financial reporting uses complete GL (`get_transactions` with `source:"general_ledger", auto_paginate:true`) followed by evidence-based processing with COA, openings, period and currency reconciliation. There is no verified full native financial-report reader. Legacy report feeds and definition tools remain compatibility/diagnostic interfaces; they are not the normal report source. This supersedes older reporting notes below.
- The mandatory source selection and step-by-step report procedure are embedded in MCP initialization, `get_accounting_skill` and tool descriptions, so a newly connected AI receives the workflow automatically.

## Railway deployment

The repository includes a Node.js 24 service, Dockerfile, `railway.json`, persistent SQLite storage and GitHub CI. Follow [the Railway guide](docs/RAILWAY.md) to configure a volume, secrets, Manager API URL and GitHub autodeploys. Start with `npm run dev` locally or `npm start` with configured environment variables. The Railway adapter uses a single-owner Bearer/Basic credential; it does not trust public identity headers. Source exports do not contain your existing cloud connections.

Reads and accounting mutations now use separate execution modules and event loops within this same Railway deployment. A long-lived write thread serializes mutable tool calls, shares the encrypted local database, preserves existing approval/read-back checks and never automatically replays failed writes. Concurrent write calls are rejected before dispatch. This first stage keeps the existing endpoint and volume; it is not yet two independently deployed services or a new durable batch API. See the deployment guide for limits and executor diagnostics.

共用文件的用途、读写模块依赖和维护注意事项见 [共用文件说明（2026-10-13 归档）](docs/archive/2026-10-13-shared-files.txt)。后续结构变化新增说明快照，保留历史归档。

Private Manager.io connector with encrypted, user-owned connections, Manager-native COA changes and existing party/business tools. The English connection page groups tokens by company and keeps external table imports optional.

## Release policy

The owner requires a description of changes, current functionality and limitations before publication, and explicit approval to deploy (for example, “上线”). Prepare, test and save source/version first. Do not deploy source-only updates automatically. Preserve the existing project, plugin identity, company connections, runtime bindings and private audience.

## Default COA workflow (v0.13)

Manager-native management uses Balance Sheet / Profit & Loss → Group → Account. Excel is optional external input only. Read `skills/evertrust-books-accounting/SKILL.md` for business rules; build-worker embeds that exact text in MCP initialization and `get_accounting_skill`. There is no second hand-maintained initialization rule block.

1. Read all accounts, every structure page, returned native groups and affected object details. Bind by stable IDs. Inspect `group_inventory`: the current adapter cannot prove a complete inventory of unused/unattached groups. Do not proceed with a change dependent on missing inventory.
2. Classify ordinary, built-in, system, control and subsidiary objects; analyze active parent graphs and sibling Position.
3. `prepare_coa_changes` accepts precise `items`. Existing edits require `item_key`; new objects require `operation:create`. Bind parents using `group_key` or a new planned group's `group_ref`. Names cannot silently bind the hierarchy or turn a creation into an update.
4. Read the entire structured preview with `get_coa_changes`, approve the exact complex plan, then `apply_coa_changes` with its approval hash. Resume the same approved task while in progress.
5. Re-read affected items and structure to verify settings, report paths and positions. Reconcile uncertain writes before resuming. `refresh_coa_changes` prepares resolved remaining differences for fresh review.

The MCP layer retains authenticated schema-bounded transport, previews, concurrency hashes, cycle/conflict guards, checkpoints and read-back. Skill owns accounting decisions and preflight interpretation. Defense in depth remains in executable code.

## COA tools and compatibility

- `get_accounts`, `get_coa_structure`, `get_coa_item`: native chart, paged items, known group inventory and object settings. `complete` is chart pagination completeness; it does not prove unused-group coverage.
- `prepare_coa_changes` / `apply_coa_changes`: canonical structured create/update contract (2000 input items, up to 200 writes per call).
- `get_coa_changes` / `refresh_coa_changes`: paged preview/results and remaining-change preparation.
- `cancel_coa_edit_task`: cancels only pending writes.
- Deprecated `prepare_coa_sync` / `execute_coa_sync`, precise edit-task tools and refresh aliases remain compatible with existing callers and encrypted tasks. Their import-oriented name/code matching is not used by the canonical contract.
- `get_coa_sync_report`: optional legacy Excel export; no workflow requires it. The connection page labels its spreadsheet facility as optional external data.
- COA deletion is unavailable. Generic `delete_record` does not support COA. Skill requires balances, full transaction/reference coverage, dependent-object checks and native deletion eligibility before any future supported deletion.

## Limits and verification

Sync drafts remain valid for 30 days and are retained afterward for refresh. Neither expiration nor refresh deletes the original report. Existing task snapshots remain readable.

Browser import accepts `.xlsx`, CSV and TSV under 10 MB. The COA/Chart of Accounts sheet is selected when present, otherwise the first sheet. Excel formulas are never executed: only saved calculated results are imported; missing saved results require recalculation/save or pasted values. Password-protected workbooks and older `.xls` files are not supported. Expanded workbook data is capped at 25 MB. Codes should be stored as text to retain leading zeroes.

Manager's creation PUT schema is checked. Generic object-body versions use the existing COA field allowlist. New PL Group Type must be explicit, schema-defaulted or inherited from a verified parent; unknown report categories are not guessed. Existing account settings outside the editable fields are preserved.

Name, Code, Group and Position are editable; group_type (0 Income, 1 Expense, 2 Subgroup of) is also editable for PL groups. No deletion, control-account edits, account-type conversion or subsidiary-ledger reassignment. Manager offers no transaction across a batch, so partial completion is possible and no automatic rollback exists. External Manager edits can still race between a read and PUT. Sync execution has no application batch time cutoff. Each item is checkpointed, and the conditional connection lease is renewed before each pending item. Platform or upstream request timeouts can still interrupt a call; read the task, reconcile any in-flight write and continue without replaying successful or uncertain writes. This remains caller-driven execution, not a background job.

Automated tests simulate Manager writes and exercise compressed Excel import with an independent XML parser. XLSX export is independently opened with OpenPyXL and checked for valid XML, preserved text codes and formula-free output. Real new-flow Manager writes and interactive browser layout still require host verification. Source-only work must not claim those checks were completed live.

## Build

The dependency-free ESM Worker remains a single deployment entrypoint. Required bindings: `BUCKET` and the existing `MANAGER_TOKEN_ENCRYPTION_KEY`. Tokens, cached route metadata and task snapshots are encrypted. No credentials belong in the repository.

```sh
node scripts/test-connector.mjs
node scripts/test-coa.mjs
node scripts/test-import.mjs
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

## COA v0.7 review (saved, not deployed)

COA tools, including get_accounts, advertise outputSchema and return validated structuredContent plus matching JSON text for older hosts. Other modules keep their previous contracts. Sync previews default to 50 structured differences with explicit completeness and next_offset; get_coa_edit_task supports offset/page_size (up to 100) or detail:true. The connection page shows differences directly and can load all; Excel remains optional.

Group membership and name matching use account ancestry, because chart-of-accounts may omit groups. Same-report root destinations are validated against evidenced ancestry instead of requiring group rows in that chart. Explicit null parents are supported for groups only; this does not itself prove which parent an existing group should have. Groups not present in the chart and unreachable from any account cannot currently be enumerated.

An own-key Group response is marked parent_identity_unverified, with raw IDs, Type and path relationships retained. It is not called a proven configuration cycle. Multi-node loops remain group_cycle warnings. New items and parent moves into unverified ancestry remain blocked until the API field meaning is established; reads and unrelated edits remain available. Missing root forms are labelled unresolved_root rather than claiming a known built-in category. This version does not automatically change Manager group hierarchy.

Tests include an accounts-only chart fixture, discovered group reads/matching, built-in-root evidence, own-key ambiguity, top-level group parents, structured error/results and preview pagination. Sample's actual Expenses semantics and real Manager writes remain unverified before deployment. All approval, conflict, uncertain-write and connection-isolation checks remain in place.

## COA v0.8 review (saved, not deployed)

This supersedes v0.7's own-key ambiguity workaround. Profit and loss groups interpret Type 0 (or omitted default) as Income group, Type 1 as Expense group, and Type 2 as Subgroup of. Only Type 2 activates Group as a parent. Stored Group values on Income/Expense groups are preserved as raw_group_key but ignored for ancestry, dependency ordering and cycle checks. Public group_key is the effective parent; group_classification labels the meaning.

Account parent references remain active, and balance sheet hierarchy logic is unchanged. New PL subgroups with a parent automatically use Type 2 instead of inheriting the parent's Income/Expense type. Top-level group creation needs an explicit Type 0 or 1 and null parent. Moving an existing PL group under another group previews both the Group and Type changes. Explicit Type 0/1 returns it to the top level without rewriting irrelevant stored Group values. Type 2 without a parent and contradictory parent/type input are rejected. Refresh preserves reviewed Type intent; Excel notes show before/after group classification.

Tests cover Sample-shaped Operating Expenses and Finance Costs with Type 1 plus stale Group values, valid creation into expense roots, Income/default roots, active subgroup self and multi-node cycles, child Type 2, group moves, refreshed type edits and the existing write safeguards. No Sample writes or deployment occur during source preparation. Live verification after deployment must regenerate previews under these semantics; the earlier blocked preview is not reused as proof of current differences.

## Empty-company COA support (v0.9.1)

Manager api2 has fixed balance-sheet categories: Assets (`4c05c221-ca57-4c7c-be62-115669302ed4`), Liabilities (`ed5a19f6-12c5-45cc-b4b7-4e79f7ef50bc`) and Equity (`9275ff4c-4cff-41d0-b7b5-f31c783f03d8`). These are platform categories, not company-owned editable group forms. Reference: https://forum.manager.io/t/api-and-chart-of-accounts/55887; the Assets identifier also matches the previously read Sample account ancestry.

`get_coa_structure` returns these read-only categories in `built_in_groups`, including for empty companies. Friendly BS rows accept their English names as Group, and explicit inputs accept their keys. Preview and read-back paths label them `built_in_root` with `manager_api2_fixed_category` evidence. Only these three fixed BS IDs receive this treatment; unknown IDs and use in PL remain rejected. New BS groups require a parent category or an existing group; a null parent is rejected. PL groups retain their Type-based top-level behavior.

This supersedes the earlier limitation that all root destinations required existing account ancestry. Other unresolved roots retain `needs_verification`. Existing unattached custom groups still cannot be enumerated through the accounts-only chart. Tests exercise a completely empty company, all three BS categories, PL root creation, parent-first writes/read-back, protected built-ins, invalid destinations and replay protection. Live AI Test import and timing require publication and a freshly approved preview. The saved v0.9.0 changes (200 items/default, no application sync time cutoff, renewable execution lease) are retained.

## COA import safeguards and connection timeout recovery (v0.9.2)

New BS groups named the same as their built-in parent (case/space insensitive) return `duplicate_builtin_group` with the fixed root key as a candidate. Accounts can use that root directly. Previously approved drafts containing the same duplication now show a warning and cannot resume; preparing a corrected plan is required. Existing Manager records are not deleted or moved automatically.

Creation read-back treats omitted/null `Position` as 0 and omitted/null PL-group `Type` as Income (0). No-op detection and read-back normalize zero Position, and Type 0 only for PL groups. Conflict snapshot hashes keep their original strict format for retained drafts. All other values and hidden settings remain part of comparison. These are semantic default rules, not broad acceptance of missing fields. The two actual AI Test failures still require live verification after publication. `get_coa_edit_task(detail=true)` reads up to ten failed/uncertain/in-flight items using the task's company and known keys, even if they are unattached groups absent from chart-of-accounts. `live_checks` exposes current fields, effective differences and whether they match approval. It does not change stored statuses or perform writes. Token changes prohibit these live checks.

The 200-item maximum/default remains. The AI Test call timed out at the MCP connection layer after 126.6 seconds. Sync calls now return saved progress between items: at 70 seconds, or earlier if observed average item duration predicts that the next item would exceed a 90-second response window (1.5x average, minimum 10-second reserve). The task has no overall time limit; continue the same approval while `in_progress`. Execution results include `execution.processed`, `elapsed_ms` and `yield_reason`. This supersedes v0.9.0's removal of every per-call time boundary; it is necessary to return through the observed connection limit. An unusually slow individual item or preflight can still time out. This remains caller-driven execution, not a background queue.

Cancellation can reclaim an expired lease of the same task only when no item is in-flight, using conditional ETag acquisition so a stale executor cannot renew and keep writing. Active leases, another task's lease and unresolved in-flight writes still block cancellation. Tests cover fast 200-item calls, a 301-item resumed task, slow calls yielding progress under one approval, omitted defaults versus true differences, direct Equity accounts, duplicate built-in categories, read-only live checks and caller isolation. No live AI Test writes or cleanup are performed by source preparation.

## Direct Parties API module (v0.10.0)

Eight tools: `list_customers`, `get_customer`, `create_customer`, `update_customer`, and the corresponding supplier tools. This adapter follows the resource paths and direct POST/PUT design of [manager-mcp 0.2.6](https://github.com/flumpiey/manager-mcp), published under [MIT](https://github.com/flumpiey/manager-mcp/blob/main/LICENSE). It is independently implemented for this Site's JavaScript Worker and existing multi-company token storage; no Python server or upstream package is bundled.

Every call requires an explicit caller-owned `connection_id`, checks the connected company's current identity, and uses that token's Manager API permissions. Lists accept search, skip/page_size and sort arguments and return `items`, total, `has_more` and `next_skip`. A page that starts after zero never claims collection completeness. Detail returns the native form and `record_hash`.

Creation uses POST `/customer-form` or `/supplier-form`. Search the list for existing parties first: this is not an idempotent create endpoint and does not perform server-side duplicate blocking. Native fields are supplied in `fields`; Name is required and trimmed. A key returned as JSON Key/key/id or a UUID string is read back. A successful response without a usable key is `unverified`, requiring a collection search before another create.

Update accepts a key and only changed native fields. It GETs the latest record, strips derived display fields, recursively merges object fields, replaces arrays as a whole and permits null clearing, then PUTs the complete merged form. An optional `expected_hash` from a detail read rejects stale edits before PUT. Unchanged edits do not write. All requested and retained fields are compared on read-back, including hidden settings. Omitted false/zero/empty-string defaults are accepted only for previously observed fields of the same type; unknown omitted fields remain mismatches.

Success is `succeeded` with `verified:true`, current record and hash. Write rejection, missing key, read-back differences and interrupted responses have explicit structured statuses. Uncertain writes are never retried automatically. Direct APIs do not make creates idempotent or provide an atomic compare-and-swap against edits made concurrently outside this MCP. There are no party task drafts, bulk imports, deletion tools or Excel exports.

Validation includes native JSON shape, bounded payloads, UUID identity, forbidden identity/display mutations, preserved fields, nested merge, array replacement, no-op detection, stale hashes, caller/company isolation, pagination and structuredContent/JSON parity. Tests use simulated Manager responses; no real customer or supplier is created during source preparation. The unpublished COA fixes from v0.9.2 are retained in this version.

## Business modules and financial source data (v0.11.0)

`list_business_resources` describes supported mappings for the selected company. `list_records`, `get_record`, `create_record` and `update_record` take an allowlisted `resource`, so agents do not need dozens of separate CRUD tools. Each call requires an explicit caller-owned `connection_id` and checks the connected company before reading or writing. Resource discovery describes adapter capabilities; it does not probe whether the company's tabs, Manager edition or token permissions allow each endpoint.

The sixteen writable resources are inventory/non-inventory items; sales/purchase invoices; credit/debit notes; delivery notes/goods receipts; employees, payslips and expense claims; journal, depreciation and amortization entries; and customers/suppliers. Bank/cash account collection and detail are read-only. The eight existing Parties tools remain available. Quotes, orders, banking writes, deletion, bulk imports, document emailing and background jobs are outside this release.

Native JSON is passed as `fields`. Learn exact field names from a same-resource form with `get_record`; do not invent them. Creation requires a non-empty body, Name for named resources, and non-empty native Lines for line documents. Other form validation remains with Manager. Search first: POST is not idempotent. PUT first reads the latest form, checks optional `expected_hash`, recursively merges the requested fields and preserves all other stored fields. Arrays replace in full and null clears. An expected hash is a pre-write check, not a Manager atomic compare-and-swap: an external edit between GET and PUT may still race.

Writes share the Parties no-retry transport and read-back verification. Results distinguish succeeded, unchanged, rejected, uncertain, unverified and verification_failed. Storage verification is not verification of journal balance, account selection, tax treatment, invoice delivery or accounting correctness. An interrupted write must be reconciled by list/detail reads before any new write. Single-record requests have a 30-second transport timeout and 64 KiB native-fields bound; Manager and hosting timeouts can still apply.

`get_financial_report_data` exposes seven **source-data** mappings: receivables and payables balances, bank balances, and trial balance, profit/loss, balance sheet and tax transaction feeds. Every response returns `full_report: false`, data kind, limitations and page completeness. Balance lists do not contain aging buckets; transaction feeds are not aggregated statements. Do not sum one page into closing balances or claim that a complete collection is a complete report. Trial balance/P&L/BS dates are forwarded as fromDate/toDate but application is not verified. Dates are rejected for the other four mappings. Manager's report-definition POST/GET forms are not automatically created or presented as report output. True formatted financial reports and aging buckets remain unimplemented in this release.

All existing and new tools now return `structuredContent` plus identical JSON text and advertise an outputSchema. `node scripts/test-business.mjs` exercises every resource route, merged updates, write/read-back failures, identity validation, payload validation, caller/company routing, pagination, all financial mappings and unsupported/reversed/invalid dates. It uses mocked API responses; new modules have not been verified against live Manager before publication.

API route mapping reference: [flumpiey/manager-mcp](https://github.com/flumpiey/manager-mcp), MIT, published 0.2.6. This is an independent Worker implementation; upstream Python code is not bundled.


## v0.12 prepared release: complete upstream capability coverage and accounting Skill

Added native list/detail/create/update/delete mappings for sales/purchase quotes and orders, receipts, payments, inter-account transfers, and bank/cash account writes. All 24 allowlisted business resources support native writes; no additional scope configuration or permission switches are introduced. Existing encrypted company connections, private access and Manager token checks remain in use. Manager can still reject an operation not granted to the token or enabled for the company.

Added the upstream task names for invoices, quotes, quote conversion, customer/supplier payments, expenses, transfers, journals, deletion, customer deposits, deposit documents and deposit application. These use explicit native fields and the existing stored-field verification. Quote conversion checks the source hash and party and posts explicitly mapped invoice fields, retaining the quote. A deposit document created by `issue_deposit_invoice` is a sales quotation, not a tax invoice. Deposit receipt/accounting and application require evidenced native accounting fields; they do not infer liability/revenue/FX mappings or calculate allocations. `void_document` and `delete_record` are permanent native DELETE operations with a current hash and absence verification, not reversing journals.

Report integration adds `list_report_interfaces`, `read_report_endpoint`, `save_report_definition` and `delete_report_definition`. Discovery reads the selected company's OpenAPI and exposes only evidenced report-family interfaces. The reader checks advertised GET/query parameters; report form writes require advertised methods, update hashes and read-back. No arbitrary URL, token-management or COA escape hatch is exposed. Report-form storage, raw transaction feeds and complete rendered statements remain distinct. Existing seven financial sources are retained. The actual company schema and native rendered report/export availability have not been verified in this source-only release; the adapter does not fabricate report totals or aging buckets.

The adapted `skills/evertrust-books-accounting/SKILL.md` is stored with the application source, includes upstream MIT attribution, and is embedded into MCP initialization instructions. `get_accounting_skill` exposes the same text for inspection. This integrates the workflow into this MCP server; it does not claim that a separately installable Skill has been attached to the Site-managed plugin, whose Plugin Creator file-edit interface is unavailable. The guide uses Evertrust tool names, retains reviewed COA edits, removes extra scope setup and automatic delete/recreate advice, and separates report kinds and deposit accounting.

Fixed all five reproduced audit issues: uncertain 5xx write outcomes, empty-page pagination loops, numeric-prefix corruption of precise COA names, transient cycles caused by unsafe move order, and empty connection ids. Plans schedule approved parent creations and prerequisite moves without inventing temporary changes; execution rechecks live destination ancestry. 4xx validation/token/conflict responses are reported as rejection while 5xx/timeouts/redirects require reconciliation and are never automatically retried.

Validation uses mocked Manager/R2 regression suites for connection isolation, COA/import/party/business behavior, all new routes and workflows, destructive hash checks, schema-guarded reports and the five audit fixes. No real financial documents were written or deleted during these tests. Source, artifact and Skill checks must pass before saving. Production-native write/report-rendering verification remains a stated limit until deployment and a suitable test-company check.


## Sample integration findings 2026 10 10

Live checks targeted Sample Use test2 only. Invoice/receipt 12.34 and purchase/payment 7.89 balances were reconciled; a 0.50 balanced journal was found in the ledger. Credit/debit notes, quotes/orders, employees and bank accounts were written and read back. A separate 1.00 customer-deposit liability receipt and balanced application journal changed the final invoice from balance 1.00 to PaidInFull balance 0 and customer balance 0. Native deletion with current hashes and absence verification was exercised. These are actual hosted connector checks, distinct from the seven mocked regression suites.

This source correction uses ItemName for item validation, limits report routes to exact definition/transaction allowlists (excluding COA/control/starting-balance forms), classifies transaction-named forms as definitions, and forwards schema-declared query arrays with repeated URL parameters. Native compatibility guards cover discarded purchase-quote/order IssueDate, quote/order Account, incorrect payslip Employee casing, incomplete settlement control accounts, and unsupported explicit purchase-invoice payment links. Report-write errors retain HTTP status and a reconciliation next action. The accounting Skill records observed native differences.

Remaining live limitations: transfer Amount was discarded and actual amount fields remain unresolved; delivery-note Date and IssueDate were discarded; payslip employee casing was reconciled but payroll earnings/deductions were not exercised; depreciation/amortization checks used zero records without assets; expense claims lack a verified payer/template. Report definition date writes failed or returned uncertain with no key, and complete rendered statements/aging buckets are not exposed by the mapped API. Ordinary COA write execution was not performed without approval of an exact preview. Inspector and separate Claude clients were not tested. The correction is source-only until explicitly approved deployment and subsequent native retesting.

### Generic native GL reads

`get_transactions` keeps legacy summary-page behavior by default. Select
`source: "general_ledger"` for advertised native `/transactions` GET with internal
automatic pagination (100 rows per upstream request). `auto_paginate: false`
requests one diagnostic page. Inclusive `from_date`/`to_date` and exact scalar
`filters` are applied locally to native rows; `term` is passed only if advertised.

For compact complete results use `group_by: ["account", "month"]` and
`sum_fields: ["amount"]`. Only `month` is derived; other dimensions and numeric
measures must exist in native rows. This is a generic reducer, not an accounting
report implementation. The Skill controls classification and interpretation.
Signed amounts are movements; account labels are not stable IDs and TB/BS need
opening balances and reconciliation.

Results disclose completeness, matched/read totals, pages and stop reason.
Incomplete reads never produce aggregates. Safety bounds are 20,000 rows / 8 MB
and a 45-second window checked between upstream calls; individual calls retain
the existing 30-second timeout. Raw responses over 1.5 MB are withheld in favor
of grouping/narrower filters. Offset pagination is live, not an atomic snapshot.

## Inventory control accounts (0.15.0)

Dedicated list/get/create/update tools use the native inventory control form, with company isolation, whole-chart name/code checks, Balance Sheet group validation, required update hashes, preserved settings, read-back verification and COA cache invalidation. Control deletion and ordinary-account conversion remain unsupported. Listings explicitly disclose unused controls missing from the chart. `get_resource_schema` exposes advertised native form schemas and referenced definitions; generic schemas do not establish invoice/item link fields.

## Form discovery and tool contracts (0.16.0)

`get_resource_schema` adds response schemas and a sanitized existing same-company template. `get_native_form_schema` covers supported business/report forms, reports generic or empty first-create evidence as Pending, and never seeds data or guesses UUIDs. `get_tool_contract` exposes exact deployed constraints, with integer ranges also shown in tool descriptions and validation errors.

`inspect_inventory_costing` reads advertised API2 cost routes and a bounded stored-unit-cost page. API4 Recalculate is not implemented: forum evidence identifies `/api4/inventory-unit-cost-batch`, but neither its request body nor API2-token compatibility has been verified. The connector must not substitute hand-written unit costs or journals. Browser/native Sample Use verification remains required before implementing that write.

Validation: form-discovery regression covers empty schemas, native templates, identity stripping, owner isolation, endpoint guards and no mutation. Existing inventory controls, reports, GL, history, business and information regression are retained.

### Sample verification follow-up (2026-10-12)

Native Sample Use forms established and POST/read-back verified the minimal nested Periods fields for Balance Sheet, Trial Balance and P&L. Discovery now returns a provenance-labelled minimal contract when an advertised POST has only a generic schema. Other unresolved forms remain Pending. Native browser Recalculate was also verified on a dedicated Sample fixture: quantity 8, inventory 100→80, sales COGS 20. API2 automation of Recalculate is still not implemented; the skill documents the verified UI fallback and scope checks.

## Form templates (0.17.0, saved only)

Adds `get_form_template` and `prepare_form_create`: value-free nested fields, evidence levels, minimal tested contracts, relation roles, template-required slots, provenance and rejected-path diagnostics. Previews perform no writes and never reuse old dates, amounts or company IDs. Minimal tested templates cover eight business forms and three reports; other forms remain observed or Pending. Relation checks reuse up to 25 unique company detail reads; item invoice accounts must match the native item posting account, otherwise Pending.

Sample Use exploration read 24 resource collections (10 with existing records, 14 empty), then read all 10 existing form families. Dedicated item testing found DefaultQty 2 was normalized back to 1; no retry occurred, and the stored record was reconciled. Dedicated bank creation verified Currency and IsBankAccount storage. Test fixtures are retained with MCP-TEMPLATE names; no real company was modified. Native cost API automation remains Pending. Production remains unchanged until requested publication.

Additional first-create finding: non-inventory ItemName was discarded; read-back confirmed a nameless record. No create retry was made. This form stays Pending, and the old universal item-name rule is corrected. The retained empty Sample fixture provides evidence for later native field discovery.

## Mainstream workflows and module details (0.18.0, saved only)

Adds 11 resource mappings for fixed/intangible assets, currencies, exchange rates, tax codes, divisions, projects, inventory locations, transfers, write-offs and stored unit costs (35 mapped business collections total). Adds module interface discovery and native detail reads across sales, purchases, banking, journals, inventory, assets, settings, payroll and reports. Read-only detail calls validate advertised GET/query contracts, preserve rows with optional raw pages, and expose bounded pagination/shape limits. Access-token/user/executable settings are excluded. Singleton accounting-setting edits require exact keys, hashes and known fields; unknown first-use fields stay Pending.

Native Sample mainstream-flow test: independent customer/supplier/item/bank; purchase 2 at 10; sales quote/order; explicit quote conversion to sales invoice 1 at 15; receipt 15 cleared AR; payment 20 cleared AP; bank -5; quantity 1 with cost not yet recalculated. Balanced Journal debit AR 1.23 / credit AP 1.23 was verified in the complete native GL and party balances. Both procurement quote/order and an employee create succeeded. Customer/supplier and invoice edits preserved other fields. Existing common-report tests remain verified.

Fixes two new live findings: date-only input normalized to midnight now compares by equivalent native calendar representation; exact Reference lookup reads native details when list rows omit Reference, with bounded reads and incomplete outcomes rather than false not-found. Sample Journal list omitted Reference, and native term search did not match test references even though the unfiltered GL contained the rows.

The new module/asset/settings tools have local regression tests; their live Sample execution is still Pending because publication is intentionally withheld. Native report source feeds were empty despite an active GL, so they remain source data, not full statements. See docs/sample-mainstream-verification-20261012.md for the test matrix and limitations.


## Record links, actionable errors and correction batches (0.20.0)

Adds bounded explicit native document lookups, opt-in chart-label candidates kept separate from native GL identities, structured argument diagnostics, and correct MCP error flags for failed or uncertain operations.

Correction batches support 1..20 authorized native updates/deletes with encrypted immutable before/after previews, current-hash preflight, per-record durable checkpoints, no automatic replay/rollback and optional generic GL comparisons. Creates/imports remain separate. A claimed or interrupted task must be inspected before preparing remaining work.

See [RECORD-CHANGES.md](docs/RECORD-CHANGES.md) for contracts, partial-failure behavior and limitations. Node 24 local regression and standalone artifact validation cover the new paths using simulated companies. Production deployment and live mutation verification are separate steps; no real client books were changed to test these features.
