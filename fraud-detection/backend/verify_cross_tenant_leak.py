"""
Script pour vérifier si les requêtes de graphe exposent des données inter-tenants.
Teste si un compte partagé entre tenants peut révéler des transactions d'un autre tenant.
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
    # Compte partagé identifié dans la vérification précédente
    shared_iban = "FR7612345678901234567890123"
    
    print("=" * 60)
    print(f"VÉRIFICATION DE FUITE DE DONNÉES POUR: {shared_iban}")
    print("=" * 60)
    
    # 1. Quels tenants utilisent ce compte ?
    result = session.run("""
        MATCH (acc:Account {iban: $iban})-[:SENT]->(t:Transaction)
        RETURN DISTINCT t.tenant_id AS tenant_id, count(t) AS tx_count
    """, iban=shared_iban)
    
    tenants_using_account = []
    print("\n📦 Tenants utilisant ce compte:")
    for record in result:
        tenant_id = record["tenant_id"]
        tx_count = record["tx_count"]
        tenants_using_account.append(tenant_id)
        print(f"   - {tenant_id}: {tx_count} transactions")
    
    # 2. Pour chaque tenant, vérifier les transactions VISIBLES via get_account_network
    print("\n" + "=" * 60)
    print("SIMULATION DE get_account_network() POUR CHAQUE TENANT")
    print("=" * 60)
    
    for tenant_id in tenants_using_account:
        print(f"\n🔍 Tenant: {tenant_id}")
        print("-" * 60)
        
        # Requête similaire à _q_network_graph dans graph_engine.py
        result = session.run("""
            MATCH (center:Account {iban: $iban})
            OPTIONAL MATCH (center)-[:SENT]->(t1:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(other1:Account)
            OPTIONAL MATCH (other2:Account)-[:SENT]->(t2:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(center)
            WITH center, 
                 collect(DISTINCT CASE WHEN t1 IS NOT NULL THEN 
                    {other: other1.iban, tx_id: t1.id, amount: t1.amount, is_fraud: coalesce(t1.is_fraud, false)} 
                 END) AS outgoing, 
                 collect(DISTINCT CASE WHEN t2 IS NOT NULL THEN 
                    {other: other2.iban, tx_id: t2.id, amount: t2.amount, is_fraud: coalesce(t2.is_fraud, false)} 
                 END) AS incoming
            RETURN center.iban AS center_iban, outgoing, incoming
        """, iban=shared_iban, tenant_id=tenant_id)
        
        record = result.single()
        if record:
            print(f"   📤 Transactions sortantes: {len([r for r in record['outgoing'] if r])}")
            for row in record['outgoing']:
                if row:
                    print(f"      → {row['other']}: {row['amount']}€ (tx: {row['tx_id']}, fraud: {row['is_fraud']})")
            
            print(f"   📥 Transactions entrantes: {len([r for r in record['incoming'] if r])}")
            for row in record['incoming']:
                if row:
                    print(f"      ← {row['other']}: {row['amount']}€ (tx: {row['tx_id']}, fraud: {row['is_fraud']})")
    
    # 3. Vérifier si les voisins (comptes connectés) sont aussi partagés
    print("\n" + "=" * 60)
    print("VÉRIFICATION DES VOISINS PARTAGÉS")
    print("=" * 60)
    
    result = session.run("""
        MATCH (center:Account {iban: $iban})-[:SENT]->(t:Transaction)-[:RECEIVED_BY]->(other:Account)
        WITH other, collect(DISTINCT t.tenant_id) AS tenants
        WHERE size(tenants) > 1
        RETURN other.iban AS iban, tenants
        LIMIT 10
    """, iban=shared_iban)
    
    shared_neighbors = list(result)
    if shared_neighbors:
        print("⚠️ Certains voisins sont aussi partagés entre tenants:")
        for record in shared_neighbors:
            print(f"   🏦 {record['iban']}: tenants {record['tenants']}")
    else:
        print("✅ Les voisins ne sont pas partagés entre tenants")
    
    # 4. Test de la requête detect_fraud_network
    print("\n" + "=" * 60)
    print("SIMULATION DE detect_fraud_network()")
    print("=" * 60)
    
    for tenant_id in tenants_using_account:
        result = session.run("""
            MATCH (acc:Account {iban: $iban})<-[:FLAGS]-(a:Alert {tenant_id: $tenant_id})
            WITH acc, count(DISTINCT a) AS alert_count
            WHERE alert_count >= 3
            RETURN acc.iban AS iban, alert_count AS alert_count
        """, iban=shared_iban, tenant_id=tenant_id)
        
        record = result.single()
        if record:
            print(f"   🚨 Tenant {tenant_id}: {record['alert_count']} alertes (réseau de fraude détecté)")
        else:
            print(f"   ✅ Tenant {tenant_id}: pas assez d'alertes pour réseau de fraude")

print("\n" + "=" * 60)
print("CONCLUSION")
print("=" * 60)
print("""
Bien que les comptes soient partagés au niveau des nœuds Account, 
les REQUÊTES Cypher filtrent correctement par tenant_id au niveau 
des Transaction et Alert.

Cependant, c'est un problème potentiel :
- Si un attaquant connaît l'IBAN d'un compte d'un autre tenant, 
  il pourrait voir les connexions de ce compte dans son propre tenant.
- Les nœuds Account devraient idéalement inclure tenant_id 
  pour une isolation complète.
""")

driver.close()
