#!/usr/bin/env node
/**
 * Universal Trust - List Registered Agents
 * Fetches all AgentRegistered events from Blockscout API
 * 
 * Usage:
 *   /lyx universal-trust:list-agents
 */
import { DappCommand } from '../../lib/core/command.js';
import { CONTRACTS } from '../../lib/core/constants.js';

const BLOCKSCOUT_API = 'https://explorer.execution.mainnet.lukso.network/api/v2';

// AgentRegistered event signature: 0x8b0e2497
const AGENT_REGISTERED_METHOD_ID = '8b0e2497';

class ListAgentsCommand extends DappCommand {
  needsCredentials = false;

  async build() {
    console.log('🆙 Universal Trust - Registered Agents');
    console.log('');
    console.log('  Registry:', CONTRACTS.UNIVERSAL_TRUST_REGISTRY);
    console.log('');

    console.log('📡 Fetching events from Blockscout API...');

    const allLogs = await this.fetchAllLogs();
    
    // Filter AgentRegistered events
    const agentLogs = allLogs.filter(log => 
      log.decoded?.method_id === AGENT_REGISTERED_METHOD_ID
    );

    console.log(`✅ Found ${agentLogs.length} registered agents`);
    console.log('');

    // Extract agent info
    const agents = agentLogs.map(log => {
      const params = log.decoded.parameters;
      return {
        address: params.find(p => p.name === 'agent')?.value,
        name: params.find(p => p.name === 'name')?.value || '(unnamed)',
        description: params.find(p => p.name === 'description')?.value || '',
        timestamp: params.find(p => p.name === 'timestamp')?.value,
        block: log.block_number,
      };
    });

    // Display results
    console.log('=== Registered Agents ===\n');
    
    agents.forEach((agent, i) => {
      const date = agent.timestamp 
        ? new Date(Number(agent.timestamp) * 1000).toISOString().split('T')[0]
        : 'unknown';
      
      console.log(`[${i + 1}] ${agent.name}`);
      console.log(`    Address: ${agent.address}`);
      console.log(`    Registered: ${date}`);
      if (agent.description) {
        const desc = agent.description.length > 60 
          ? agent.description.slice(0, 60) + '...'
          : agent.description;
        console.log(`    Description: ${desc}`);
      }
      console.log('');
    });

    return { skipExecution: true, meta: { count: agents.length, agents } };
  }

  async fetchAllLogs() {
    const baseUrl = `${BLOCKSCOUT_API}/addresses/${CONTRACTS.UNIVERSAL_TRUST_REGISTRY}/logs`;
    let allLogs = [];
    let nextParams = null;
    let page = 0;

    do {
      page++;
      const url = nextParams 
        ? `${baseUrl}?${new URLSearchParams(nextParams)}`
        : baseUrl;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Blockscout API error: ${response.status}`);
      }
      
      const data = await response.json();
      allLogs = allLogs.concat(data.items || []);
      nextParams = data.next_page_params;
      
      if (page === 1) {
        console.log(`  Page 1: ${data.items?.length} logs`);
      }
    } while (nextParams);

    console.log(`  Total logs: ${allLogs.length}`);
    return allLogs;
  }

  onSuccess(result) {
    // Already printed in build()
    if (!result.transactionHash) {
      return;
    }
  }
}

new ListAgentsCommand().run();