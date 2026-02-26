#!/usr/bin/env python3

import json
import os
import sys
from web3 import Web3
from pathlib import Path
from dotenv import load_dotenv

# Load environment
load_dotenv()

print('═' * 59)
print('  COMFORTage T3.3 — Deploying DataIntegrity Contract')
print('  Network: Reltime Mainnet (Chain ID: 32323)')
print('═' * 59)
print()

try:
    # Setup Web3
    rpc_url = os.getenv('RELTIME_RPC_URL', 'https://mainnet.reltime.com/')
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    
    if not w3.is_connected():
        raise Exception("Cannot connect to Reltime RPC")
    
    # Setup account
    private_key = os.getenv('DEPLOYER_PRIVATE_KEY')
    if not private_key:
        raise Exception("DEPLOYER_PRIVATE_KEY not set in .env")
    
    # Ensure key has 0x prefix
    if not private_key.startswith('0x'):
        private_key = '0x' + private_key
    
    account = w3.eth.account.from_key(private_key)
    print(f"Deployer address: {account.address}")
    
    # Check balance
    balance = w3.eth.get_balance(account.address)
    print(f"Deployer balance: {Web3.from_wei(balance, 'ether')} ETH\n")
    
    # Check network
    chain_id = w3.eth.chain_id
    print(f"Chain ID: {chain_id}")
    
    block_number = w3.eth.block_number
    print(f"Current block: {block_number}\n")
    
    # Load contract artifact
    artifact_path = Path(__file__).parent / 'artifacts' / 'contracts' / 'DataIntegrity.sol' / 'DataIntegrity.json'
    with open(artifact_path, 'r') as f:
        artifact = json.load(f)
    
    # Create contract factory
    Contract = w3.eth.contract(
        abi=artifact['abi'],
        bytecode=artifact['bytecode']
    )
    
    print("Deploying DataIntegrity...\n")
    
    # Build transaction
    constructor = Contract.constructor(account.address)
    tx = constructor.build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gas': 10000000,
        'gasPrice': 0,  # Zero gas on Reltime PoA
    })
    
    # Sign and send
    signed_tx = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
    
    print(f"Transaction hash: {tx_hash.hex()}")
    print("Waiting for receipt...\n")
    
    # Wait for receipt
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
    contract_address = receipt['contractAddress']
    
    print(f"✅ DataIntegrity deployed to: {contract_address}\n")
    print('─' * 59)
    print("  IMPORTANT: Update your .env file:")
    print(f"  CONTRACT_ADDRESS={contract_address}")
    print('─' * 59)
    
    # Verify deployed
    code = w3.eth.get_code(contract_address)
    print(f"\n✅ Contract verified on chain (code length: {len(code)} bytes)")
    
    print("\n🎉 Deployment complete!\n")
    
except Exception as e:
    print(f"\n❌ Deployment failed: {str(e)}")
    sys.exit(1)
