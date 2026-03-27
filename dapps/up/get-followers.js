#!/usr/bin/env node
/**
 * Get followers list (LSP26)
 * Retrieves addresses that are following the UP
 * 
 * Usage:
 *   /lyx up:get-followers --address 0x... [--network lukso] [--limit 100]
 */
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { CHAINS, CONTRACTS, ABIS } from '../../lib/core/constants.js';

class GetFollowersCommand extends DappCommand {
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

    console.log(`🔍 Fetching followers for: ${upAddress}`);
    console.log(`🌐 Network: ${network}`);
    console.log('');

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const lsp26 = new ethers.Contract(CONTRACTS.LSP26, ABIS.LSP26, provider);

    // Get follower count
    const count = await lsp26.followerCount(upAddress);
    console.log(`📊 Follower count: ${count.toString()}`);

    if (count === 0n) {
      console.log('');
      console.log('No followers yet.');
      return { skipExecution: true, meta: { count: 0, followers: [] } };
    }

    // Get followers list (batch by 50)
    const batchSize = 50n;
    const allFollowers = [];
    
    let start = 0n;
    let remaining = count;
    let fetched = 0;

    while (remaining > 0n && fetched < limit) {
      const end = start + (remaining > batchSize ? batchSize : remaining);
      console.log(`📋 Fetching ${start}-${end}...`);
      
      try {
        const batch = await lsp26.getFollowersByIndex(upAddress, start, end - 1n);
        allFollowers.push(...batch);
        fetched += batch.length;
      } catch (err) {
        console.error(`❌ Error fetching batch: ${err.message}`);
        break;
      }
      
      start = end;
      remaining -= batchSize;
    }

    console.log('');
    console.log(`✅ Found ${allFollowers.length} followers:\n`);

    // Display results
    for (let i = 0; i < allFollowers.length && i < limit; i++) {
      console.log(`${i + 1}. ${allFollowers[i]}`);
    }

    if (allFollowers.length > limit) {
      console.log(`\n... and ${allFollowers.length - limit} more (use --limit to see more)`);
    }

    return {
      skipExecution: true,
      meta: {
        count: Number(count),
        followers: allFollowers.slice(0, limit)
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

new GetFollowersCommand().run();