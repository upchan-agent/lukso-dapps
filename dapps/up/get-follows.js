#!/usr/bin/env node
/**
 * Get following list (LSP26)
 * Retrieves addresses that the UP is following
 */
import { ethers } from 'ethers';
import { CHAINS, CONTRACTS, ABIS } from '../../lib/core/constants.js';

const USAGE = `
Usage:
  /lyx up:get-follows [--up 0x...] [--network lukso]

Options:
  --up       UP address to check (default: from credentials)
  --network  Network to use (default: lukso)
  --limit    Max results to return (default: 100)
`;

async function main() {
  // Parse arguments properly (handle --key value and --key=value formats)
  const args = {};
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next arg is value (not another flag)
      const nextArg = process.argv[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        args[key] = nextArg;
        i++; // Skip next arg
      } else {
        args[key] = true;
      }
    }
  }

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const network = args.network || 'lukso';
  const chainConfig = CHAINS[network];
  
  if (!chainConfig) {
    console.error(`❌ Unknown network: ${network}`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const lsp26 = new ethers.Contract(CONTRACTS.LSP26, ABIS.LSP26, provider);

  // Get UP address
  let upAddress = args.up;
  
  if (!upAddress) {
    // Try to get from credentials
    const { loadCredentials } = await import('../../lib/shared/credentials.js');
    const credentials = await loadCredentials(network);
    upAddress = credentials.upAddress;
  }

  if (!upAddress) {
    console.error('❌ UP address required. Use --up or set credentials.');
    process.exit(1);
  }

  console.log(`🔍 Fetching following list for: ${upAddress}`);
  console.log(`🌐 Network: ${network}`);
  console.log('');

  // Get following count
  const count = await lsp26.followingCount(upAddress);
  console.log(`📊 Following count: ${count.toString()}`);

  if (count === 0n) {
    console.log('');
    console.log('Not following anyone yet.');
    return;
  }

  // Get following list (batch by 50 to avoid gas limits)
  const limit = parseInt(args.limit) || 100;
  const batchSize = 50n;
  const allFollowing = [];
  
  let start = 0n;
  let remaining = count;
  let fetched = 0;

  while (remaining > 0n && fetched < limit) {
    const end = start + (remaining > batchSize ? batchSize : remaining);
    console.log(`📋 Fetching ${start}-${end}...`);
    
    try {
      const batch = await lsp26.getFollowsByIndex(upAddress, start, end - 1n);
      allFollowing.push(...batch);
      fetched += batch.length;
    } catch (err) {
      console.error(`❌ Error fetching batch: ${err.message}`);
      break;
    }
    
    start = end;
    remaining -= batchSize;
  }

  console.log('');
  console.log(`✅ Found ${allFollowing.length} following:\n`);

  // Display results
  for (let i = 0; i < allFollowing.length && i < limit; i++) {
    console.log(`${i + 1}. ${allFollowing[i]}`);
  }

  if (allFollowing.length > limit) {
    console.log(`\n... and ${allFollowing.length - limit} more (use --limit to see more)`);
  }

  // Return as JSON for programmatic use
  if (args.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify(allFollowing, null, 2));
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});