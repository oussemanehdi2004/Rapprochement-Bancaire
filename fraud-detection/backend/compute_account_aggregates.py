"""
Calcule les agrégats par compte (`account_aggregates`) et l'historique des
bénéficiaires (`beneficiary_history`) à partir des relevés bancaires bruts.

Ces agrégats sont ce que `rules_engine.py` consommera en Phase 2 pour des
règles comme :
  - montant très supérieur à la moyenne historique du compte
  - compte rarement utilisé qui se réveille
  - nouvel IBAN bénéficiaire jamais vu pour ce compte

Usage :
    python compute_account_aggregates.py --bank-csv ./sample_data/bank_statement_lines.csv \
        --out-dir ./sample_data

Produit account_aggregates.csv et beneficiary_history.csv, prêts à être
importés dans Supabase (ou insérés via load_sample_data_to_supabase.py).
"""

from __future__ import annotations

import argparse
import statistics
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import pandas as pd


def compute_account_aggregates(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["value_date"] = pd.to_datetime(df["value_date"])
    df["abs_amount"] = df["amount"].abs()

    today = pd.Timestamp(date.today())
    thirty_days_ago = today - pd.Timedelta(days=30)

    rows = []
    for (tenant_id, account_iban), group in df.groupby(["tenant_id", "account_iban"]):
        amounts = group["abs_amount"]
        recent = group[group["value_date"] >= thirty_days_ago]
        rows.append(
            {
                "tenant_id": tenant_id,
                "account_iban": account_iban,
                "avg_transaction_amount": round(amounts.mean(), 2),
                "stddev_transaction_amount": round(
                    statistics.pstdev(amounts) if len(amounts) > 1 else 0.0, 2
                ),
                "transaction_count_30d": len(recent),
                "transaction_count_total": len(group),
                "first_seen_date": group["value_date"].min().date().isoformat(),
                "last_transaction_date": group["value_date"].max().date().isoformat(),
                "distinct_beneficiaries": group["counterparty_iban"].nunique(),
            }
        )

    return pd.DataFrame(rows)


def compute_beneficiary_history(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["value_date"] = pd.to_datetime(df["value_date"])

    rows = []
    key_cols = ["tenant_id", "account_iban", "counterparty_iban"]
    for (tenant_id, account_iban, beneficiary), group in df.groupby(key_cols):
        if not beneficiary:
            continue
        group_sorted = group.sort_values("value_date")
        rows.append(
            {
                "tenant_id": tenant_id,
                "sender_account_iban": account_iban,
                "beneficiary_iban": beneficiary,
                "first_seen_date": group_sorted["value_date"].min().date().isoformat(),
                "last_seen_date": group_sorted["value_date"].max().date().isoformat(),
                "transaction_count": len(group_sorted),
                "last_amount": abs(group_sorted.iloc[-1]["amount"]),
            }
        )

    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bank-csv", required=True)
    parser.add_argument("--out-dir", default="./sample_data")
    args = parser.parse_args()

    df = pd.read_csv(args.bank_csv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    aggregates = compute_account_aggregates(df)
    aggregates.to_csv(out_dir / "account_aggregates.csv", index=False)
    print(f"✅ {len(aggregates)} comptes agrégés -> {out_dir / 'account_aggregates.csv'}")

    beneficiaries = compute_beneficiary_history(df)
    beneficiaries.to_csv(out_dir / "beneficiary_history.csv", index=False)
    print(f"✅ {len(beneficiaries)} paires (compte, bénéficiaire) -> {out_dir / 'beneficiary_history.csv'}")


if __name__ == "__main__":
    main()
