# Sample Accounting AI Service

This FastAPI + LangGraph service demonstrates an invoice-processing execution plane. The current directory name is retained for compatibility during public cleanup; public docs should refer to it as the sample accounting AI service.

## Boundary

- Owns OCR, extraction, validation, and persistence behavior for invoice-processing examples.
- Must not be promoted as shared control-plane code without a separate SDD lifecycle.

The Python multi-tenant refactor is explicitly deferred. Do not extract shared processing code from this service without a separate SDD lifecycle.

## Related contracts

- `contracts/sample-accounting/process-invoice-request.schema.json`
- `contracts/sample-accounting/process-invoice-response.schema.json`

The contract directory name is retained until a separate compatibility-safe rename is planned.
