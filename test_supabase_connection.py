"""
Test Supabase connection directly
"""
import os
import urllib.request
import urllib.error
import json

os.environ['SUPABASE_URL'] = 'https://hvcutkijzcbfsfgkbvul.supabase.co'
os.environ['SUPABASE_KEY'] = 'sb_publishable_c0fuF0cVUmz83er5D8MBKQ_vCMl5Dyj'

supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_KEY')

print(f"Testing connection to Supabase...")
print(f"URL: {supabase_url}")
print(f"Key: {supabase_key[:20]}...")

# Test basic connection
try:
    req = urllib.request.Request(supabase_url)
    req.add_header('apikey', supabase_key)
    with urllib.request.urlopen(req, timeout=10) as response:
        print(f"[OK] Basic connection successful: {response.status}")
except Exception as e:
    print(f"[ERROR] Basic connection failed: {e}")

# Test API endpoint
try:
    url = f"{supabase_url}/rest/v1/fraud_alerts?select=*&limit=1"
    req = urllib.request.Request(url)
    req.add_header('apikey', supabase_key)
    req.add_header('Authorization', f'Bearer {supabase_key}')
    with urllib.request.urlopen(req, timeout=10) as response:
        data = response.read().decode()
        print(f"[OK] API endpoint successful: {response.status}")
        print(f"Data: {data[:200]}...")
except Exception as e:
    print(f"[ERROR] API endpoint failed: {e}")
