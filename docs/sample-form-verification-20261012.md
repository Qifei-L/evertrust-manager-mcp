# Sample Use form exploration — 2026-10-12

Source-only iteration, no deployment. All live tests used the existing Sample Use connection. No real company was modified.

## Reusable minimal templates

| Form | Tested native fields | Scope |
|---|---|---|
| Inventory item | ItemName | Name only; optional generated flags remain observed |
| Customer / Supplier | Name | Name only |
| Bank or cash account | Name | Minimal template; Currency and IsBankAccount additionally verified in a dedicated Sample fixture |
| Sales invoice | IssueDate, Reference, Customer, Description; Lines[].Item, Account, LineDescription, Qty, SalesUnitPrice | Native stored fields and current-company relations |
| Purchase invoice | IssueDate, Reference, Supplier, Description; Lines[].Item, Account, LineDescription, Qty, PurchaseUnitPrice | Native stored fields and current-company relations |
| Sales quote | IssueDate, Reference, Customer, Description; Lines[].LineDescription, Qty, SalesUnitPrice | No posting Account |
| Sales order | Date, Reference, Customer, Description; Lines[].LineDescription, Qty, SalesUnitPrice | No posting Account |
| Balance sheet | Periods[].Date, AccountCodes | Native POST/read-back verified |
| Trial balance / P&L | Periods[].FromDate, ToDate, AccountCodes | Native POST/read-back verified |

The minimal workflow's required slots are not claims about Manager server-required fields. Schemas contain no old record values or company IDs. Existing GET fields retain an observed evidence level unless field storage has been verified.

## Additional live findings

1. Inventory item create with ItemName, HasDefaultQty:true, DefaultQty:2 and HasCostOfGoodsSold:true returned DefaultQty:1. Explicit GET reconciled the result; no retry. DefaultQty is excluded from writable template fields.
2. Bank account Name, Currency and IsBankAccount:true stored and read back unchanged. Currency IDs are not included in static contracts.
3. A first non-inventory item create using the old tool's required ItemName discarded the name. Explicit GET confirmed only generated account/configuration fields and identity. The actual name field is Pending; the source no longer applies the inventory naming rule to this form, and rejects the known discarded ItemName input.
4. Receipt and payment examples establish native relation paths, but payment invoice-allocation fields remain unverified. These forms have observed templates, not ready create contracts.
5. Native cost recalculation was previously verified in Sample: buy 10 at 10, sell 2; quantity 8 unchanged, inventory value 100 to 80, sales COGS 20. API2 automation is still Pending.

Test-created fixtures are retained in Sample Use for follow-up discovery. Their accounting effects are limited to the explicitly marked cost fixture from the earlier iteration; the new item/bank/non-inventory fixtures have no transactions.

## Tests for source tools

Local Worker RPC tests cover value-free templates, unsupported endpoints, ownership isolation, no writes, nested dates, invalid calendar dates, required arrays, unknown and discarded fields, numeric precision, same-company references, item posting-account matches/mismatches, and reuse of repeated detail reads. Existing business CRUD and report tests also run.

The two new tools cannot yet be invoked through the live connector because this version is intentionally not deployed. Live native Sample outcomes supplied the field evidence; local RPC tests exercise the new implementation.
