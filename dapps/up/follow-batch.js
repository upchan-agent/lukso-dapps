#!/usr/bin/env node
/**
 * Execute batch follow
 * Uses LSP26 FollowerSystem followBatch
 * Checks follow status and executes only for addresses that are not already followed
 */
import { ethers } from 'ethers';
import { DappCommand, buildUpExecute } from '../../lib/core/command.js';
import { CONTRACTS, CHAINS, ABIS } from '../../lib/core/constants.js';

class FollowBatchCommand extends DappCommand {
  async build({ args, credentials, network }) {
    const targets = args.targets;
    if (!targets) {
      throw new Error('--targets is required');
    }

    const targetAddresses = targets.split(',').map(a => a.trim()).filter(a => a);
    if (targetAddresses.length === 0) {
      throw new Error('No target addresses were provided');
    }

    if (targetAddresses.length > 100) {
      console.log('⚠️ Warning: More than 100 entries may hit the gas limit');
    }

    console.log(`🆙 Batch follow: ${targetAddresses.length} entries`);
    targetAddresses.forEach((addr, i) => {
      console.log(` [${i + 1}] ${addr}`);
    });
    console.log('');

    // Check follow status
    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const lsp26 = new ethers.Contract(CONTRACTS.LSP26, ABIS.LSP26, provider);

    console.log('📋 Checking follow status...');
    const executeTargets = [];
    const skipTargets = [];

    // Check in parallel
    const checkPromises = targetAddresses.map(async (addr) => {
      try {
        const isFollowing = await lsp26.isFollowing(credentials.upAddress, addr);
        return { address: addr, isFollowing };
      } catch (e) {
        console.warn(` ⚠️ Failed to check ${addr}: ${e.message.slice(0, 50)}`);
        return { address: addr, isFollowing: true, error: true }; // Fail safe on error
      }
    });

    const results = await Promise.all(checkPromises);

    for (const result of results) {
      if (result.isFollowing) {
        skipTargets.push(result.address);
        const reason = result.error ? 'check error' : 'already followed';
        console.log(` ❌ ${result.address.slice(0, 10)}... → skipped (${reason})`);
      } else {
        executeTargets.push(result.address);
        console.log(` ✅ ${result.address.slice(0, 10)}... → will execute`);
      }
    }

    console.log('');
    console.log(`Execute: ${executeTargets.length}, Skip: ${skipTargets.length}`);
    console.log('');

    // Skip if there is nothing to execute
    if (executeTargets.length === 0) {
      console.log('⚠️ No targets to execute. Skipping everything.');
      return { skipExecution: true, meta: { total: targetAddresses.length, executed: 0, skipped: skipTargets.length } };
    }

    // Check --yes flag for confirmation mode
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(` /lyx up:follow-batch --targets ${targets} --yes`);
      console.log('');
      return { skipExecution: true, meta: { total: targetAddresses.length, executed: 0, skipped: skipTargets.length, status: 'confirm' } };
    }

    // Batch execute only for executable targets
    console.log(`🔨 Building transaction... (${executeTargets.length} entries)`);
    const lsp26Iface = new ethers.Interface(ABIS.LSP26);
    const data = lsp26Iface.encodeFunctionData('followBatch', [executeTargets]);
    const payload = buildUpExecute(CONTRACTS.LSP26, data);

    return { payload, meta: { total: targetAddresses.length, executed: executeTargets.length, skipped: skipTargets.length } };
  }

  onSuccess(result) {
    const { total, executed, skipped } = result.meta || {};
    if (result.meta?.status === 'confirm') {
      // Confirmation mode - message already printed in build()
    } else {
      console.log(`✅ Batch follow completed: executed ${executed} / ${total}, skipped ${skipped}`);
      console.log(`TX: ${result.transactionHash}`);
      console.log(`Explorer: ${result.explorerUrl}`);
    }
  }
}
new FollowBatchCommand().run();
