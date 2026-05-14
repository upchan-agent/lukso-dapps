#!/usr/bin/env node
/**
 * ERC-8004 - Get Agent Info
 *
 * Usage:
 *   /lyx erc8004:info --agent-id 8
 *   /lyx erc8004:info --address 0x...
 *
 * Shows agent registration details from the Identity Registry.
 */

import { DappCommand } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

/**
 * Display details for a single agent
 */
async function displayAgentInfo(registry, agentId, chainName) {
  try {
    const owner = await registry.ownerOf(agentId);
    let uri = '';
    try { uri = await registry.tokenURI(agentId); } catch { uri = '(not set)'; }
    let wallet = '';
    try { wallet = await registry.getAgentWallet(agentId); } catch { wallet = '(not set)'; }

    console.log(`  ── Agent #${agentId.toString()} ──`);
    console.log(`    Owner:   ${owner}`);
    console.log(`    Wallet:  ${wallet}`);

    if (uri.startsWith('data:application/json;base64,')) {
      try {
        const b64 = uri.split(',')[1];
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const data = JSON.parse(decoded);
        console.log(`    Name:    ${data.name || 'N/A'}`);
        console.log(`    Desc:    ${(data.description || 'N/A').substring(0, 200)}`);
        console.log(`    Image:   ${data.image || 'N/A'}`);
        if (data.services?.length > 0) {
          console.log(`    Service: ${JSON.stringify(data.services)}`);
        }
        console.log(`    Active:  ${data.active !== false ? '✅' : '❌'}`);
      } catch {
        console.log(`    URI:     ${uri.substring(0, 80)}...`);
      }
    } else if (uri.startsWith('ipfs://')) {
      console.log(`    URI:     ${uri}`);
    } else if (uri && uri !== '(not set)') {
      console.log(`    URI:     ${uri.substring(0, 80)}`);
    }

    console.log('');
    console.log(`    8004scan: https://8004scan.io/agents/lukso/${agentId.toString()}`);
    return { skipExecution: true, meta: { status: 'success', agentId: agentId.toString() } };
  } catch (e) {
    throw new Error(`Agent #${agentId} not found: ${e.message.substring(0, 60)}`);
  }
}

class ERC8004InfoCommand extends DappCommand {
  needsCredentials = false;

  async build({ args, credentials, network }) {
    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const registry = new ethers.Contract(
      CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      [
        ...ABIS.ERC8004_IdentityRegistry,
        'function name() view returns (string)',
        'function symbol() view returns (string)',
      ],
      provider
    );

    const address = args.address || credentials?.upAddress;
    const searchId = args['agent-id'] ? BigInt(args['agent-id']) : null;

    if (!address && searchId === null) {
      console.log('⚠️  Specify --address or --agent-id.');
      console.log('  /lyx erc8004:info --agent-id 8');
      console.log('  /lyx erc8004:info --address 0x...');
      return { skipExecution: true, meta: { status: 'no_params' } };
    }

    console.log('🔍 ERC-8004 - Agent Info');
    console.log('');
    if (searchId !== null) {
      console.log(`  Agent ID:  ${searchId.toString()}`);
      console.log(`  Network:   ${chain.name}`);
      console.log('');
      return await displayAgentInfo(registry, searchId, chain.name);
    }

    // Check by address
    console.log(`  Address:   ${address}`);
    console.log(`  Network:   ${chain.name}`);
    console.log('');

    const balance = await registry.balanceOf(address).catch(() => 0n);
    console.log(`  Agent Count: ${balance}`);

    if (balance === 0n) {
      console.log('');
      console.log('⚠️  No agents registered for this address.');
      console.log('');
      console.log('  Register: /lyx erc8004:register --name "Agent Name"');
      return { skipExecution: true, meta: { status: 'no_agents', address } };
    }

    // Find agent IDs via Transfer events
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const mintLogs = await provider.getLogs({
      address: CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      topics: [transferTopic, '0x0000000000000000000000000000000000000000000000000000000000000000', null, null],
      fromBlock: 0,
      toBlock: 'latest'
    }).catch(() => []);

    const agentIds = [];
    for (const log of mintLogs) {
      const tokenId = BigInt(log.topics[3]);
      try {
        const currentOwner = await registry.ownerOf(tokenId);
        if (currentOwner.toLowerCase() === address.toLowerCase()) {
          agentIds.push(tokenId);
        }
      } catch { /* skip burned */ }
    }

    for (const agentId of agentIds) {
      console.log('');
      await displayAgentInfo(registry, agentId, chain.name);
    }

    return { skipExecution: true, meta: { status: 'success', agentIds: agentIds.map(n => n.toString()), address } };
  }
}

new ERC8004InfoCommand().run();
