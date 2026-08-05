"""Unit tests for JWT token generation and user context validation in ``main.py``."""

import asyncio
import time
import jwt
import pytest
from fastapi.security import HTTPAuthorizationCredentials

import main


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class TestGenerateTestToken:
    def test_returns_access_token(self):
        result = main.generate_test_token()
        assert "access_token" in result

    def test_token_is_decodable_with_the_shared_secret(self):
        token = main.generate_test_token()["access_token"]
        payload = jwt.decode(token, main.JWT_SECRET, algorithms=["HS256"])
        assert payload["service"] == "express_backend"
        assert payload["purpose"] == "internal_api_call"


class TestCurrentUserContext:
    def test_valid_internal_token_returns_user_context(self):
        token = main.generate_test_token()["access_token"]
        context = asyncio.run(main.get_current_user_context(_credentials(token)))
        assert context["user_id"] == "express_backend"
        assert context["tenant_id"] == "default"

    def test_missing_credentials_returns_demo_fallback(self):
        context = asyncio.run(main.get_current_user_context(None))
        assert context["user_id"] == "demo_user"
        assert context["tenant_id"] == "default"

    def test_invalid_jwt_falls_back_to_dev_user(self):
        context = asyncio.run(main.get_current_user_context(_credentials("invalid.jwt.token")))
        assert context["user_id"] == "dev_user"
        assert context["tenant_id"] == "default"