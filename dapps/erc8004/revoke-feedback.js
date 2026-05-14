#!/usr/bin/env node
/**
 * ERC-8004 - Revoke Feedback
 *
 * Usage:
 *   /lyx erc8004:revoke-feedback --agent-id 8 --feedback-index 1
 *
 * Revokes previously given feedback. Only the feedback giver can revoke.
 */

import { DappCommand, buildExecutePayload } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004RevokeFeedbackCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const rawAgentId = args['agent-id'];
    if (rawAgentId === undefined) throw new Error('--agent-id is required');
    const agentId = BigInt(rawAgentId);

    const feedbackIndex = args['feedback-index'] ? BigInt(args['feedback-index']) : null;
    if (!feedbackIndex) throw new Error('--feedback-index is required');

    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);

    // Verify feedback exists
    const rep = new ethers.Contract(
      CONTRACTS.ERC8004_REPUTATION_REGISTRY,
      ABIS.ERC8004_ReputationRegistry,
      provider
    );
    const lastIdx = await rep.getLastIndex(agentId, credentials.upAddress);
    if (feedbackIndex > lastIdx) {
      throw new Error(`Feedback index ${feedbackIndex} does not exist (last: ${lastIdx})`);
    }

    console.log('🔍 ERC-8004 - Revoke Feedback');
    console.log('');
    console.log(`  Agent ID:      ${agentId.toString()}`);
    console.log(`  Feedback Indx: ${feedbackIndex.toString()}`);
    console.log('');

    if (!args.yes) {
      console.log('⚠️  This cannot be undone. To execute:');
      console.log(`  /lyx erc8004:revoke-feedback --agent-id ${agentId} --feedback-index ${feedbackIndex} --yes`);
      return { skipExecution: true, meta: { status: 'confirm' } };
    }

    const repIface = new ethers.Interface(ABIS.ERC8004_ReputationRegistry);
    const revokeData = repIface.encodeFunctionData('revokeFeedback', [agentId, feedbackIndex]);
    const payload = buildExecutePayload(CONTRACTS.ERC8004_REPUTATION_REGISTRY, revokeData);
    return { payload, meta: { agentId: agentId.toString(), feedbackIndex: feedbackIndex.toString() } };
  }

  onSuccess(result) {
    if (result.meta?.status === 'confirm') return;
    console.log('');
    console.log(`✅ Feedback #${result.meta?.feedbackIndex} revoked for Agent #${result.meta?.agentId}!`);
    console.log(`  TX: ${result.transactionHash}`);
  }
}

new ERC8004RevokeFeedbackCommand().run();
