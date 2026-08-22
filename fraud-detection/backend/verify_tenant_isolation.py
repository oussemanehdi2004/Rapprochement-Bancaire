"""
Script de vérification de l'isolation des données par tenant_id dans Neo4j.
Ce script vérifie que les graphes et transactions sont bien propres à chaque tenant.
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
    # 1. Vérifier les tenants présents dans la base
    print("=" * 60)
    print("1. TENANTS PRÉSENTS DANS NEO4J")
    print("=" * 60)
    
    result = session.run("""
        MATCH (t:Transaction)
        RETURN DISTINCT t.tenant_id AS tenant_id, count(t) AS tx_count
        ORDER BY tenant_id
    """)
    
    tenants = []
    for record in result:
        tenant_id = record["tenant_id"]
        tx_count = record["tx_count"]
        tenants.append(tenant_id)
        print(f"📦 Tenant: {tenant_id} | Transactions: {tx_count}")
    
    if not tenants:
        print("⚠️ Aucun tenant trouvé dans Neo4j")
        exit(0)
    
    # 2. Pour chaque tenant, vérifier les comptes et transactions
    print("\n" + "=" * 60)
    print("2. DÉTAIL PAR TENANT")
    print("=" * 60)
    
    for tenant_id in tenants:
        print(f"\n🔍 Tenant: {tenant_id}")
        print("-" * 60)
        
        # Comptes uniques pour ce tenant
        result = session.run("""
            MATCH (acc:Account)-[:SENT]->(t:Transaction {tenant_id: $tenant_id})
            RETURN DISTINCT acc.iban AS iban
            UNION
            MATCH (acc:Account)<-[:RECEIVED_BY]-(t:Transaction {tenant_id: $tenant_id})
            RETURN DISTINCT acc.iban AS iban
        """, tenant_id=tenant_id)
        
        accounts = set()
        for record in result:
            accounts.add(record["iban"])
        
        print(f"   📊 Comptes uniques: {len(accounts)}")
        
        # Transactions pour ce tenant
        result = session.run("""
            MATCH (t:Transaction {tenant_id: $tenant_id})
            RETURN count(t) AS tx_count, sum(t.amount) AS total_amount
        """, tenant_id=tenant_id)
        
        record = result.single()
        if record:
            print(f"   💰 Transactions: {record['tx_count']} | Montant total: {record['total_amount'] or 0:.2f}€")
        
        # Alertes pour ce tenant
        result = session.run("""
            MATCH (a:Alert {tenant_id: $tenant_id})
            RETURN count(a) AS alert_count
        """, tenant_id=tenant_id)
        
        record = result.single()
        if record:
            print(f"   🚨 Alertes: {record['alert_count']}")
    
    # 3. Vérifier s'il y a des transactions SANS tenant_id
    print("\n" + "=" * 60)
    print("3. VÉRIFICATION DE L'INTÉGRITÉ")
    print("=" * 60)
    
    result = session.run("""
        MATCH (t:Transaction)
        WHERE t.tenant_id IS NULL OR t.tenant_id = ''
        RETURN count(t) AS count
    """)
    
    record = result.single()
    if record and record["count"] > 0:
       print(f"⚠️ ATTENTION: {record['count']} transactions SANS tenant_id !")
    else:
        print("✅ Toutes les transactions ont un tenant_id")
    
    # 4. Vérifier les alertes sans tenant_id
    result = session.run("""
        MATCH (a:Alert)
        WHERE a.tenant_id IS NULL OR a.tenant_id = ''
        RETURN count(a) AS count
    """)
    
    record = result.single()
    if record and record["count"] > 0:
        print(f"⚠️ ATTENTION: {record['count']} alertes SANS tenant_id !")
    else:
        print("✅ Toutes les alertes ont un tenant_id")
    
    # 5. Vérifier si un compte est partagé entre plusieurs tenants
    print("\n" + "=" * 60)
    print("4. VÉRIFICATION DU PARTAGE DE COMPTES ENTRE TENANTS")
    print("=" * 60)
    
    result = session.run("""
        MATCH (acc:Account)-[:SENT]->(t:Transaction)
        WITH acc, collect(DISTINCT t.tenant_id) AS tenants
        WHERE size(tenants) > 1
        RETURN acc.iban AS iban, tenants
        LIMIT 10
    """)
    
    shared_accounts = list(result)
    if shared_accounts:
        print("⚠️ ATTENTION: Certains comptes sont partagés entre plusieurs tenants !")
        for record in shared_accounts:
            print(f"   🏦 Compte {record['iban']} utilisé par tenants: {record['tenants']}")
    else:
        print("✅ Aucun compte partagé entre tenants (isolation respectée)")
    
    # 6. Exemple de réseau pour un tenant spécifique
    if tenants:
        sample_tenant = tenants[0]
        print("\n" + "=" * 60)
        print(f"5. EXEMPLE DE RÉSEAU POUR TENANT: {sample_tenant}")
        print("=" * 60)
        
        result = session.run("""
            MATCH (center:Account)-[:SENT]->(t:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(other:Account)
            RETURN center.iban AS center, other.iban AS other, t.amount AS amount, t.is_fraud AS is_fraud
            LIMIT 5
        """, tenant_id=sample_tenant)
        
        print("   Transactions sortantes:")
        for record in result:
            fraud_flag = "🚨 FRAUDE" if record["is_fraud"] else "✅ OK"
            print(f"      {record['center']} → {record['other']} : {record['amount']}€ [{fraud_flag}]")

print("\n" + "=" * 60)
print("✅ VÉRIFICATION TERMINÉE")
print("=" * 60)

driver.close()
