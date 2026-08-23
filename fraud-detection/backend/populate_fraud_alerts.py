import os
import math
import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "http://localhost:8006/fraud/api/analyze"

def clean_val(val):
    """Remplace les valeurs NaN et Inf par None (converti en null en JSON)"""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val

def populate_fraud_alerts():
    """Read sample data and analyze it to populate fraud_alerts table"""
    
    # Read the sample banking data
    csv_path = "sample_data/bank_statement_lines.csv"
    if not os.path.exists(csv_path):
        print(f"⚠️ Fichier introuvable : {csv_path}")
        return
    
    df = pd.read_csv(csv_path)
    print(f"📤 Chargement de {len(df)} transactions depuis {csv_path}...")
    
    # Convert to transaction format expected by API
    transactions = []
    for _, row in df.iterrows():
        tx = {
            "id": str(clean_val(row.get('transaction_id', f"tx_{_}"))),
            "transaction_reference": str(clean_val(row.get('reference', f"REF_{_}"))),
            "date": clean_val(row.get('date', '2026-08-20T00:00:00Z')),
            "description": clean_val(row.get('description', 'Transaction')),
            "transaction_type": clean_val(row.get('transaction_type', 'TRANSFER')),
            "amount": float(clean_val(row.get('amount', 0)) or 0),
            "sender_balance_before": float(clean_val(row.get('balance_before', 0)) or 0),
            "sender_balance_after": float(clean_val(row.get('balance_after', 0)) or 0),
            "receiver_balance_before": 0.0,
            "receiver_balance_after": 0.0,
            "account_iban": str(clean_val(row.get('account_iban', 'FR7612345678901234567890123'))),
            "beneficiary_iban": str(clean_val(row.get('beneficiary_iban', 'FR7698765432109876543210987'))),
            "device_fingerprint": str(clean_val(row.get('device_fingerprint', 'DEV_DEFAULT'))),
            "country": str(clean_val(row.get('country', 'FR')))
        }
        transactions.append(tx)
    
    # Send in batches
    batch_size = 10
    total = len(transactions)
    
    for i in range(0, total, batch_size):
        batch = transactions[i:i + batch_size]
        print(f"📤 Analyse du lot {i//batch_size + 1}/{(total + batch_size - 1)//batch_size} ({len(batch)} transactions)...")
        
        try:
            response = requests.post(f"{BASE_URL}?tenant_id=default", json=batch)
            if response.status_code == 200:
                print(f"✅ Lot {i//batch_size + 1} analysé avec succès")
            else:
                print(f"❌ Erreur lot {i//batch_size + 1}: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"❌ Erreur lot {i//batch_size + 1}: {e}")
    
    print(f"\n🎉 Analyse terminée ! {total} transactions traitées.")
    print("📊 Vérifiez la table fraud_alerts dans Supabase.")

if __name__ == "__main__":
    populate_fraud_alerts()
