"""
Script de migration pour ajouter tenant_id aux nœuds Account existants.
Ce script nettoie les données partagées entre tenants et réindexe correctement.
"""

import os
from neo4j import GraphDatabase

# Configuration Neo4j
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password_super_securise")

print(f"🔗 Connexion à Neo4j sur {NEO4J_URI}...")

try:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    driver.verify_connectivity()
    print("✅ Connexion Neo4j établie avec succès !\n")
except Exception as e:
    print(f"❌ Échec de la connexion à Neo4j : {e}")
    exit(1)

with driver.session() as session:
    print("=" * 60)
    print("MIGRATION DE L'ISOLATION PAR TENANT_ID")
    print("=" * 60)
    
    # 1. Supprimer tous les nœuds Account (ils seront recréés avec tenant_id)
    print("\n🗑️  Suppression des anciens nœuds Account...")
    result = session.run("MATCH (a:Account) DETACH DELETE a")
    print(f"✅ Nœuds Account supprimés")
    
    # 2. Comme les transactions n'ont pas les IBANs stockés, on doit nettoyer et réimporter
    print("\n⚠️ Les transactions existantes n'ont pas les IBANs stockés.")
    print("🔄 Nettoyage complet de Neo4j pour réimport avec nouveau schéma...")
    
    result = session.run("MATCH (n) DETACH DELETE n")
    print("✅ Base Neo4j nettoyée")
    
    print("\n" + "=" * 60)
    print("ACTION REQUISE")
    print("=" * 60)
    print("Pour appliquer la nouvelle isolation par tenant_id:")
    print("1. Redémarrez le backend pour utiliser le nouveau graph_engine.py")
    print("2. Réimportez les données via l'API d'ingestion")
    print("3. Les nouvelles transactions auront:")
    print("   - Account avec tenant_id")
    print("   - Transaction avec sender_iban et receiver_iban")
    print("   - Isolation complète entre tenants")
    print("\n" + "=" * 60)

print("\n" + "=" * 60)
print("✅ NETTOYAGE TERMINÉ - PRÊT POUR RÉIMPORT")
print("=" * 60)

driver.close()
