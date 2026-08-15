"""
Génère des données synthétiques de relevés bancaires et d'écritures
comptables pour tester les règles Phase 2 (agrégats par compte).

Pourquoi synthétique : en attendant un vrai import client, ce script permet
de peupler `bank_statement_lines` et `accounting_entries` avec un historique
réaliste (plusieurs mois, plusieurs comptes), et y injecte volontairement
quelques anomalies (nouvel IBAN + montant élevé, compte rarement utilisé,
montant très supérieur à la moyenne du compte) pour valider que les règles
Phase 2 les détectent bien.

Usage :
    pip install faker --break-system-packages
    python generate_sample_banking_data.py --out-dir ./data/sample --n-accounts 15 --months 6

Par défaut, écrit deux fichiers CSV (bank_statement_lines.csv,
accounting_entries.csv) prêts à être importés dans Supabase (table import UI,
ou via le script load_sample_data_to_supabase.py décrit plus bas).
"""

from __future__ import annotations

import argparse
import csv
import random
import uuid
from datetime import date, timedelta
from pathlib import Path

try:
    from faker import Faker
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Le package 'faker' est requis : pip install faker --break-system-packages"
    ) from exc

fake = Faker("fr_FR")

TENANT_ID = "tenant-123"
JOURNAL_CODES = ["BQ", "ACH", "VTE"]
ACCOUNT_CODES_DEBIT = ["601000", "606000", "613000", "622000"]  # charges
ACCOUNT_CODE_BANK = "512000"
LABELS_REGULAR = [
    "VIREMENT FOURNISSEUR {name}",
    "PRELEVEMENT {name}",
    "ACHAT CB {name}",
    "VIR SEPA {name}",
]


def make_iban() -> str:
    return fake.iban()


def gen_accounts(n: int) -> list[str]:
    return [make_iban() for _ in range(n)]


def random_amount(mean: float, spread: float) -> float:
    amount = max(5.0, random.gauss(mean, spread))
    return round(amount, 2)


def generate_history(accounts: list[str], months: int) -> tuple[list[dict], list[dict]]:
    """Génère l'historique 'normal' pour chaque compte + un pool de
    bénéficiaires récurrents, puis injecte des anomalies à la fin de la
    période (les plus récentes -> ce que vos règles doivent attraper)."""

    bank_lines: list[dict] = []
    accounting_lines: list[dict] = []

    start_date = date.today() - timedelta(days=30 * months)
    end_date = date.today() - timedelta(days=7)  # laisse une semaine pour les anomalies

    for account in accounts:
        # Chaque compte a un profil de dépense propre (moyenne/écart-type)
        mean_amount = random.uniform(80, 2500)
        spread = mean_amount * 0.25

        # Pool de 2 à 5 bénéficiaires récurrents pour ce compte
        recurring_beneficiaries = [make_iban() for _ in range(random.randint(2, 5))]

        n_transactions = random.randint(20, 80)
        for _ in range(n_transactions):
            tx_date = fake.date_between(start_date=start_date, end_date=end_date)
            beneficiary = random.choice(recurring_beneficiaries)
            amount = random_amount(mean_amount, spread)
            supplier_name = fake.company()
            label = random.choice(LABELS_REGULAR).format(name=supplier_name)

            bank_lines.append(_bank_line(account, tx_date, -amount, label, beneficiary))
            accounting_lines.append(
                _accounting_line(tx_date, amount, label, supplier_name, beneficiary)
            )

        account_profiles[account] = {
            "mean": mean_amount,
            "spread": spread,
            "recurring": recurring_beneficiaries,
        }

    return bank_lines, accounting_lines


def _bank_line(account: str, tx_date: date, amount: float, label: str, counterparty: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "tenant_id": TENANT_ID,
        "account_iban": account,
        "statement_date": (tx_date + timedelta(days=1)).isoformat(),
        "value_date": tx_date.isoformat(),
        "label": label,
        "amount": amount,
        "balance_after": "",  # calculé a posteriori si besoin
        "currency": "EUR",
        "counterparty_iban": counterparty,
    }


