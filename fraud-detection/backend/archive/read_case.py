import json

# 1. Ouvrir et lire le fichier JSON que nous avons créé à l'étape 1
with open("case_template.json", "r", encoding="utf-8") as file:
    fraud_data = json.load(file)

# 2. Extraire les informations de notre "fiche d'identité"
case_id = fraud_data["case_id"]
risk_score = fraud_data["risk_score"]
reason = fraud_data["explainability"]["summary"]

# 3. Afficher un message clair dans notre console
print("=========================================")
print(f"🚨 ALERTE DE FRAUDE DÉTECTÉE : {case_id}")
print(f"📈 Score de risque de l'IA : {risk_score}/100")
print(f"💡 Explication de l'IA : {reason}")
print("=========================================")