from auth import get_jwt_secret, create_internal_token

JWT_SECRET = get_jwt_secret()

token = create_internal_token(JWT_SECRET)

print("\n=== VOTRE TOKEN D'ACCÈS ===")
print(token)
print("===========================\n")
