#!/usr/bin/env node
/**
 * ERC-8004 - Give Feedback to an Agent
 *
 * Usage:
 *   /lyx erc8004:give-feedback --agent-id 8 --value 95 --tag1 "starred"
 *
 * Gives on-chain feedback to a registered agent on the Reputation Registry.
 * Cannot self-rate (agent owner cannot give feedback to own agent).
 */

import { DappCommand, buildExecutePayload } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004GiveFeedbackCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const agentId = args['agent-id'] ? BigInt(args['agent-id']) : null;
    if (!agentId) throw new Error('--agent-id is required');

    const value = args.value ? parseInt(args.value, 10) : 50;
    const valueDecimals = args.decimals ? parseInt(args.decimals, 10) : 0;
    const tag1 = args.tag1 || '';
    const tag2 = args.tag2 || '';

    if (value < -128 || value > 127) {
      throw new Error('--value must be between -128 and 127 (int128, stored as-is)');
    }

    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const rep = new ethers.Contract(
      CONTRACTS.ERC8004_REPUTATION_REGISTRY,
      ABIS.ERC8004_ReputationRegistry,
      provider
    );

    // Check identity registry link
    const identityAddr = await rep.getIdentityRegistry().catch(() => 'error');
    if (identityAddr.toLowerCase() !== CONTRACTS.ERC8004_IDENTITY_REGISTRY.toLowerCase()) {
      throw new Error('Reputation Registry is not linked to the correct Identity Registry');
    }

    // Verify agent exists
    const identityReg = new ethers.Contract(
      CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      ABIS.ERC8004_IdentityRegistry,
      provider
    );
    let agentOwner;
    try {
      agentOwner = await identityReg.ownerOf(agentId);
    } catch {
      throw new Error(`Agent #${agentId} does not exist`);
    }

    if (agentOwner.toLowerCase() === credentials.upAddress.toLowerCase()) {
      throw new Error('Cannot give feedback to your own agent');
    }

    console.log('🔍 ERC-8004 - Give Feedback');
    console.log('');
    console.log(`  Agent ID:  ${agentId.toString()}`);
    console.log(`  Value:     ${value}`);
    console.log(`  Decimals:  ${valueDecimals}`);
    console.log(`  Tag 1:     ${tag1 || '(none)'}`);
    console.log(`  Tag 2:     ${tag2 || '(none)'}`);
    console.log(`  From:      ${credentials.upAddress}`);
    console.log('');

    if (!args.yes) {
      console.log('⚠️  Review the details above. To execute:');
      console.log(`  /lyx erc8004:give-feedback --agent-id ${agentId} --yes`);
      return { skipExecution: true, meta: { status: 'confirm' } };
    }

    // Build giveFeedback call
    const repIface = new ethers.Interface(ABIS.ERC8004_ReputationRegistry);
    const feedbackData = repIface.encodeFunctionData('giveFeedback', [
      agentId,
      BigInt(value),         // int128
      valueDecimals,         // uint8
      tag1,                  // string
      tag2,                  // string
      '',                    // endpoint (optional)
      '',                    // feedbackURI (optional)
      ethers.ZeroHash        // feedbackHash (optional)
    ]);

    const payload = buildExecutePayload(CONTRACTS.ERC8004_REPUTATION_REGISTRY, feedbackData);
    return { payload, meta: { agentId: agentId.toString(), value } };
  }

  onSuccess(result) {
    if (result.meta?.status === 'confirm') return;
    console.log('');
    console.log(`✅ Feedback given to Agent #${result.meta?.agentId}!`);
    console.log(`  Value: ${result.meta?.value}`);
    console.log(`  TX: ${result.transactionHash}`);
  }
}

new ERC8004GiveFeedbackCommand().run();
