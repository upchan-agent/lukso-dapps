#!/usr/bin/env node
/**
 * Agent Token Claimer - Claim Token
 * 
 * Usage:
 *   /lyx claim --token <address> [--codeword <string>] [--network <network>]
 * 
 * Claims LSP7/LSP8 tokens from Agent Token Claimer drops via Universal Profile.
 */

import { DappCommand, CHAINS, buildUpExecute, encodeFunctionCall } from '../../lib/core/index.js';
import { ethers } from 'ethers';

// ═══════════════════════════════════════════════════════════
// Constants (Agent Token Claimer specific)
// ═══════════════════════════════════════════════════════════

// Drop contract ABI for claiming
const DROP_CLAIM_ABI = [
  'function claim() external',
  'function claimWithCode(string) external',
  'function isClaimActive() view returns (bool)',
  'function hasClaimed(address) view returns (bool)',
  'function meetsRequirements(address) view returns (bool tokenOk, bool followersOk)',
  'function codewordEnabled() view returns (bool)',
];

// ═══════════════════════════════════════════════════════════
// ClaimCommand
// ═══════════════════════════════════════════════════════════

class ClaimCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const tokenAddr = args['token'];
    const codeword = args['codeword'];
    const selectedNetwork = network || 'lukso';
    const chainConfig = CHAINS[selectedNetwork] || CHAINS.lukso;

    // Validate required arguments
    if (!tokenAddr) {
      throw new Error('--token is required (token contract address)');
    }

    if (!ethers.isAddress(tokenAddr)) {
      throw new Error('Invalid token address format');
    }

    // Setup provider and contract for pre-check
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const drop = new ethers.Contract(tokenAddr, DROP_CLAIM_ABI, provider);

    // Pre-check eligibility (read-only)
    console.log('');
    console.log('🔍 Pre-check Eligibility');
    console.log(`   Token: ${tokenAddr}`);
    console.log(`   UP: ${credentials.upAddress}`);
    console.log(`   Network: ${chainConfig.name}`);
    console.log('');

    console.log('   Checking claim status...');
    const claimActive = await drop.isClaimActive();
    if (!claimActive) {
      throw new Error('Claim period is not active');
    }
    console.log('   ✅ Claim is active');

    console.log('   Checking if already claimed...');
    const hasClaimed = await drop.hasClaimed(credentials.upAddress);
    if (hasClaimed) {
      throw new Error('You have already claimed this token');
    }
    console.log('   ✅ Not claimed yet');

    console.log('   Checking requirements...');
    const { tokenOk, followersOk } = await drop.meetsRequirements(credentials.upAddress);
    if (!tokenOk || !followersOk) {
      throw new Error(`Requirements not met (token: ${tokenOk}, followers: ${followersOk})`);
    }
    console.log('   ✅ Requirements met');

    console.log('   Checking codeword...');
    const codewordEnabled = await drop.codewordEnabled();
    if (codewordEnabled && !codeword) {
      throw new Error('Codeword is required for this drop');
    }
    if (codewordEnabled) {
      console.log('   ✅ Codeword provided');
    } else {
      console.log('   ✅ No codeword required');
    }

    console.log('');
    console.log('📝 Encoding claim function...');

    // Encode claim function
    let data;
    if (codeword) {
      console.log('   Using claimWithCode()');
      data = encodeFunctionCall(
        'function claimWithCode(string) external',
        'claimWithCode',
        [codeword]
      );
    } else {
      console.log('   Using claim()');
      data = encodeFunctionCall(
        'function claim() external',
        'claim',
        []
      );
    }

    console.log(`   Payload length: ${data.length} bytes`);
    console.log('');

    // Build UP.execute() payload
    const payload = buildUpExecute(credentials.upAddress, tokenAddr, data);

    console.log('✅ Ready to claim!');
    console.log('');

    // Check --yes flag for confirmation mode
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(`   /lyx agent-token-claimer:claim --token ${tokenAddr} --yes`);
      console.log('');
      return { skipExecution: true };
    }

    return {
      payload,
      meta: {
        tokenAddr,
        codeword: !!codeword,
        network: selectedNetwork,
      }
    };
  }

  /**
   * Success handler
   */
  onSuccess(result, context) {
    console.log('🎉 Claim Successful!');
    console.log('');
    console.log(`   Token: ${context.meta.tokenAddr}`);
    console.log(`   TX Hash: ${result.transactionHash}`);
    console.log(`   Explorer: ${result.explorerUrl}`);
    console.log('');
  }

  /**
   * Error handler
   */
  onError(error, context) {
    console.log('');
    console.log('❌ Claim Failed');
    console.log('');
    console.log(`   Error: ${error.message}`);
    console.log('');
    console.log('   Possible reasons:');
    console.log('   - Claim period ended');
    console.log('   - Already claimed');
    console.log('   - Requirements not met');
    console.log('   - Codeword required but not provided');
    console.log('   - Gas estimation failed');
    console.log('');
    console.log('   Tip: Run claim:check first to verify eligibility');
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════

new ClaimCommand().run();
