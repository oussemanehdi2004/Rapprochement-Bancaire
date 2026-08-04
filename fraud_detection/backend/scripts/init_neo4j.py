import os
import sys
from neo4j import GraphDatabase

# Charger les variables d'environnement
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password_super_securise")

CYPHER_INDEXES = [
    "CREATE INDEX account_iban_idx IF NOT EXISTS FOR (a:Account) ON (a.iban);",
    "CREATE INDEX transaction_id_idx IF NOT EXISTS FOR (t:Transaction) ON (t.id);",
    "CREATE INDEX transaction_date_idx IF NOT EXISTS FOR (t:Transaction) ON (t.date);",
    "CREATE INDEX alert_id_idx IF NOT EXISTS FOR (al:Alert) ON (al.id);",
    "CREATE INDEX alert_category_idx IF NOT EXISTS FOR (al:Alert) ON (al.category);",
]


def init_neo4j_schema():
    print(f"🔗 Connexion à Neo4j sur {NEO4J_URI}...")
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        with driver.session() as session:
            for cypher in CYPHER_INDEXES:
                session.run(cypher)
                print(f"✅ Exécuté : {cypher}")
        driver.close()
        print("🚀 Schéma et index Neo4j initialisés avec succès !")
    except Exception as e:
        print(f"❌ Erreur lors de l'initialisation de Neo4j : {e}")
        sys.exit(1)


if __name__ == "__main__":
    init_neo4j_schema()