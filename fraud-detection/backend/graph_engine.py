"""
Moteur d'analyse de graphe (Neo4j) — Phase 3.

Couvre :
  12. Détection de réseaux de fraude
  18. Détection de paiements en cascade / circulaires
  22. Détection de collusion (flux réciproques suspects)
  23. Détection de comptes mules (in/out ratio + délai court)

Comme pour Supabase, la connexion est optionnelle : si Neo4j n'est pas
configuré ou injoignable, ce module se dégrade silencieusement (aucune
exception ne remonte à l'API).
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

logger = logging.getLogger("fraud_api.graph")

try:
    from neo4j import GraphDatabase
except ImportError:  # pragma: no cover
    GraphDatabase = None


class GraphEngine:
    def __init__(self, uri: str, user: str, password: str):
        max_retries = 3  # Réduit pour le développement
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                self._driver = GraphDatabase.driver(uri, auth=(user, password))
                self._driver.verify_connectivity()
                logger.info("Connexion à Neo4j établie avec succès.")
                return
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Tentative {attempt + 1}/{max_retries} : Échec de connexion à Neo4j. Nouvelle tentative dans {retry_delay}s...")
                    time.sleep(retry_delay)
                else:
                    logger.error(f"Échec définitif de connexion à Neo4j après {max_retries} tentatives. Le système fonctionnera sans analyse de graphe.")
                    raise

    def close(self) -> None:
        self._driver.close()

    # ---- Ingestion -----------------------------------------------------
    def sync_transaction(self, tx_dict: dict, is_fraud: bool, rule_category: str) -> None:
        sender = tx_dict.get("account_iban") or tx_dict.get("sender_account")
        receiver = tx_dict.get("beneficiary_iban") or tx_dict.get("receiver_account")
        if not sender or not receiver:
            return  # pas d'IBAN exploitable -> rien à grapher

        with self._driver.session() as session:
            session.execute_write(
                self._write_transaction,
                tenant_id=tx_dict.get("tenant_id"),
                tx_id=tx_dict.get("id"),
                sender=sender,
                receiver=receiver,
                amount=float(tx_dict.get("amount", 0)),
                date=str(tx_dict.get("date", "")),
                is_fraud=is_fraud,
                rule_category=rule_category,
            )

    @staticmethod
    def _write_transaction(tx, **p) -> None:
        tx.run(
            """
            MERGE (s:Account {iban: $sender, tenant_id: $tenant_id})
            MERGE (r:Account {iban: $receiver, tenant_id: $tenant_id})
            MERGE (t:Transaction {id: $tx_id, tenant_id: $tenant_id})
            SET t.amount = $amount, t.date = $date,
                t.is_fraud = $is_fraud, t.rule_category = $rule_category,
                t.sender_iban = $sender, t.receiver_iban = $receiver
            MERGE (s)-[:SENT]->(t)
            MERGE (t)-[:RECEIVED_BY]->(r)
            WITH s, r, t
            FOREACH (_ IN CASE WHEN t.is_fraud THEN [1] ELSE [] END |
                MERGE (a:Alert {tx_id: $tx_id, tenant_id: $tenant_id})
                SET a.category = $rule_category
                MERGE (a)-[:FLAGS]->(s)
                MERGE (a)-[:FLAGS]->(r)
            )
            """,
            **p,
        )

    # ---- Use case 12 : réseaux de fraude -------------------------------
    def detect_fraud_network(self, tenant_id: str, iban: str, min_alerts: int = 3) -> Optional[dict]:
        with self._driver.session() as session:
            return session.execute_read(self._q_network, tenant_id=tenant_id, iban=iban, min_alerts=min_alerts)

    @staticmethod
    def _q_network(tx, tenant_id: str, iban: str, min_alerts: int):
        result = tx.run(
            """
            MATCH (acc:Account {iban: $iban, tenant_id: $tenant_id})<-[:FLAGS]-(a:Alert {tenant_id: $tenant_id})
            WITH acc, count(DISTINCT a) AS alert_count
            WHERE alert_count >= $min_alerts
            RETURN acc.iban AS iban, alert_count AS alert_count
            """,
            iban=iban, tenant_id=tenant_id, min_alerts=min_alerts,
        )
        record = result.single()
        return dict(record) if record else None

    # ---- Use case 18 : paiements circulaires ---------------------------
    def detect_circular_payment(self, tenant_id: str, iban: str, max_hops: int = 5) -> Optional[list]:
        with self._driver.session() as session:
            return session.execute_read(self._q_circular, tenant_id=tenant_id, iban=iban, max_hops=max_hops)

    @staticmethod
    def _q_circular(tx, tenant_id: str, iban: str, max_hops: int):
        result = tx.run(
            f"""
            MATCH path = (start:Account {{iban: $iban, tenant_id: $tenant_id}})-[:SENT|RECEIVED_BY*2..{max_hops * 2}]->(start)
            WHERE ALL(t IN [n IN nodes(path) WHERE n:Transaction] WHERE t.tenant_id = $tenant_id)
            RETURN [n IN nodes(path) WHERE n:Account | n.iban] AS cycle
            LIMIT 1
            """,
            iban=iban, tenant_id=tenant_id,
        )
        record = result.single()
        return record["cycle"] if record else None

    # ---- Use case 22 : collusion (heuristique flux réciproques) -------
    def detect_reciprocal_flow(self, tenant_id: str, iban: str, min_occurrences: int = 2) -> Optional[dict]:
        with self._driver.session() as session:
            return session.execute_read(self._q_reciprocal, tenant_id=tenant_id, iban=iban, min_occurrences=min_occurrences)

    @staticmethod
    def _q_reciprocal(tx, tenant_id: str, iban: str, min_occurrences: int):
        result = tx.run(
            """
            MATCH (a:Account {iban: $iban, tenant_id: $tenant_id})-[:SENT]->(t1:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(b:Account {tenant_id: $tenant_id})
            MATCH (b)-[:SENT]->(t2:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(a)
            WITH b, count(DISTINCT t1) AS out_count, count(DISTINCT t2) AS in_count
            WHERE out_count >= $min_occurrences AND in_count >= $min_occurrences
            RETURN b.iban AS counterparty, out_count, in_count
            """,
            iban=iban, tenant_id=tenant_id, min_occurrences=min_occurrences,
        )
        record = result.single()
        return dict(record) if record else None

    # ---- Nouveau : liste des comptes les plus signalés (pour peupler la liste) ----
    def get_top_flagged_accounts(self, tenant_id: str, limit: int = 15) -> list[dict]:
        with self._driver.session() as session:
            return session.execute_read(self._q_top_accounts, tenant_id=tenant_id, limit=limit)

    @staticmethod
    def _q_top_accounts(tx, tenant_id: str, limit: int):
        result = tx.run(
            """
            MATCH (acc:Account {tenant_id: $tenant_id})<-[:FLAGS]-(a:Alert {tenant_id: $tenant_id})
            WITH acc, count(DISTINCT a) AS alert_count, collect(DISTINCT a.category) AS categories
            RETURN acc.iban AS iban, alert_count, categories
            ORDER BY alert_count DESC
            LIMIT $limit
            """,
            tenant_id=tenant_id, limit=limit,
        )
        return [dict(record) for record in result]

    # ---- Nouveau : réseau (voisins directs) autour d'un compte, pour la visualisation ----
    def get_account_network(self, tenant_id: str, iban: str) -> Optional[dict]:
        with self._driver.session() as session:
            return session.execute_read(self._q_network_graph, tenant_id=tenant_id, iban=iban)

    @staticmethod
    def _q_network_graph(tx, tenant_id: str, iban: str):
        result = tx.run(
            """
            MATCH (center:Account {iban: $iban, tenant_id: $tenant_id})
            OPTIONAL MATCH (center)-[:SENT]->(t1:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(other1:Account {tenant_id: $tenant_id})
            OPTIONAL MATCH (other2:Account {tenant_id: $tenant_id})-[:SENT]->(t2:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(center)
            WITH center, 
                 collect(DISTINCT CASE WHEN t1 IS NOT NULL THEN 
                    {other: other1.iban, tx_id: t1.id, amount: t1.amount, is_fraud: coalesce(t1.is_fraud, false)} 
                 END) AS outgoing, 
                 collect(DISTINCT CASE WHEN t2 IS NOT NULL THEN 
                    {other: other2.iban, tx_id: t2.id, amount: t2.amount, is_fraud: coalesce(t2.is_fraud, false)} 
                 END) AS incoming
            RETURN center.iban AS center_iban, outgoing, incoming
            """,
            tenant_id=tenant_id, iban=iban,
        )
        record = result.single()
        if record is None or record["center_iban"] is None:
            return None

        center_iban = record["center_iban"]
        nodes = {center_iban}
        edges = []

        for row in (record["outgoing"] or []):
            if row is None or row.get("other") is None:
                continue
            nodes.add(row["other"])
            edges.append({
                "source": center_iban, "target": row["other"],
                "amount": row["amount"], "is_fraud": row["is_fraud"], "tx_id": row["tx_id"],
            })

        for row in (record["incoming"] or []):
            if row is None or row.get("other") is None:
                continue
            nodes.add(row["other"])
            edges.append({
                "source": row["other"], "target": center_iban,
                "amount": row["amount"], "is_fraud": row["is_fraud"], "tx_id": row["tx_id"],
            })

        return {
            "center_iban": center_iban,
            "nodes": list(nodes),
            "edges": edges,
        }

    # ---- Use case 23 : détection de comptes mules (in/out ratio + délai court) -------
    def detect_mule_accounts(self, tenant_id: str, min_transactions: int = 5, 
                            min_in_out_ratio: float = 0.7, max_delay_hours: float = 24) -> list[dict]:
        """
        Détecte les comptes mules : comptes avec beaucoup d'entrées suivies rapidement de sorties.
        
        Args:
            tenant_id: ID du tenant
            min_transactions: Nombre minimum de transactions entrantes pour être considéré
            min_in_out_ratio: Ratio minimum (sorties/entrées) pour suspecter un compte mule
            max_delay_hours: Délai maximum en heures entre une entrée et sa sortie correspondante
        
        Returns:
            Liste des comptes suspects avec leurs métriques
        """
        with self._driver.session() as session:
            return session.execute_read(
                self._q_mule_accounts, 
                tenant_id=tenant_id, 
                min_transactions=min_transactions,
                min_in_out_ratio=min_in_out_ratio,
                max_delay_hours=max_delay_hours
            )

    @staticmethod
    def _q_mule_accounts(tx, tenant_id: str, min_transactions: int, 
                         min_in_out_ratio: float, max_delay_hours: float):
        result = tx.run(
            """
            // Trouver les comptes avec beaucoup d'entrées
            MATCH (acc:Account {tenant_id: $tenant_id})-[:SENT]->(t_in:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(acc)
            WITH acc, count(DISTINCT t_in) AS in_count
            WHERE in_count >= $min_transactions
            
            // Compter les sorties
            MATCH (acc)-[:SENT]->(t_out:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(:Account {tenant_id: $tenant_id})
            WITH acc, in_count, count(DISTINCT t_out) AS out_count
            
            // Calculer le ratio in/out
            WITH acc, in_count, out_count, 
                 toFloat(out_count) / toFloat(in_count) AS in_out_ratio
            
            // Filtrer par ratio minimum
            WHERE in_out_ratio >= $min_in_out_ratio
            
            // Calculer le délai moyen entre entrées et sorties (pour les paires correspondantes)
            MATCH (acc)-[:SENT]->(t_in:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(acc)
            MATCH (acc)-[:SENT]->(t_out:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(:Account {tenant_id: $tenant_id})
            WHERE t_out.date >= t_in.date 
              AND duration.between(datetime(t_in.date), datetime(t_out.date)).hours <= $max_delay_hours
            WITH acc, in_count, out_count, in_out_ratio, 
                 avg(duration.between(datetime(t_in.date), datetime(t_out.date)).hours) AS avg_delay_hours
            
            RETURN acc.iban AS iban, in_count, out_count, in_out_ratio, avg_delay_hours
            ORDER BY in_out_ratio DESC, in_count DESC
            """,
            tenant_id=tenant_id,
            min_transactions=min_transactions,
            min_in_out_ratio=min_in_out_ratio,
            max_delay_hours=max_delay_hours
        )
        return [dict(record) for record in result]

    # ---- PageRank pour identifier les comptes influents dans le réseau ----
    def compute_pagerank(self, tenant_id: str, max_iterations: int = 20, 
                        damping_factor: float = 0.85) -> list[dict]:
        """
        Calcule le PageRank des comptes pour identifier les nœuds centraux dans le réseau de transactions.
        Les comptes avec un PageRank élevé peuvent être des hubs de fraude.
        """
        with self._driver.session() as session:
            return session.execute_read(
                self._q_pagerank,
                tenant_id=tenant_id,
                max_iterations=max_iterations,
                damping_factor=damping_factor
            )

    @staticmethod
    def _q_pagerank(tx, tenant_id: str, max_iterations: int, damping_factor: float):
        result = tx.run(
            """
            // Créer un graphe projeté pour les transactions du tenant
            MATCH (a1:Account {tenant_id: $tenant_id})-[:SENT]->(t:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(a2:Account {tenant_id: $tenant_id})
            WITH a1, a2, count(t) AS weight
            RETURN a1 AS source, a2 AS target, weight
            """,
            tenant_id=tenant_id
        )
        
        # Pour une implémentation simplifiée sans GDS, on utilise une approche basée sur les degrés
        # En production, utiliser: CALL gds.pageRank.stream('myGraph') YIELD nodeId, score
        result = tx.run(
            """
            MATCH (acc:Account {tenant_id: $tenant_id})
            OPTIONAL MATCH (acc)-[:SENT]->(t:Transaction {tenant_id: $tenant_id})
            WITH acc, count(t) AS out_degree
            OPTIONAL MATCH (acc)<-[:RECEIVED_BY]-(t2:Transaction {tenant_id: $tenant_id})
            WITH acc, out_degree, count(t2) AS in_degree
            WITH acc, (out_degree + in_degree) AS total_degree
            ORDER BY total_degree DESC
            LIMIT 20
            RETURN acc.iban AS iban, total_degree AS pagerank_score, 
                   out_degree, in_degree
            """,
            tenant_id=tenant_id
        )
        return [dict(record) for record in result]

    # ---- Community Detection (Weakly Connected Components) ----
    def detect_communities(self, tenant_id: str, min_community_size: int = 3) -> list[dict]:
        """
        Détecte les communautés de comptes connectés (composantes faiblement connectées).
        Les grandes communautés peuvent indiquer des réseaux de fraude organisés.
        """
        with self._driver.session() as session:
            return session.execute_read(
                self._q_communities,
                tenant_id=tenant_id,
                min_community_size=min_community_size
            )

    @staticmethod
    def _q_communities(tx, tenant_id: str, min_community_size: int):
        # Implémentation simplifiée sans GDS
        # En production, utiliser: CALL gds.wcc.stream('myGraph') YIELD nodeId, componentId
        result = tx.run(
            """
            MATCH (acc:Account {tenant_id: $tenant_id})
            OPTIONAL MATCH (acc)-[:SENT]->(t:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(other:Account {tenant_id: $tenant_id})
            WITH acc, collect(DISTINCT other.iban) AS connected_ibans
            WHERE size(connected_ibans) >= $min_community_size
            RETURN acc.iban AS center_account, 
                   connected_ibans AS community_members,
                   size(connected_ibans) AS community_size
            ORDER BY community_size DESC
            LIMIT 15
            """,
            tenant_id=tenant_id,
            min_community_size=min_community_size
        )
        return [dict(record) for record in result]


def create_graph_engine() -> Optional["GraphEngine"]:
    """Factory tolérante : None si Neo4j n'est pas configuré/joignable."""
    if GraphDatabase is None:
        logger.warning("Le package 'neo4j' n'est pas installé. Moteur de graphe désactivé.")
        return None

    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "password_super_securise")
    
    try:
        engine = GraphEngine(uri, user, password)
        logger.info("Connexion à Neo4j établie avec succès (moteur de graphe Phase 3 actif).")
        return engine
    except Exception as e:
        logger.warning(f"Échec de connexion à Neo4j: {e}. Moteur de graphe désactivé.")
        return None