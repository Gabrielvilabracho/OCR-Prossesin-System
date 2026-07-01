from enum import StrEnum


class InvoiceErrorKind(StrEnum):
    PDF_FETCH_FAILED = "PDF_FETCH_FAILED"
    OCR_FAILED = "OCR_FAILED"
    EXTRACTION_FAILED = "EXTRACTION_FAILED"
    MATH_VALIDATION_FAILED = "MATH_VALIDATION_FAILED"
    PERSIST_FAILED = "PERSIST_FAILED"


class InvoiceProcessingError(Exception):
    def __init__(self, kind: InvoiceErrorKind, message: str) -> None:
        self.kind = kind
        self.message = message
        super().__init__(f"[{kind}] {message}")
