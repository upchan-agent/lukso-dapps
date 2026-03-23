#!/usr/bin/env node
/**
 * Execute unfollow (single)
 * Uses LSP26 FollowerSystem
 * Checks the follow status and executes only if the target is currently followed
 */
import { ethers } from 'ethers';
import { DappCommand, buildUpExecute } from '../../lib/core/command.js';
import { CONTRACTS, CHAINS, ABIS } from '../../lib/core/constants.js';

class UnfollowCommand extends DappCommand {
  async build({ args, credentials, network }) {
    const target = args.target;
    if (!target) {
      throw new Error('--target is required');
    }
    if (!ethers.isAddress(target)) {
      throw new Error(`Invalid address: ${target}`);
    }

    console.log(`🆙 Unfollow: ${target}`);

    // Check follow status
    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const lsp26 = new ethers.Contract(CONTRACTS.LSP26, ABIS.LSP26, provider);

    console.log('📋 Checking follow status...');
    const isFollowing = await lsp26.isFollowing(credentials.upAddress, target);

    if (!isFollowing) {
      console.log('⚠️ Not following, so this will be skipped.');
      return { skipExecution: true, meta: { target, status: 'not_following' } };
    }

    console.log('✅ Currently following → executing');
    console.log('');

    const lsp26Iface = new ethers.Interface(ABIS.LSP26);
    const data = lsp26Iface.encodeFunctionData('unfollow', [target]);
    const payload = buildUpExecute(credentials.upAddress, CONTRACTS.LSP26, data);

    return { payload, meta: { target, status: 'executed' } };
  }

  onSuccess(result) {
    if (result.meta.status === 'not_following') {
      console.log(`⚠️ Skipped: ${result.meta.target} is not currently followed`);
    } else {
      console.log(`✅ Unfollow completed: ${result.meta.target}`);
      console.log(`TX: ${result.transactionHash}`);
      console.log(`Explorer: ${result.explorerUrl}`);
    }
  }
}
new UnfollowCommand().run();
