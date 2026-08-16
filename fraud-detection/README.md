# Rapprochement Bancaire

![CI/CD Pipeline](https://github.com/oussemanehdi2004/Rapprochement-Bancaire/workflows/CI%2FCD%20Pipeline/badge.svg)
![Backend Tests](https://github.com/oussemanehdi2004/Rapprochement-Bancaire/workflows/Backend%20Tests/badge.svg)
![Frontend Tests](https://github.com/oussemanehdi2004/Rapprochement-Bancaire/workflows/Frontend%20Tests/badge.svg)
![Code Coverage](https://github.com/oussemanehdi2004/Rapprochement-Bancaire/badges/coverage.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

Système de rapprochement bancaire avec détection de fraude par IA.

## 📁 Structure du projet

```
rapprochement bancaire/
├── backend/                    # API Python (FastAPI) avec détection de fraude
│   ├── main.py                # Point d'entrée principal
│   ├── features.py            # Extraction de features
│   ├── auth.py                # Authentification JWT
│   ├── rules_engine.py        # Moteur de règles
│   ├── tests/                 # Tests unitaires
│   ├── data/                  # Données
│   ├── requirements.txt       # Dépendances Python
│   └── Dockerfile             # Configuration Docker
├── frontend/                   # Application Angular
│   ├── src/                   # Code source
│   ├── public/                # Assets statiques
│   ├── angular.json           # Configuration Angular
│   └── package.json           # Dépendances Node.js
├── docs/                       # Documentation technique
│   ├── architecture_rapport_fraud_detection.md
│   └── comptes_rendus/        # Comptes-rendus d'avancement
├── documents/                  # Documents de projet
│   ├── specifications/        # Cahiers des charges et spécifications
│   └── analyses/              # Analyses et critiques
├── scripts/                    # Scripts utilitaires
│   └── convert_md_to_docx.py  # Conversion Markdown vers Word
├── assets/                     # Assets du projet
│   └── images/                # Images et captures d'écran
├── docker-compose.yml          # Orchestration Docker
├── .env.example               # Exemple de configuration environnement
└── .gitignore                 # Fichiers ignorés par Git
```

## 🚀 Démarrage rapide

### Prérequis

- Docker et Docker Compose
- Python 3.9+
- Node.js 16+
- Angular CLI

### Configuration

1. Copier le fichier d'environnement :
```bash
cp .env.example .env
```

2. Configurer les variables d'environnement dans `.env` :
- `JWT_SECRET`: Clé secrète pour JWT
- `SUPABASE_URL`: URL Supabase
- `SUPABASE_KEY`: Clé API Supabase

### Lancement avec Docker

```bash
docker-compose up --build
```

Le backend sera accessible sur `http://localhost:8000`

### Lancement manuel

**Backend :**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend :**
```bash
cd frontend
npm install
ng serve
```

## 📚 Documentation

- [Architecture du système](docs/architecture_rapport_fraud_detection.md)
- [Comptes-rendus d'avancement](docs/comptes_rendus/)
- [Spécifications fonctionnelles](documents/specifications/)
- [Analyses et critiques](documents/analyses/)

## 🔧 Scripts utilitaires

### Conversion Markdown vers Word

```bash
python scripts/convert_md_to_docx.py <input_md_file> <output_docx_file>
```

## 🧪 Tests

**Backend :**
```bash
cd backend
pytest
```

**Frontend :**
```bash
cd frontend
ng test
```

## 📝 Licence

Ce projet est développé dans le cadre d'un stage.

## 👥 Contact

Pour toute question, veuillez contacter l'équipe de développement.
