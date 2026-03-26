#!/usr/bin/env node
/**
 * Universal Trust - Endorsement
 * Endorse agent
 * Website https://universal-trust.vercel.app/ (Agents will fail to fetch, so ask your owner to check)
 */

import { ethers } from 'ethers';
import { DappCommand, buildUpExecute } from '../../lib/core/command.js';
import { CONTRACTS, ABIS } from '../../lib/core/constants.js';

class EndorseCommand extends DappCommand {
  async build({ args, credentials }) {
    const target = args.target;
    if (!target) {
      throw new Error('--target is required\nUsage: /lyx universal-trust:endorse --target 0x... --reason "Great agent!"');
    }

    const reason = args.reason || 'Recommended';

    console.log('🆙 Universal Trust Endorsement');
    console.log(`  Target: ${target}`);
    console.log(`  Reason: ${reason}`);
    console.log(`  Registry: ${CONTRACTS.UNIVERSAL_TRUST_REGISTRY}`);
    console.log('');

    // Check for --yes flag to confirm execution
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(` /lyx universal-trust:endorse --yes`);
      console.log('');
      return { skipExecution: true };
    }

    const registryIface = new ethers.Interface(ABIS.UniversalTrustRegistry);
    const endorseData = registryIface.encodeFunctionData('endorse', [target, reason]);

    const payload = buildUpExecute(credentials.upAddress, CONTRACTS.UNIVERSAL_TRUST_REGISTRY, endorseData);

    return { payload, meta: { target, reason } };
  }

  onSuccess(result) {
    console.log('');
    console.log('✅ Endorsement complete!');
    console.log(`TX: ${result.transactionHash}`);
    console.log(`Explorer: ${result.explorerUrl}`);
  }
}

new EndorseCommand().run();