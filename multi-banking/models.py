from pydantic import BaseModel, Field
from typing import Optional
import hashlib

class PivotTransaction(BaseModel):
    tenant_id: str
    bank_id: str
    account_iban: str
    value_date: str          # ISO 8601
    label: str
    amount: float             # signé : + crédit, - débit
    currency: str = "EUR"
    counterparty_iban: Optional[str] = None
    reference: Optional[str] = None
    source_format: str        # "csv" | "camt053" | "mt940"
    source_line_hash: Optional[str] = None
    balance_before: Optional[float] = None
    balance_after: Optional[float] = None

    def compute_hash(self) -> str:
        raw = f"{self.tenant_id}|{self.account_iban}|{self.value_date}|{self.amount}|{self.label}|{self.reference}"
        return hashlib.sha256(raw.encode()).hexdigest()