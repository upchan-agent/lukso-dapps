#!/usr/bin/env node
/**
 * Execute follow (single)
 * Uses LSP26 FollowerSystem
 * Checks the follow status and executes only if the target is not already followed
 */
import { ethers } from 'ethers';
import { DappCommand, buildExecutePayload } from '../../lib/core/command.js';
import { CONTRACTS, CHAINS, ABIS } from '../../lib/core/constants.js';
/**
 * FollowCommand - follow command
 */
class FollowCommand extends DappCommand {
  needsCredentials = true;
  defaultNetwork = 'lukso';

  async build({ args, credentials, network }) {
    const target = args.target;
    if (!target) {
      throw new Error('--target is required (address to follow)');
    }

    // Validate address
    if (!ethers.isAddress(target)) {
      throw new Error(`Invalid address: ${target}`);
    }

    console.log(`🆙 Follow: ${target}`);

    // Check follow status
    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const lsp26 = new ethers.Contract(CONTRACTS.LSP26, ABIS.LSP26, provider);

    console.log('📋 Checking follow status...');
    const isFollowing = await lsp26.isFollowing(credentials.upAddress, target);

    if (isFollowing) {
      console.log('⚠️ Already following, so this will be skipped.');
      return { skipExecution: true, meta: { target, status: 'already_following' } };
    }

    console.log('✅ Not following → executing');
    console.log('');

    // Check --yes flag for confirmation mode
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(` /lyx up:follow --target ${target} --yes`);
      console.log('');
      return { skipExecution: true, meta: { target, status: 'confirm' } };
    }

    // Encode LSP26 follow(address)
    const lsp26Iface = new ethers.Interface(ABIS.LSP26);
    const followData = lsp26Iface.encodeFunctionData('follow', [target]);

    // Build UP.execute() payload
    const payload = buildExecutePayload(
      CONTRACTS.LSP26,
      followData
    );

    return {
      payload,
      meta: { target, status: 'executed' }
    };
  }

  onSuccess(result) {
    if (result.meta?.status === 'already_following') {
      console.log(`⚠️ Skipped: ${result.meta.target} is already being followed`);
    } else if (result.meta?.status === 'confirm') {
      // Confirmation mode - message already printed in build()
    } else {
      console.log(`✅ Follow completed: ${result.meta?.target}`);
      console.log(`TX: ${result.transactionHash}`);
      console.log(`Explorer: ${result.explorerUrl}`);
    }
  }
}
new FollowCommand().run();
