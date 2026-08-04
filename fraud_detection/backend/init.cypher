// ==========================================
// 1. INDEX SUR LES COMPTES (ACCOUNT)
// ==========================================
// Optimise les MERGE et recherches par IBAN
CREATE INDEX account_iban_idx IF NOT EXISTS
FOR (a:Account) ON (a.iban);

// ==========================================
// 2. INDEX SUR LES TRANSACTIONS
// ==========================================
// Optimise le dédoublonnage par ID de transaction
CREATE INDEX transaction_id_idx IF NOT EXISTS
FOR (t:Transaction) ON (t.id);

// Optimise le filtrage temporel (ex: t.date >= $depuis) pour la détection de cycles
CREATE INDEX transaction_date_idx IF NOT EXISTS
FOR (t:Transaction) ON (t.date);

// ==========================================
// 3. INDEX SUR LES ALERTES
// ==========================================
// Recherche rapide des nœuds d'alerte rattachés
CREATE INDEX alert_id_idx IF NOT EXISTS
FOR (al:Alert) ON (al.id);

CREATE INDEX alert_category_idx IF NOT EXISTS
FOR (al:Alert) ON (al.category);