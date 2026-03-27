#!/usr/bin/env node
/**
 * Get following list (LSP26)
 * Retrieves addresses that the UP is following
 * 
 * Usage:
 *   /lyx up:get-follows --address 0x... [--network lukso] [--limit 100]
 */
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { CHAINS, CONTRACTS, ABIS } from '../../lib/core/constants.js';

class GetFollowsCommand extends DappCommand {
  needsCredentials = false; // Read-only, no credentials loaded

  async build({ args }) {
    const network = args.network || 'lukso';
    const chainConfig = CHAINS[network] || CHAINS.lukso;

    // --address is required (no fallback to credentials)
    const upAddress = args.address;
    if (!upAddress) {
      throw new Error('--address is required');
    }

    const limit = parseInt(args.limit) || 100;

    console.log(`🔍 Fetching following list for: ${upAddress}`);
    console.log(`🌐 Network: ${network}`);
    console.log('');

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const lsp26 = new ethers.Contract(CONTRACTS.LSP26, ABIS.LSP26, provider);

    // Get following count
    const count = await lsp26.followingCount(upAddress);
    console.log(`📊 Following count: ${count.toString()}`);

    if (count === 0n) {
      console.log('');
      console.log('Not following anyone yet.');
      return { skipExecution: true, meta: { count: 0, following: [] } };
    }

    // Get following list (batch by 50)
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

    return {
      skipExecution: true,
      meta: {
        count: Number(count),
        following: allFollowing.slice(0, limit)
      }
    };
  }

  onSuccess(result) {
    // Read-only command - no transaction to display
    if (!result.transactionHash) {
      return; // Already printed in build()
    }
  }
}

new GetFollowsCommand().run();