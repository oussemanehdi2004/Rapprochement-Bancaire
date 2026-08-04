import json
import os
from neo4j import GraphDatabase

URI = "bolt://localhost:7687"
AUTH = None 

print("⏳ Connexion à la base de données Neo4j...")
try:
    driver = GraphDatabase.driver(URI, auth=AUTH)
    driver.verify_connectivity()
    print("🔌 Connexion Neo4j établie avec succès !")
except Exception as e:
    print(f"❌ Échec de la connexion à Neo4j. Vérifiez que Docker tourne. Erreur : {e}")
    exit(1)

# Données fictives de secours pour forcer le POC à fonctionner
mock_data = {
    "connected_elements": [
        {"type": "IBAN", "id": "FR761234", "connected_to": "ALERTE_01"},
        {"type": "IBAN", "id": "FR761234", "connected_to": "ALERTE_02"},
        {"type": "IBAN", "id": "FR761234", "connected_to": "ALERTE_03"},
        {"type": "IBAN", "id": "FR761234", "connected_to": "ALERTE_04"},
        {"type": "IBAN", "id": "FR765678", "connected_to": "ALERTE_01"}
    ]
}

json_path = "case_template.json"
connected_elements = []

# Tenter de lire le fichier existant
if os.path.exists(json_path):
    try:
        with open(json_path, "r") as f:
            data = json.load(f)
            connected_elements = data.get("connected_elements", [])
    except (OSError, json.JSONDecodeError) as e:
        print(f"⚠️ Impossible de lire '{json_path}' ({e}). Utilisation des données du POC.")

# Si le fichier ne contient pas la bonne clé ou est vide, on injecte nos données de test POC
if not connected_elements:
    print("💡 Note : 'case_template.json' vide ou incomplet pour le graphe. Utilisation des données du POC.")
    connected_elements = mock_data["connected_elements"]

def inject_data(tx, elements):
    tx.run("MATCH (n) DETACH DELETE n") # Nettoyage initial du graphe
    for elem in elements:
        tx.run("""
            MERGE (i:IBAN {number: $iban_id})
            MERGE (a:Alert {id: $alert_id})
            MERGE (i)-[:CONNECTED_TO]->(a)
        """, iban_id=elem["id"], alert_id=elem["connected_to"])

with driver.session() as session:
    print(f"📥 Injection de {len(connected_elements)} éléments dans le graphe...")
    # FIX : Utilisation de execute_write pour la compatibilité avec Neo4j 6.2.0+
    session.execute_write(inject_data, connected_elements)
    print("✅ Injection terminée !")

# Requête Cypher : "trouve les IBAN connectés à plus de 3 alertes"
cypher_query = """
MATCH (i:IBAN)-[:CONNECTED_TO]->(a:Alert)
WITH i, count(a) AS alert_count
WHERE alert_count > 3
RETURN i.number AS suspect_iban, alert_count
"""

print("\n🔍 Exécution de la requête Cypher anti-fraude...")
with driver.session() as session:
    results = session.run(cypher_query)
    records = list(results)
    
    if not records:
        print("🔍 Aucune structure de réseau suspecte détectée.")
    else:
        print("🚨 ALERTE RÉSEAU DE FRAUDE DÉTECTÉ :")
        for record in records:
            print(f" 🏪 L'IBAN {record['suspect_iban']} est relié à {record['alert_count']} alertes !")

driver.close()