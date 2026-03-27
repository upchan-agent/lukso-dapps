#!/usr/bin/env node
/**
 * Universal Trust - Get Endorsements
 * Fetches all endorsements for a specific address from Blockscout API
 * 
 * Usage:
 *   /lyx universal-trust:get-endorsements --address 0x...
 */
import { DappCommand } from '../../lib/core/command.js';
import { CONTRACTS } from '../../lib/core/constants.js';

const BLOCKSCOUT_API = 'https://explorer.execution.mainnet.lukso.network/api/v2';

// EndorsementAdded event signature: 0x1fb5ba6a
const ENDORSEMENT_ADDED_METHOD_ID = '1fb5ba6a';

class GetEndorsementsCommand extends DappCommand {
  needsCredentials = false;

  async build({ args }) {
    const address = args.address;
    if (!address) {
      throw new Error('--address is required');
    }

    console.log('🆙 Universal Trust - Endorsements');
    console.log('');
    console.log('  Address:', address);
    console.log('');

    console.log('📡 Fetching events from Blockscout API...');

    const allLogs = await this.fetchAllLogs();
    
    // Filter EndorsementAdded events where the address is endorsed
    const addressLower = address.toLowerCase();
    const endorsementLogs = allLogs.filter(log => {
      if (log.decoded?.method_id !== ENDORSEMENT_ADDED_METHOD_ID) return false;
      const endorsed = log.decoded.parameters.find(p => p.name === 'endorsed');
      return endorsed?.value?.toLowerCase() === addressLower;
    });

    console.log(`✅ Found ${endorsementLogs.length} endorsements`);
    console.log('');

    // Extract endorsement info
    const endorsements = endorsementLogs.map(log => {
      const params = log.decoded.parameters;
      return {
        endorser: params.find(p => p.name === 'endorser')?.value,
        reason: params.find(p => p.name === 'reason')?.value || '',
        timestamp: params.find(p => p.name === 'timestamp')?.value,
        block: log.block_number,
      };
    });

    // Display results
    console.log('=== Endorsements Received ===\n');
    
    if (endorsements.length === 0) {
      console.log('No endorsements found for this address.');
    } else {
      endorsements.forEach((e, i) => {
        const date = e.timestamp 
          ? new Date(Number(e.timestamp) * 1000).toISOString().split('T')[0]
          : 'unknown';
        
        console.log(`[${i + 1}] From: ${e.endorser}`);
        console.log(`    Date: ${date}`);
        if (e.reason) {
          console.log(`    Reason: ${e.reason}`);
        }
        console.log('');
      });
    }

    return { skipExecution: true, meta: { count: endorsements.length, endorsements } };
  }

  async fetchAllLogs() {
    const baseUrl = `${BLOCKSCOUT_API}/addresses/${CONTRACTS.UNIVERSAL_TRUST_REGISTRY}/logs`;
    let allLogs = [];
    let nextParams = null;

    do {
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

new GetEndorsementsCommand().run();