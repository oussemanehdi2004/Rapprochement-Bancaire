#!/usr/bin/env python3
"""
Script to test data ingestion with sample CSV data
"""
import requests
import os
import jwt
from datetime import datetime, timedelta

# Configuration
MULTI_BANKING_URL = "http://localhost:8010"
SAMPLE_CSV_PATH = "C:\\Users\\user\\OneDrive\\Desktop\\rapprochement-bancaire\\multi-banking\\data\\sample.csv"
INTERNAL_SERVICE_SECRET = "multibanking_dev_secret_456"

# Generate token
payload = {
    "tenantId": "demo_retail",
    "userId": "test",
    "roles": ["ADMIN"],
    "type": "internal"
}
INTERNAL_TOKEN = jwt.encode(payload, INTERNAL_SERVICE_SECRET, algorithm="HS256")

def test_stats_endpoint():
    """Test the stats endpoint"""
    print("Testing /stats endpoint...")
    response = requests.get(f"{MULTI_BANKING_URL}/stats")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    print()

def test_uploads_endpoint():
    """Test the uploads endpoint"""
    print("Testing /uploads endpoint...")
    response = requests.get(f"{MULTI_BANKING_URL}/uploads")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    print()

def test_csv_ingestion():
    """Test CSV file ingestion"""
    print("Testing CSV ingestion...")
    
    if not os.path.exists(SAMPLE_CSV_PATH):
        print(f"Error: Sample CSV file not found at {SAMPLE_CSV_PATH}")
        return
    
    with open(SAMPLE_CSV_PATH, 'rb') as f:
        files = {'file': ('sample.csv', f, 'text/csv')}
        data = {
            'format': 'csv',
            'tenant_id': 'demo_retail',
            'bank_id': 'DEMO_BANK'
        }
        headers = {
            'Authorization': f'Bearer {INTERNAL_TOKEN}'
        }
        
        response = requests.post(
            f"{MULTI_BANKING_URL}/api/multi-banking/ingest",
            files=files,
            data=data,
            headers=headers
        )
        
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        print()

def test_fraud_service():
    """Test fraud service directly"""
    print("Testing fraud service...")
    response = requests.get("http://localhost:8005/")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    print()

if __name__ == "__main__":
    print("=== Data Ingestion Test ===\n")
    print(f"Using token: {INTERNAL_TOKEN[:50]}...\n")
    
    # Test endpoints
    test_stats_endpoint()
    test_uploads_endpoint()
    test_fraud_service()
    
    # Test CSV ingestion
    test_csv_ingestion()
    
    # Check stats after ingestion
    print("Checking stats after ingestion...")
    test_stats_endpoint()
    test_uploads_endpoint()
    
    print("=== Test Complete ===")
