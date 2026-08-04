import csv
import io
from models import PivotTransaction

def parse_csv(content: bytes, tenant_id: str, bank_id: str) -> list[PivotTransaction]:
    text = content.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    results = []
    for row in reader:
        tx = PivotTransaction(
            tenant_id=tenant_id,
            bank_id=bank_id,
            account_iban=row["account_iban"],
            value_date=row["value_date"],
            label=row["label"],
            amount=float(row["amount"]),
            currency=row.get("currency", "EUR"),
            counterparty_iban=row.get("counterparty_iban") or None,
            reference=row.get("reference") or None,
            source_format="csv",
        )
        tx.source_line_hash = tx.compute_hash()
        results.append(tx)
    return results