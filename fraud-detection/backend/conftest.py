"""Pytest configuration for the AI Fraud Detection backend.

`main.py` performs work at import time: it requires ``JWT_SECRET`` to be set and
it loads ``model_fraud.pkl`` relative to the current working directory. We make
sure both prerequisites are satisfied before any test module imports ``main``.
"""

import os
os.environ["ENABLE_TEST_TOKEN_ENDPOINT"] = "true"
os.environ["TESTING"] = "true"
# Disable Supabase for tests to prevent database connection attempts
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_KEY"] = ""
# The module directory (where this conftest lives) contains ``model_fraud.pkl``
# and the source modules (``main.py``, ``rules_engine.py``).
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))

# ``main.py`` raises at import time when JWT_SECRET is missing, so provide a
# deterministic secret for the whole test session.
os.environ.setdefault("JWT_SECRET", "test-secret-key-used-only-in-tests-32b")

# Ensure model/relative paths resolve regardless of where pytest is invoked.
os.chdir(MODULE_DIR)

# Désactiver le rate limiting pour les tests
os.environ["RATE_LIMIT_REQUESTS"] = "1000"
os.environ["RATE_LIMIT_PERIOD"] = "60"
