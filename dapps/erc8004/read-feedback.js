#!/usr/bin/env node
/**
 * ERC-8004 - Read feedback for an agent
 *
 * Usage:
 *   /lyx erc8004:read-feedback --agent-id 8
 *
 * Reads feedback entries for a registered agent from the Reputation Registry.
 */

import { DappCommand } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004ReadFeedbackCommand extends DappCommand {
  needsCredentials = false;

  async build({ args, network }) {
    const agentId = args['agent-id'] ? BigInt(args['agent-id']) : null;
    if (!agentId) {
      throw new Error('--agent-id is required');
    }

    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const rep = new ethers.Contract(
      CONTRACTS.ERC8004_REPUTATION_REGISTRY,
      [
        ...ABIS.ERC8004_ReputationRegistry,
        'function getIdentityRegistry() view returns (address)',
      ],
      provider
    );

    // Verify agent exists
    const identityReg = new ethers.Contract(
      CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      ABIS.ERC8004_IdentityRegistry,
      provider
    );

    try {
      const owner = await identityReg.ownerOf(agentId);
      console.log('🔍 ERC-8004 - Read Feedback');
      console.log('');
      console.log(`  Agent ID:  ${agentId.toString()}`);
      console.log(`  Owner:     ${owner}`);
    } catch {
      throw new Error(`Agent #${agentId} does not exist`);
    }

    console.log('');

    // Get clients who gave feedback
    const clients = await rep.getClients(agentId).catch(() => []);
    if (clients.length === 0) {
      console.log('  No feedback yet.');
      return { skipExecution: true, meta: { agentId: agentId.toString() } };
    }

    console.log(`  Feedback entries: (${clients.length} clients)`);
    console.log('');

    for (const client of clients) {
      const lastIdx = await rep.getLastIndex(agentId, client);
      for (let idx = 1n; idx <= lastIdx; idx++) {
        try {
          const fb = await rep.readFeedback(agentId, client, idx);
          const { 0: value, 1: valueDecimals, 2: tag1, 3: tag2, 4: isRevoked } = fb;
          const displayValue = Number(value) / (10 ** Number(valueDecimals));
          console.log(`  Client: ${client}`);
          console.log(`    Index:  ${idx.toString()}`);
          console.log(`    Value:  ${displayValue}${tag1 ? ` (${tag1})` : ''}${tag2 ? ` / ${tag2}` : ''}`);
          console.log(`    Status: ${isRevoked ? '❌ REVOKED' : '✅ Active'}`);
          console.log('');
        } catch {
          // skip
        }
      }
    }

    return { skipExecution: true, meta: { agentId: agentId.toString() } };
  }
}

new ERC8004ReadFeedbackCommand().run();
