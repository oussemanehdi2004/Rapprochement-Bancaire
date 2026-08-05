import os
import math
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Les variables SUPABASE_URL et SUPABASE_KEY doivent être configurées dans le fichier .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def clean_val(val):
    """ Remplace les valeurs NaN et Inf par None (converti en null en JSON) """
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val

def upload_csv_to_supabase(csv_path: str, table_name: str, batch_size: int = 500):
    if not os.path.exists(csv_path):
        print(f"⚠️ Fichier introuvable : {csv_path}")
        return
    
    df = pd.read_csv(csv_path)
    
    # Convertit en liste de dictionnaires et nettoie strictement les NaN / Inf
    records = df.to_dict(orient="records")
    clean_records = [
        {k: clean_val(v) for k, v in row.items()}
        for row in records
    ]
    
    if clean_records:
        print(f"📤 Insertion de {len(clean_records)} lignes dans '{table_name}'...")
        
        # Envoi par lots (batches) pour éviter d'excéder la taille maximale de requête
        for i in range(0, len(clean_records), batch_size):
            batch = clean_records[i:i + batch_size]
            supabase.table(table_name).upsert(batch).execute()
            
        print(f"✅ Table '{table_name}' mise à jour avec succès.")

if __name__ == "__main__":
    print("🚀 Début du processus d'importation Phase 2...\n")
    
    # 1. Génération des données synthétiques
    print("1️⃣ Génération des relevés et écritures...")
    os.system("python generate_sample_banking_data.py")
    
    # 2. Calcul des agrégats historiques
    print("\n2️⃣ Calcul des agrégats par compte...")
    os.system("python compute_account_aggregates.py --bank-csv sample_data/bank_statement_lines.csv --out-dir sample_data")
    
    # 3. Envoi des 4 fichiers vers Supabase
    print("\n3️⃣ Envoi des données vers Supabase...")
    upload_csv_to_supabase("sample_data/bank_statement_lines.csv", "bank_statement_lines")
    upload_csv_to_supabase("sample_data/accounting_entries.csv", "accounting_entries")
    upload_csv_to_supabase("sample_data/account_aggregates.csv", "account_aggregates")
    upload_csv_to_supabase("sample_data/beneficiary_history.csv", "beneficiary_history")
    
    print("\n🎉 Chargement terminé avec succès ! Vérifiez votre interface Supabase.")