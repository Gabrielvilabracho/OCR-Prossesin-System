from typing import Annotated, Literal
from pydantic import BaseModel, Field


class ProcessInvoiceRequest(BaseModel):
    model_config = {"extra": "forbid"}
    storage_key: Annotated[
        str, Field(pattern=r"\.(pdf|jpg|jpeg|png|svg|xml)$")
    ]
    client_id: Annotated[str, Field(json_schema_extra={"format": "uuid"})]
    dry_run: bool = False
    mime_type: str | None = None


class ProcessInvoiceResponse(BaseModel):
    model_config = {"extra": "forbid"}
    status: Literal["success", "failed", "dry_run", "processing"]
    invoice_id: str | None = None
    errors: list[str] = []
