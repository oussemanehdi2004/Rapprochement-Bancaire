"""
Script pour vérifier la structure des nœuds Transaction dans Neo4j.
"""

import os
from neo4j import GraphDatabase

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
    print("STRUCTURE DES NŒUDS TRANSACTION")
    print("=" * 60)
    
    result = session.run("""
        MATCH (t:Transaction)
        RETURN t
        LIMIT 1
    """)
    
    record = result.single()
    if record:
        tx_node = record["t"]
        print("📋 Propriétés d'une Transaction:")
        for key, value in tx_node.items():
            print(f"   - {key}: {value}")
    
    print("\n" + "=" * 60)
    print("RELATIONS ACTUELLES")
    print("=" * 60)
    
    result = session.run("""
        MATCH (t:Transaction)
        RETURN t
        LIMIT 1
    """)
    
    record = result.single()
    if record:
        tx_node = record["t"]
        print("📋 Relations d'une Transaction:")
        # Neo4j Python driver doesn't directly show relationships in node dict
        # We need to query relationships separately
        result = session.run("""
            MATCH (t:Transaction)-[r]->(other)
            RETURN type(r) AS rel_type, labels(other) AS other_labels, other
            LIMIT 5
        """)
        for rel_record in result:
            print(f"   - {rel_record['rel_type']} -> {rel_record['other_labels']}")
        
        result = session.run("""
            MATCH (t:Transaction)<-[r]-(other)
            RETURN type(r) AS rel_type, labels(other) AS other_labels, other
            LIMIT 5
        """)
        for rel_record in result:
            print(f"   <- {rel_record['rel_type']} - {rel_record['other_labels']}")

driver.close()
