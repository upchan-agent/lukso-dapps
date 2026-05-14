#!/usr/bin/env node
/**
 * ERC-8004 - List All Agents on LUKSO
 *
 * Usage:
 *   /lyx erc8004:list [--limit 10] [--json]
 *
 * Lists all registered agents in the ERC-8004 Identity Registry on LUKSO.
 */

import { DappCommand } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004ListCommand extends DappCommand {
  needsCredentials = false;

  async build({ args, network }) {
    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const registry = new ethers.Contract(
      CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      ABIS.ERC8004_IdentityRegistry,
      provider
    );

    console.log('🔍 ERC-8004 - LUKSO Agent List');
    console.log('');

    // Get total agent count from Transfer events (mints)
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const mintLogs = await provider.getLogs({
      address: CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      topics: [transferTopic, '0x0000000000000000000000000000000000000000000000000000000000000000'],
      fromBlock: 0,
      toBlock: 'latest'
    }).catch(e => []);

    const totalAgents = BigInt(mintLogs.length);
    console.log(`  Total Agents: ${totalAgents}`);
    console.log(`  Registry:     ${CONTRACTS.ERC8004_IDENTITY_REGISTRY}`);
    console.log(`  Network:      ${chain.name}`);
    console.log('');

    if (totalAgents === 0n) {
      console.log('⚠️  No agents registered yet on this chain.');
      return { skipExecution: true };
    }

    const limit = args.limit ? parseInt(args.limit, 10) : 20;
    const showJson = args.json === 'true';

    // Extract agent IDs from mint events (latest first)
    const agentIds = mintLogs.map(log => BigInt(log.topics[3]).toString()).reverse();
    const displayIds = agentIds.slice(0, limit);

    if (showJson) {
      const agents = [];
      for (const id of displayIds) {
        const agent = await fetchAgentInfo(registry, id);
        agents.push(agent);
      }
      console.log(JSON.stringify(agents, null, 2));
      return { skipExecution: true };
    }

    // Table header
    console.log('  ┌──────┬──────────────────────────────────────┬──────────────────────────────────────┐');
    console.log('  │ ID   │ Name                                 │ Owner (truncated)                    │');
    console.log('  ├──────┼──────────────────────────────────────┼──────────────────────────────────────┤');

    for (const id of displayIds) {
      try {
        const agent = await fetchAgentInfo(registry, id);
        const nameStr = (agent.name || `Agent #${agent.id}`).substring(0, 34);
        const ownerStr = (agent.owner || 'N/A').substring(0, 36);
        console.log(`  │ ${String(agent.id).padEnd(4)} │ ${nameStr.padEnd(36)} │ ${ownerStr.padEnd(36)} │`);
      } catch (e) {
        console.log(`  │ ${String(id).padEnd(4)} │ ${'(error)'.padEnd(36)} │ ${'N/A'.padEnd(36)} │`);
      }
    }

    console.log('  └──────┴──────────────────────────────────────┴──────────────────────────────────────┘');
    console.log('');
    console.log(`  Showing ${displayIds.length} of ${totalAgents} agents`);
    console.log('');
    console.log('  Details: /lyx erc8004:info --agent-id <ID>');
    console.log('  8004scan: https://8004scan.io/agents?chain=42');

    return { skipExecution: true };
  }
}

/**
 * Fetch agent info from registry
 */
async function fetchAgentInfo(registry, id) {
  const owner = await registry.ownerOf(id).catch(() => '0x0000000000000000000000000000000000000000');

  let uri = '';
  try {
    uri = await registry.tokenURI(id);
  } catch {
    uri = '';
  }

  let name = '';
  let description = '';
  let hasData = false;

  // Decode data URI
  if (uri.startsWith('data:application/json;base64,')) {
    try {
      const b64 = uri.split(',')[1];
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      const data = JSON.parse(decoded);
      name = data.name || '';
      description = (data.description || '').substring(0, 100);
      hasData = true;
    } catch {
      name = '(decode error)';
    }
  } else if (uri) {
    name = `IPFS: ${uri.substring(0, 30)}`;
  }

  return { id, owner, name, description, uri, hasData };
}

new ERC8004ListCommand().run();
