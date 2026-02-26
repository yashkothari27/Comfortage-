#!/usr/bin/env node
/**
 * Setup checker - no external dependencies required
 */
const fs = require('fs');
const path = require('path');

// Load .env manually
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    return {};
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    if (line.includes('=') && !line.startsWith('#')) {
      const [key, ...values] = line.split('=');
      env[key.trim()] = values.join('=').trim();
    }
  });
  return env;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMFORTage T3.3 — Setup Verification');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // 1. Check .env
    console.log('📄 Checking .env configuration...');
    const env = loadEnv();
    
    if (!env.DEPLOYER_PRIVATE_KEY) {
      console.error('❌ DEPLOYER_PRIVATE_KEY not set in .env');
      process.exit(1);
    }
    console.log('✅ DEPLOYER_PRIVATE_KEY configured');

    // 2. Test RPC
    console.log('\n🔗 Testing Reltime RPC...');
    const RPC_URL = env.RELTIME_RPC_URL || 'https://mainnet.reltime.com/';
    console.log(`   RPC: ${RPC_URL}`);
    
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
    }).then(r => r.json()).catch(e => ({ error: { message: e.message } }));
    
    if (response.error) {
      console.error(`❌ RPC connection failed: ${response.error.message}`);
      process.exit(1);
    }
    
    const chainId = parseInt(response.result, 16);
    if (chainId !== 32323) {
      console.error(`❌ Wrong chain ID: ${chainId} (expected 32323)`);
      process.exit(1);
    }
    console.log(`✅ Connected to Reltime (Chain ID 32323)`);

    // 3. Check contract artifact
    console.log('\n📦 Checking contract artifact...');
    const artifactPath = path.join(__dirname, 'artifacts/contracts/DataIntegrity.sol/DataIntegrity.json');
    
    if (!fs.existsSync(artifactPath)) {
      console.error(`❌ Contract NOT compiled`);
      console.log(`   Expected: ${artifactPath}`);
      console.log('\n   Run: npm run compile');
      process.exit(1);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    console.log('✅ Contract compiled');
    console.log(`   - Methods: ${artifact.abi.filter(m => m.type === 'function').length}`);

    // 4. Check deployment status
    console.log('\n📋 Deployment status:');
    if (env.CONTRACT_ADDRESS) {
      console.log(`✅ CONTRACT_ADDRESS: ${env.CONTRACT_ADDRESS.substring(0, 10)}...`);
    } else {
      console.log('⚠️  CONTRACT_ADDRESS not set (need to deploy)');
    }

    console.log('\n✅ Setup OK!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

