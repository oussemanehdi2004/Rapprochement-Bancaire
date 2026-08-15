"""
Service d'authentification 2FA basique utilisant pyotp (TOTP).
Permet de générer des secrets TOTP et de vérifier les codes de 6 chiffres.
"""
import pyotp
import os
from typing import Optional, Tuple
from datetime import datetime, timedelta


class TwoFactorAuthService:
    """Service pour gérer l'authentification à deux facteurs (2FA)"""
    
    def __init__(self):
        # En production, stocker les secrets dans une base de données sécurisée
        # Pour ce prototype, nous utilisons un dictionnaire en mémoire
        self.user_secrets = {}
    
    def generate_secret(self, user_id: str) -> str:
        """
        Génère un nouveau secret TOTP pour un utilisateur.
        
        Args:
            user_id: Identifiant de l'utilisateur
            
        Returns:
            Le secret TOTP (base32)
        """
        secret = pyotp.random_base32()
        self.user_secrets[user_id] = secret
        return secret
    
    def get_provisioning_uri(self, user_id: str, issuer_name: str = "FraudDetection") -> str:
        """
        Génère l'URI de provisioning pour les applications d'authentification
        (Google Authenticator, Authy, etc.)
        
        Args:
            user_id: Identifiant de l'utilisateur
            issuer_name: Nom de l'application/émetteur
            
        Returns:
            URI otpauth://totp/... pour scan QR code
        """
        secret = self.user_secrets.get(user_id)
        if not secret:
            raise ValueError(f"Secret non trouvé pour l'utilisateur {user_id}")
        
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(
            name=user_id,
            issuer_name=issuer_name
        )
    
    def verify_code(self, user_id: str, code: str, valid_window: int = 1) -> bool:
        """
        Vérifie un code TOTP à 6 chiffres.
        
        Args:
            user_id: Identifiant de l'utilisateur
            code: Code TOTP à 6 chiffres
            valid_window: Fenêtre de validité (nombre de périodes passées/futures acceptées)
            
        Returns:
            True si le code est valide, False sinon
        """
        secret = self.user_secrets.get(user_id)
        if not secret:
            return False
        
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=valid_window)
    
    def generate_backup_codes(self, user_id: str, count: int = 10) -> list[str]:
        """
        Génère des codes de secours uniques pour l'utilisateur.
        
        Args:
            user_id: Identifiant de l'utilisateur
            count: Nombre de codes de secours à générer
            
        Returns:
            Liste des codes de secours
        """
        import secrets
        backup_codes = []
        
        for _ in range(count):
            # Générer un code aléatoire de 8 caractères hexadécimaux
            code = secrets.token_hex(4).upper()
            backup_codes.append(code)
        
        # En production, stocker ces codes de manière sécurisée (hashée)
        # Pour ce prototype, nous les stockons en mémoire
        if not hasattr(self, 'backup_codes'):
            self.backup_codes = {}
        self.backup_codes[user_id] = backup_codes
        
        return backup_codes
    
    def verify_backup_code(self, user_id: str, code: str) -> bool:
        """
        Vérifie un code de secours et le supprime après utilisation.
        
        Args:
            user_id: Identifiant de l'utilisateur
            code: Code de secours à vérifier
            
        Returns:
            True si le code est valide, False sinon
        """
        if not hasattr(self, 'backup_codes') or user_id not in self.backup_codes:
            return False
        
        backup_codes = self.backup_codes[user_id]
        code_upper = code.upper()
        
        try:
            if code_upper in backup_codes:
                backup_codes.remove(code_upper)
                return True
        except ValueError:
            # Code déjà utilisé ou non trouvé
            pass
        
        return False
    
    def is_2fa_enabled(self, user_id: str) -> bool:
        """
        Vérifie si la 2FA est activée pour un utilisateur.
        
        Args:
            user_id: Identifiant de l'utilisateur
            
        Returns:
            True si la 2FA est activée, False sinon
        """
        return user_id in self.user_secrets
    
    def disable_2fa(self, user_id: str) -> bool:
        """
        Désactive la 2FA pour un utilisateur.
        
        Args:
            user_id: Identifiant de l'utilisateur
            
        Returns:
            True si la désactivation a réussi, False sinon
        """
        if user_id in self.user_secrets:
            del self.user_secrets[user_id]
            if hasattr(self, 'backup_codes') and user_id in self.backup_codes:
                del self.backup_codes[user_id]
            return True
        return False


# Instance globale du service 2FA
_2fa_service = None

def get_2fa_service() -> TwoFactorAuthService:
    """Retourne l'instance singleton du service 2FA"""
    global _2fa_service
    if _2fa_service is None:
        _2fa_service = TwoFactorAuthService()
    return _2fa_service