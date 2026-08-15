"""Tests pour le service d'authentification 2FA"""
import pytest
from two_factor_auth import TwoFactorAuthService, get_2fa_service


def test_generate_secret():
    """Test la génération d'un secret TOTP"""
    service = TwoFactorAuthService()
    user_id = "test_user"
    
    secret = service.generate_secret(user_id)
    
    assert secret is not None
    assert len(secret) > 0
    assert service.is_2fa_enabled(user_id)


def test_verify_valid_code():
    """Test la vérification d'un code TOTP valide"""
    service = TwoFactorAuthService()
    user_id = "test_user"
    
    secret = service.generate_secret(user_id)
    
    # Générer un code TOTP valide
    import pyotp
    totp = pyotp.TOTP(secret)
    valid_code = totp.now()
    
    assert service.verify_code(user_id, valid_code) is True


def test_verify_invalid_code():
    """Test la vérification d'un code TOTP invalide"""
    service = TwoFactorAuthService()
    user_id = "test_user"
    
    service.generate_secret(user_id)
    
    # Code invalide
    invalid_code = "000000"
    
    assert service.verify_code(user_id, invalid_code) is False


def test_provisioning_uri():
    """Test la génération de l'URI de provisioning"""
    service = TwoFactorAuthService()
    user_id = "test_user"
    
    service.generate_secret(user_id)
    uri = service.get_provisioning_uri(user_id, "TestApp")
    
    assert uri is not None
    assert "otpauth://totp/" in uri
    assert user_id in uri
    assert "TestApp" in uri


def test_backup_codes_generation():
    """Test la génération de codes de secours"""
    service = TwoFactorAuthService()
    user_id = "test_user"
    
    codes = service.generate_backup_codes(user_id, count=5)
    
    assert len(codes) == 5
    assert all(len(code) == 8 for code in codes)  # Codes de 8 caractères hexadécimaux


def test_backup_codes_verification():
    """Test la vérification de codes de secours"""
    service = TwoFactorAuthService()
    user_id = "test_user_backup_verification"
    
    codes = service.generate_backup_codes(user_id, count=3)
    
    # Vérifier un code valide
    first_code = codes[0]
    assert service.verify_backup_code(user_id, first_code) is True
    
    # Vérifier que le code n'est plus dans la liste
    assert first_code not in service.backup_codes[user_id]
    
    # Le code ne devrait plus être valide après utilisation
    assert service.verify_backup_code(user_id, first_code) is False
    
    # Vérifier un code invalide
    assert service.verify_backup_code(user_id, "INVALID") is False


def test_disable_2fa():
    """Test la désactivation de la 2FA"""
    service = TwoFactorAuthService()
    user_id = "test_user"
    
    # Activer la 2FA
    service.generate_secret(user_id)
    assert service.is_2fa_enabled(user_id) is True
    
    # Désactiver la 2FA
    assert service.disable_2fa(user_id) is True
    assert service.is_2fa_enabled(user_id) is False


def test_disable_nonexistent_user():
    """Test la désactivation pour un utilisateur inexistant"""
    service = TwoFactorAuthService()
    user_id = "nonexistent_user"
    
    assert service.disable_2fa(user_id) is False


def test_singleton_service():
    """Test que le service est bien un singleton"""
    service1 = get_2fa_service()
    service2 = get_2fa_service()
    
    assert service1 is service2


def test_verify_code_with_window():
    """Test la vérification avec fenêtre de validité"""
    service = TwoFactorAuthService()
    user_id = "test_user"
    
    secret = service.generate_secret(user_id)
    
    # Générer un code TOTP valide
    import pyotp
    totp = pyotp.TOTP(secret)
    valid_code = totp.now()
    
    # Test avec différentes fenêtres de validité
    assert service.verify_code(user_id, valid_code, valid_window=0) is True
    assert service.verify_code(user_id, valid_code, valid_window=1) is True
    assert service.verify_code(user_id, valid_code, valid_window=2) is True