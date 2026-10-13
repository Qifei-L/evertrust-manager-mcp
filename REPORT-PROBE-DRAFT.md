# Unpublished accounting interface verification and Business Details

Base: Site v23, source commit `d5a5d2a51c6fbb4da46f49e8d109f4b94c60dde8`.

This draft adds four tools to the existing Site. It does not add GL reconstruction, change existing write routes, introduce new authentication or move hosting.

| Tool | Operation |
| --- | --- |
| `inspect_accounting_interfaces` | Complete native OpenAPI path/method catalogue; eligible ledger/report GET schemas |
| `probe_accounting_endpoint` | One advertised, eligible native GET, preserving raw data |
| `get_business_information` | Advertised singleton or explicitly keyed Business Details GET with current hash and PUT schema |
| `update_business_information` | Advertised PUT only, current hash required, omitted fields retained, read-back verification |

No deployment, production probe or real Business Details update has been performed. Tests use simulated Manager responses and cannot establish that Evertrust's current API exposes `/transactions` or rendered reports.

After integrating into the latest source from the other channel, validate again before publication. Once live, inspect Evertrust's OpenAPI, probe only the routes it advertises, and verify actual native account identities before choosing a reporting implementation. No new report definition is needed for ledger probing; retain the existing GL Summary key `01a12adf-2c1b-7a50-845a-ad9c24c25197` if a supported report view requires it.

Business Details supports only `/business-details-form` and `/business-details-form/{key}` when advertised by the company. Do not treat unrelated settings as Business Details. A Name update checks the same account fingerprint before refreshing the existing connection metadata. Interrupted writes are never retried automatically.
