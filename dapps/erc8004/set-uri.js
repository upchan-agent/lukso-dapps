#!/usr/bin/env node
/**
 * ERC-8004 - Update Agent URI (metadata)
 *
 * Usage:
 *   /lyx erc8004:set-uri --agent-id 8 --name "🆙chan✨" --image "https://..."
 *
 * Updates an agent's registration metadata via setAgentURI().
 * Uses a 2-step process:
 *   Step 1: Build base64-encoded Agent Card
 *   Step 2: Call setAgentURI(agentId, newURI) via UP.execute()
 */

import { DappCommand, buildExecutePayload } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004SetUriCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const agentId = args['agent-id'] ? BigInt(args['agent-id']) : null;
    if (!agentId) {
      throw new Error('--agent-id is required');
    }

    const name = args.name;
    const description = args.description;
    const image = args.image;
    const endpoint = args.endpoint;
    const serviceName = args['service-name'] || 'web';

    if (!name && !description && !image && !endpoint) {
      throw new Error('At least one of --name, --description, --image, or --endpoint is required');
    }

    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const registry = new ethers.Contract(
      CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      ABIS.ERC8004_IdentityRegistry,
      provider
    );

    // Verify agent ownership
    const owner = await registry.ownerOf(agentId);
    if (owner.toLowerCase() !== credentials.upAddress.toLowerCase()) {
      throw new Error(`Agent #${agentId} is not owned by this UP (owner: ${owner})`);
    }

    // Fetch existing metadata
    let existingName = '';
    let existingDesc = '';
    let existingImage = '';
    let existingServices = [];
    let existingTrust = ['reputation'];
    let existingX402 = false;
    let existingActive = true;

    try {
      const existingUri = await registry.tokenURI(agentId);
      if (existingUri.startsWith('data:application/json;base64,')) {
        const b64 = existingUri.split(',')[1];
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const existing = JSON.parse(decoded);
        existingName = existing.name || '';
        existingDesc = existing.description || '';
        existingImage = existing.image || '';
        existingServices = existing.services || [];
        existingTrust = existing.supportedTrust || ['reputation'];
        existingX402 = existing.x402Support || false;
        existingActive = existing.active !== false;
      }
    } catch {
      // No existing metadata, start fresh
    }

    // Merge: keep existing values unless overridden
    const agentCard = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: name || existingName,
      description: description || existingDesc,
      image: image || existingImage,
      services: endpoint ? [...existingServices, { name: serviceName, endpoint }] : existingServices,
      supportedTrust: existingTrust,
      x402Support: existingX402,
      active: existingActive,
      registrations: [],
    };

    const jsonStr = JSON.stringify(agentCard);
    const base64 = Buffer.from(jsonStr).toString('base64');
    const agentURI = `data:application/json;base64,${base64}`;

    // Confirmation mode
    if (!args.yes) {
      console.log('📋 Update Agent #%s Metadata:', agentId.toString());
      console.log('══════════════════════════');
      console.log(`  Name:        ${agentCard.name}`);
      console.log(`  Description: ${agentCard.description}`);
      console.log(`  Image:       ${agentCard.image}`);
      if (endpoint) console.log(`  Endpoint:    ${endpoint}`);
      console.log('══════════════════════════');
      console.log('');
      console.log('⚠️  This action requires a transaction.');
      console.log('');
      console.log('To execute, add --yes flag:');
      console.log(`  /lyx erc8004:set-uri --agent-id ${agentId} --yes`);
      return { skipExecution: true, meta: { status: 'confirm' } };
    }

    // Execute via UP.execute() → registry.setAgentURI()
    const registryIface = new ethers.Interface([
      'function setAgentURI(uint256 agentId, string newURI)'
    ]);
    const setUriData = registryIface.encodeFunctionData('setAgentURI', [agentId, agentURI]);
    const payload = buildExecutePayload(CONTRACTS.ERC8004_IDENTITY_REGISTRY, setUriData);

    return {
      payload,
      meta: { agentId: agentId.toString(), name: agentCard.name }
    };
  }

  onSuccess(result) {
    if (result.meta?.status === 'confirm') {
      // Already printed
    } else {
      console.log('');
      console.log(`✅ Agent #${result.meta?.agentId} metadata updated!`);
      console.log(`  Name: ${result.meta?.name}`);
      console.log(`  TX: ${result.transactionHash}`);
      console.log(`  Explorer: ${result.explorerUrl}`);
      console.log('');
      console.log(`  8004scan:`);
      console.log(`  https://8004scan.io/agents/lukso/${result.meta?.agentId}`);
    }
  }
}

new ERC8004SetUriCommand().run();
