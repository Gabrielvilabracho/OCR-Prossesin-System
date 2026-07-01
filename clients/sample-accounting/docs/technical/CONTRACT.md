# Backend Contract — Sample Invoice Processing

This contract is public-safe sample documentation. It describes the shape of an
invoice-processing integration without binding the repository to a real client
or production environment.

## Publication status

The repository still contains compatibility paths with legacy client slugs.
Those names are tracked as residual rename risk and must not be treated as
public branding.

## Sample identifiers

| Item | Public-safe value |
|---|---|
| Example organization | Example Accounting Studio |
| Example contact | operations@example.com |
| Example storage bucket | `sample-invoices` |
| Example service URL | `http://sample-invoice-service:8000` |
| Example client ID | `00000000-0000-4000-8000-000000000001` |

## Data contract

| Field | Type | Notes |
|---|---|---|
| `invoice_id` | `uuid` | Synthetic invoice identifier. |
| `source_type` | `string` | Example values: `upload`, `email`, `storage`. |
| `source_ref` | `string` | Synthetic reference such as `inbox@example.com`. |
| `supplier_name` | `string` | Fictional supplier name. |
| `supplier_tax_id` | `string` | Synthetic tax identifier for tests only. |
| `total_amount` | `decimal` | Monetary values must preserve decimal precision. |
| `currency` | `string` | ISO currency code, for example `EUR`. |
| `status` | `string` | Example values: `received`, `extracted`, `needs_review`, `approved`. |

## Safety rules

- Do not document production project IDs or private service URLs.
- Do not include real customer, supplier, or stakeholder names.
- Do not include reverse mappings from synthetic fixtures to real documents.
- Do not paste secret values into issues, docs, or verification artifacts.
