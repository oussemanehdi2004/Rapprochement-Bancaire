import sys
import os

# Résoudre les imports depuis la racine du module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Activer le mode dev pour les tests
os.environ["DISABLE_INTERNAL_AUTH"] = "true"