#!/usr/bin/env node
/**
 * Agent Token Claimer - Decode Codeword from On-chain Claims
 * 
 * Usage:
 *   /lyx claim:decode-codeword --token <address> [--limit 10] [--network lukso]
 * 
 * Extracts codewords from existing claim transactions by decoding on-chain data.
 * This works because claimWithCode(string) includes the codeword in the transaction payload.
 * 
 * Process:
 *   1. Get internal transactions to the token contract
 *   2. Get each transaction's raw_input
 *   3. Find claimWithCode selector (0xe602db67)
 *   4. Decode ABI-encoded string parameter
 */

import { DappCommand, CHAINS } from '../../lib/core/index.js';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const BLOCKSCOUT_API_BASE = {
  lukso: 'https://explorer.execution.mainnet.lukso.network/api/v2',
  luksoTestnet: 'https://explorer.execution.testnet.lukso.network/api/v2',
};

// claimWithCode(string) selector
const CLAIM_WITH_CODE_SELECTOR = 'e602db67';

// execute(uint256,address,uint256,bytes) selector
const EXECUTE_SELECTOR = '44c028fe';

// executeRelayCall(bytes,uint256,uint256,bytes) selector
const EXECUTE_RELAY_CALL_SELECTOR = '4c8a4e74';

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

/**
 * Extract codeword from raw transaction input
 * Handles both direct calls and calls wrapped in execute/executeRelayCall
 * 
 * @param {string} rawInput - Raw transaction input data (hex string)
 * @returns {string|null} - Decoded codeword or null
 */
function extractCodeword(rawInput) {
  if (!rawInput || rawInput === '0x') return null;
  
  const hex = rawInput.startsWith('0x') ? rawInput.slice(2) : rawInput;
  
  // Find claimWithCode selector
  const claimIdx = hex.indexOf(CLAIM_WITH_CODE_SELECTOR);
  if (claimIdx === -1) return null;
  
  // After selector: offset (64 hex chars) + length (64 hex chars) + string hex
  const afterSelector = hex.slice(claimIdx + 8);
  
  // Skip offset (first 64 chars = 32 bytes)
  const afterOffset = afterSelector.slice(64);
  
  // Read length (next 64 chars)
  const lenHex = afterOffset.slice(0, 64).replace(/^0+/, '') || '0';
  const len = parseInt(lenHex, 16);
  
  if (len === 0) return null;
  
  // Extract string hex
  const strHex = afterOffset.slice(64, 64 + len * 2);
  
  // Decode to string
  try {
    return Buffer.from(strHex, 'hex').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Fetch token transfers (minting transactions) for a token contract
 * Uses /tokens/{address}/transfers endpoint (correct for token transfers)
 */
async function fetchTokenTransfers(tokenAddr, network, limit = 20) {
  const baseUrl = BLOCKSCOUT_API_BASE[network] || BLOCKSCOUT_API_BASE.lukso;
  const url = `${baseUrl}/tokens/${tokenAddr}/transfers`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Blockscout API error: ${res.status}`);
  }
  
  const data = await res.json();
  // Return only the first `limit` items
  return (data.items || []).slice(0, limit);
}

/**
 * Fetch transaction details by hash
 */
async function fetchTransaction(txHash, network) {
  const baseUrl = BLOCKSCOUT_API_BASE[network] || BLOCKSCOUT_API_BASE.lukso;
  const url = `${baseUrl}/transactions/${txHash}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  
  return res.json();
}

/**
 * Get unique transaction hashes from internal transactions
 */
function getUniqueTxHashes(internalTxs) {
  const hashes = internalTxs
    .map(tx => tx.transaction_hash)
    .filter(h => h);
  
  return [...new Set(hashes)];
}

// ═══════════════════════════════════════════════════════════
// DecodeCodewordCommand
// ═══════════════════════════════════════════════════════════

class DecodeCodewordCommand extends DappCommand {
  needsCredentials = false;

  async build({ args }) {
    const tokenAddr = args['token'];
    const limit = parseInt(args['limit'] || '10', 10);
    const network = args['network'] || 'lukso';
    const chainConfig = CHAINS[network] || CHAINS.lukso;

    if (!tokenAddr) {
      throw new Error('--token is required (token contract address)');
    }

    console.log('');
    console.log('🔍 Decoding Codewords from On-chain Claims');
    console.log(`   Token: ${tokenAddr}`);
    console.log(`   Network: ${chainConfig.name}`);
    console.log(`   Limit: ${limit} transactions`);
    console.log('');

    // Step 1: Get token transfers (minting transactions)
    console.log('📡 Fetching token transfers (minting transactions)...');
    const transfers = await fetchTokenTransfers(tokenAddr, network, limit);
    
    if (transfers.length === 0) {
      console.log('   No token transfers found');
      console.log('');
      console.log('💡 This token has no claims yet, or is not a claimable drop.');
      return { skipExecution: true };
    }

    // Get unique transaction hashes
    const txHashes = transfers
      .map(tx => tx.transaction_hash)
      .filter(h => h);
    const uniqueHashes = [...new Set(txHashes)];
    console.log(`   Found ${txHashes.length} unique claim transactions`);
    console.log('');

    // Step 2: Fetch each transaction and decode codeword
    console.log('🔑 Decoding codewords...');
    const results = [];

    for (const txHash of txHashes) {
      const tx = await fetchTransaction(txHash, network);
      if (!tx) continue;

      const codeword = extractCodeword(tx.raw_input);
      
      results.push({
        txHash,
        codeword,
        from: tx.from?.hash,
        method: tx.method,
        timestamp: tx.timestamp,
      });

      // Print progress
      if (codeword) {
        console.log(`   ✓ ${txHash.slice(0, 10)}... → "${codeword}"`);
      } else {
        console.log(`   - ${txHash.slice(0, 10)}... → No codeword (claim() without code)`);
      }
    }

    console.log('');

    // Step 3: Summary
    const codewordsFound = results.filter(r => r.codeword);
    const uniqueCodewords = [...new Set(codewordsFound.map(r => r.codeword))];

    console.log('📊 Summary');
    console.log(`   Total claims: ${results.length}`);
    console.log(`   With codeword: ${codewordsFound.length}`);
    console.log(`   Without codeword: ${results.length - codewordsFound.length}`);
    console.log(`   Unique codewords: ${uniqueCodewords.length}`);
    console.log('');

    if (uniqueCodewords.length > 0) {
      console.log('🔑 Codewords Found:');
      uniqueCodewords.forEach((cw, idx) => {
        const count = codewordsFound.filter(r => r.codeword === cw).length;
        console.log(`   [${idx + 1}] "${cw}" (used by ${count} claimers)`);
      });
      console.log('');
      
      console.log('══════════════════════════');
      console.log('💡 Use this codeword to claim:');
      console.log(`   /lyx claim --token ${tokenAddr} --codeword "${uniqueCodewords[0]}"`);
      console.log('══════════════════════════');
    } else {
      console.log('💡 No codeword required for this drop.');
      console.log('   Use: /lyx claim --token ${tokenAddr}');
    }

    return { 
      skipExecution: true, 
      meta: { 
        tokenAddr, 
        results,
        uniqueCodewords,
      }
    };
  }

  onSuccess(result) {
    // Output already printed in build()
  }
}

// ═══════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════

new DecodeCodewordCommand().run();