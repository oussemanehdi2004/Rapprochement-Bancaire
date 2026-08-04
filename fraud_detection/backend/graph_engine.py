"""
Moteur d'analyse de graphe (Neo4j) — Phase 3.

Couvre :
  12. Détection de réseaux de fraude
  18. Détection de paiements en cascade / circulaires
  22. Détection de collusion (flux réciproques suspects)

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
        max_retries = 15
        retry_delay = 5
        
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
                    logger.error(f"Échec définitif de connexion à Neo4j après {max_retries} tentatives.")
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
            MERGE (s:Account {iban: $sender})
            MERGE (r:Account {iban: $receiver})
            MERGE (t:Transaction {id: $tx_id, tenant_id: $tenant_id})
            SET t.amount = $amount, t.date = $date,
                t.is_fraud = $is_fraud, t.rule_category = $rule_category
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
            MATCH (acc:Account {iban: $iban})<-[:FLAGS]-(a:Alert {tenant_id: $tenant_id})
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
            MATCH path = (start:Account {{iban: $iban}})-[:SENT|RECEIVED_BY*2..{max_hops * 2}]->(start)
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
            MATCH (a:Account {iban: $iban})-[:SENT]->(t1:Transaction {tenant_id: $tenant_id})-[:RECEIVED_BY]->(b:Account)
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
            MATCH (acc:Account)<-[:FLAGS]-(a:Alert {tenant_id: $tenant_id})
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


def create_graph_engine() -> Optional["GraphEngine"]:
    """Factory tolérante : None si Neo4j n'est pas configuré/joignable."""
    if GraphDatabase is None:
        logger.warning("Le package 'neo4j' n'est pas installé. Moteur de graphe désactivé.")
        return None

    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    if not uri or not user or not password:
        logger.warning("NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD manquants. Moteur de graphe désactivé.")
        return None

    try:
        engine = GraphEngine(uri, user, password)
        logger.info("Connexion à Neo4j établie avec succès (moteur de graphe Phase 3 actif).")
        return engine
    except Exception:
        logger.exception("Échec de connexion à Neo4j. Moteur de graphe désactivé.")
        return None