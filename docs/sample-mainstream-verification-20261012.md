# Mainstream Sample Use verification — 2026-10-12

All live activity used Sample Use. Test prefix: MCP-MAIN-20261012-0533. This is a source-only update; no version was published and no real company was changed.

| Function | Native Sample result | Remaining scope |
|---|---|---|
| Customer / Supplier | Created, hash-based name edits verified | Optional fields need evidence |
| Inventory item | Created, purchase +2 and sale -1; quantity 1 | Native cost automation Pending |
| Bank account | Created; receipt 15 less payment 20 = -5 | Transfers native amount fields Pending |
| Purchase invoice | Stored item/account/qty/price; amount 20; description edit preserved other fields | Tax/FX not exercised |
| Sales quote / order | Created with native dates, party and price | Optional fields not inferred |
| Quote to invoice | Explicit invoice fields created amount 15; original quote remained unchanged | No blind clone |
| Customer receipt | Stored AR customer and invoice links; invoice and customer balances 15 to 0 | Other payer variants not generalized |
| Supplier payment | Stored supplier/control links; purchase and supplier balances 20 to 0 | Specific PI allocation field remains unverified; party allocation was observed |
| Journal | Date, Reference, Narration, Debit/Credit stored; GL debit AR 1.23 and credit AP 1.23; both party balances 1.23 | Other control/account types need current native evidence |
| Procurement quote / order | Both first-create tests and read-back passed | No posting Account |
| Employee | First create Name/read-back passed | Payroll earnings/deductions Pending |
| BS / Trial balance / P&L definitions | Earlier native POST/read-back confirmed nested Periods | Rendered complete statements not exposed |
| Financial source data | Customer/supplier/bank balance collections read; TB/P&L/BS/tax feeds empty | Empty feeds cannot imply zero account balances; GL contained 85 rows |
| GL detail | Full 85-row feed read; Journal exact local Reference filter found the two posting rows | Native source/account stable IDs missing in some rows |
| COA | Read all 174 chart nodes over 18 cached pages | Group inventory remains incomplete; 3 root classifications unresolved; system setting GETs can return 404 |
| Fixed / intangible assets | Native catalogue confirms list and keyed form routes; source mapping and local tests added | Native Sample read/write Pending until tool surface is deployed |
| System settings | Currency/rate/tax/project/division/location and singleton interfaces added with guarded fields/hashes | Native Sample tests Pending; no guessed setting IDs |
| Module line/quantity/cost data | Source GET discovery, raw reads, paging and guard tests passed | Live Sample execution of new entry points Pending |
| Non-inventory item | Old required ItemName was discarded; record reconciled | Actual name field Pending; no retry |
| Credit/debit notes, delivery/goods receipt, expense claim | Supported collections are readable, but existing native form evidence is insufficient | No unverified first-create payload is treated as a template |

## Actual API issues recorded

- Date-only input was correctly stored as midnight, while the old verifier reported a difference. Source compares only equivalent known native calendar fields; a changed day/time still fails.
- Journal collection rows expose Date/Narration/Debit/Credit, but omit Reference. An exact list-only search incorrectly reported not-found. Source now performs bounded native detail reads for missing references and returns incomplete when it cannot resolve all candidates.
- Native term search did not find MCP-MAIN references. A full GL read and exact local field filters did find their rows. Native term cannot establish reference completeness.
- Inventory DefaultQty 2 read back as 1, and non-inventory ItemName was discarded. Both were reconciled without a repeated create.
- Saved unit costs are not a native Recalculate algorithm; API2 automation remains unimplemented.

## Source tests

Affected business, party, history, GL, form template, module detail, report, information and inventory-control regressions pass. Module tests cover exact native query parameters, field projection arrays, raw nested values, page completeness, repeated/empty pages, response limits, keyed asset reads, owner isolation, excluded security paths and setting hash/unknown-field preservation. Template tests cover Journal balancing and rejected fields. Local mocks verify transport behavior, not Manager's business accounting rules.

The template library now has 17 minimal contracts (14 business forms including Employee and 3 report definitions). Observed-only forms remain Pending for first creation. Sample fixtures are retained as regression evidence; no cleanup, production posting or browser fallback occurred in this mainstream test run.
