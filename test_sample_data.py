"""
Script to add sample transaction data to the fraud detection system for testing
"""
import os
import urllib.request
import urllib.error
import json
import random
from datetime import datetime, timedelta

# Set environment variables for local testing
os.environ['SUPABASE_URL'] = 'https://hvcutkijzcbfsfgkbvul.supabase.co'
os.environ['SUPABASE_KEY'] = 'sb_publishable_c0fuF0cVUmz83er5D8MBKQ_vCMl5Dyj'

def generate_test_transactions(count=10):
    """Generate test transaction data"""
    transactions = []
    base_date = datetime.now()
    
    for i in range(count):
        # Mix of normal and suspicious transactions
        is_suspicious = i < 3  # First 3 are suspicious
        
        amount = random.uniform(100, 50000) if is_suspicious else random.uniform(50, 2000)
        
        transaction = {
            "tenant_id": "default",
            "transaction_reference": f"TXN-{i+1:06d}",
            "id": f"tx_{i+1}",
            "date": (base_date - timedelta(days=random.randint(0, 30))).isoformat(),
            "description": f"Test transaction {i+1}",
            "amount": amount,
            "sender_balance_before": random.uniform(1000, 10000),
            "sender_balance_after": random.uniform(1000, 10000) - amount,
            "receiver_balance_before": random.uniform(500, 5000),
            "receiver_balance_after": random.uniform(500, 5000) + amount,
            "transaction_type": "TRANSFER",
            "account_iban": f"FR76{random.randint(10000000000, 99999999999)}",
            "beneficiary_iban": f"FR76{random.randint(10000000000, 99999999999)}",
            "sender_account": f"FR76{random.randint(10000000000, 99999999999)}",
            "receiver_account": f"FR76{random.randint(10000000000, 99999999999)}"
        }
        transactions.append(transaction)
    
    return transactions

def send_to_fraud_service(transactions):
    """Send transactions to fraud detection service"""
    url = "http://127.0.0.1:8005/api/analyze"
    
    data = json.dumps(transactions).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = response.read().decode()
            print(f"[OK] Successfully sent {len(transactions)} transactions to fraud service")
            print(f"Response: {result[:200]}...")
            return True
    except Exception as e:
        print(f"[ERROR] Error sending to fraud service: {e}")
        return False

def send_to_supabase(transactions):
    """Send transactions directly to Supabase REST API"""
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_KEY')
    
    if not supabase_url or not supabase_key:
        print("[ERROR] SUPABASE_URL or SUPABASE_KEY not set")
        return False
    
    url = f"{supabase_url}/rest/v1/fraud_alerts"
    
    for tx in transactions:
        try:
            data = json.dumps({
                "tenant_id": tx["tenant_id"],
                "transaction_reference": tx["transaction_reference"],
                "transaction_id": tx["id"],
                "date": tx["date"],
                "description": tx["description"],
                "amount": tx["amount"],
                "is_fraud": False,
                "fraud_probability": 0.0,
                "reconciliation_status": "UNMATCHED",
                "rule_category": "NON_CATEGORISE"
            }).encode('utf-8')
            
            req = urllib.request.Request(url, data=data, method='POST')
            req.add_header('Content-Type', 'application/json')
            req.add_header('apikey', supabase_key)
            req.add_header('Authorization', f'Bearer {supabase_key}')
            req.add_header('Prefer', 'return=minimal')
            
            with urllib.request.urlopen(req, timeout=30) as response:
                if response.status in (200, 201):
                    print(f"[OK] Added transaction {tx['id']} to Supabase")
                else:
                    print(f"[ERROR] Failed to add transaction {tx['id']}: {response.status}")
                    return False
        except urllib.error.HTTPError as e:
            print(f"[ERROR] HTTP Error adding transaction {tx['id']}: {e.code} - {e.read().decode()}")
            return False
        except Exception as e:
            print(f"[ERROR] Error adding transaction {tx['id']} to Supabase: {e}")
            return False
    
    print(f"[OK] Successfully added {len(transactions)} transactions to Supabase")
    return True

if __name__ == "__main__":
    print("Generating test transaction data...")
    transactions = generate_test_transactions(15)
    
    print(f"Sending {len(transactions)} transactions to Supabase...")
    success = send_to_supabase(transactions)
    
    if success:
        print("\n[OK] Test data successfully added to Supabase")
        print("You can now test the frontend at http://localhost:4200")
    else:
        print("\n[ERROR] Failed to add test data to Supabase")
        print("Trying to send to fraud service instead...")
        success = send_to_fraud_service(transactions)
        
        if success:
            print("\n[OK] Test data successfully added to fraud detection system")
            print("You can now test the frontend at http://localhost:4200")
        else:
            print("\n[ERROR] Failed to add test data")
