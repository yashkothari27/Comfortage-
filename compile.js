#!/usr/bin/env node
/**
 * Compile script for Hardhat
 */
const path = require('path');
const hh = require('hardhat');

async function main() {
  console.log('Compiling smart contracts...\n');
  try {
    //Initialize Hardhat runtime environment
    const config = hh.config;
    
    // Run compilation task
    await hh.run('compile', { force: process.argv[2] === '--force' });
    
    console.log('\n✅ Compilation successful!');
    console.log('   Artifacts saved to: ./artifacts/contracts/\n');
  } catch (error) {
    console.error('❌ Compilation failed:', error.message);
    process.exit(1);
  }
}

main();