def _accounting_line(tx_date: date, amount: float, label: str, supplier_name: str, supplier_iban: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "tenant_id": TENANT_ID,
        "entry_date": tx_date.isoformat(),
        "account_code": random.choice(ACCOUNT_CODES_DEBIT),
        "journal_code": random.choice(JOURNAL_CODES),
        "label": f"{label} - {supplier_name}",
        "debit": amount,
        "credit": 0,
        "currency": "EUR",
        "reference": f"FAC-{random.randint(10000, 99999)}",
        "supplier_iban": supplier_iban,
    }


def inject_anomalies(accounts: list[str], bank_lines: list[dict], accounting_lines: list[dict]) -> None:
    """Ajoute des transactions récentes volontairement suspectes, pour
    valider que les règles Phase 2 les détectent."""

    recent_date = date.today() - timedelta(days=random.randint(0, 3))

    # 1. Nouvel IBAN + montant élevé (jamais vu pour ce compte)
    victim_account = random.choice(accounts)
    new_beneficiary = make_iban()
    profile = account_profiles[victim_account]
    big_amount = round(profile["mean"] * 6, 2)
    label = f"VIREMENT URGENT {fake.company()}"
    bank_lines.append(_bank_line(victim_account, recent_date, -big_amount, label, new_beneficiary))
    accounting_lines.append(_accounting_line(recent_date, big_amount, label, fake.company(), new_beneficiary))

    # 2. Montant très supérieur à la moyenne historique du compte (facteur x8)
    victim_account_2 = random.choice(accounts)
    profile_2 = account_profiles[victim_account_2]
    beneficiary_2 = random.choice(profile_2["recurring"])
    outlier_amount = round(profile_2["mean"] * 8 + profile_2["spread"] * 3, 2)
    label_2 = "VIREMENT EXCEPTIONNEL"
    bank_lines.append(_bank_line(victim_account_2, recent_date, -outlier_amount, label_2, beneficiary_2))
    accounting_lines.append(
        _accounting_line(recent_date, outlier_amount, label_2, fake.company(), beneficiary_2)
    )

    # 3. Compte quasi jamais utilisé qui se réveille avec un gros montant
    dormant_account = make_iban()
    accounts.append(dormant_account)
    account_profiles[dormant_account] = {"mean": 100, "spread": 20, "recurring": []}
    dormant_beneficiary = make_iban()
    dormant_amount = round(random.uniform(4000, 9000), 2)
    label_3 = "VIREMENT COMPTE DORMANT"
    bank_lines.append(_bank_line(dormant_account, recent_date, -dormant_amount, label_3, dormant_beneficiary))
    accounting_lines.append(
        _accounting_line(recent_date, dormant_amount, label_3, fake.company(), dormant_beneficiary)
    )


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


account_profiles: dict[str, dict] = {}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="./sample_data")
    parser.add_argument("--n-accounts", type=int, default=15)
    parser.add_argument("--months", type=int, default=6)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    Faker.seed(args.seed)

    accounts = gen_accounts(args.n_accounts)
    bank_lines, accounting_lines = generate_history(accounts, args.months)
    inject_anomalies(accounts, bank_lines, accounting_lines)

    out_dir = Path(args.out_dir)
    write_csv(out_dir / "bank_statement_lines.csv", bank_lines)
    write_csv(out_dir / "accounting_entries.csv", accounting_lines)

    print(f"[OK] {len(bank_lines)} lignes de releve bancaire -> {out_dir / 'bank_statement_lines.csv'}")
    print(f"[OK] {len(accounting_lines)} ecritures comptables -> {out_dir / 'accounting_entries.csv'}")
    print("3 anomalies injectees dans les 3 derniers jours (nouvel IBAN, montant outlier, compte dormant).")


if __name__ == "__main__":
    main()
