#!/usr/bin/env node
/**
 * Agent Token Claimer - Auto Check Eligibility
 * 
 * Usage:
 *   /lyx claim:auto-check [--mode check-only] [--network lukso] [--limit 20]
 * 
 * Finds Agent Token Claimer drops by detecting EIP-1167 minimal proxy pattern
 * with known Agent Token Claimer implementation address.
 * 
 * Approach:
 *   1. Fetch recent LSP7 mint (Transfer from_id: null) from Envio
 *   2. Check bytecode for EIP-1167 minimal proxy pattern
 *   3. Compare implementation address with Agent Token Claimer impl
 *   4. Check eligibility for each matching drop
 * 
 * Modes:
 *   - check-only: Only check, don't claim (default)
 *   - claim-pending: Create pending list for manual approval
 *   - auto-claim: Automatically claim eligible drops (⚠️ dangerous)
 */

import { DappCommand, CHAINS } from '../../lib/core/index.js';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const BLOCKSCOUT_API_BASE = {
  lukso: 'https://explorer.execution.mainnet.lukso.network/api/v2',
  luksoTestnet: 'https://explorer.execution.testnet.lukso.network/api/v2',
};

const ENVIO_GRAPHQL = {
  lukso: 'https://envio.lukso-mainnet.universal.tech/v1/graphql',
  luksoTestnet: 'https://envio.lukso-testnet.universal.tech/v1/graphql',
};

// Agent Token Claimer implementation address
const AGENT_TOKEN_CLAIMER_IMPL = '0x707decc6a8550a9f781c7592d66f7d25dd9d1d55';

// EIP-1167 minimal proxy bytecode prefix
const MINIMAL_PROXY_PREFIX = '0x363d3d373d3d3d363d73';

// Drop contract ABI
const DROP_ABI = [
  'function isClaimActive() view returns (bool)',
  'function claimEnabled() view returns (bool)',
  'function hasClaimed(address) view returns (bool)',
  'function meetsRequirements(address) view returns (bool tokenOk, bool followersOk)',
  'function codewordEnabled() view returns (bool)',
  'function amountPerClaim() view returns (uint256)',
  'function totalClaimers() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
];

// claimWithCode(string) selector
const CLAIM_WITH_CODE_SELECTOR = 'e602db67';

// Log file path
const CLAIM_LOG_PATH = path.join(
  process.env.HOME || '/home/ubuntu',
  '.openclaw/workspace/skills/lukso-dapps/dapps/agent-token-claimer/claim-log.json'
);

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

function loadClaimLog() {
  try {
    if (fs.existsSync(CLAIM_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(CLAIM_LOG_PATH, 'utf8'));
    }
  } catch {}
  return { claims: [], pending: [], skipped: [] };
}

function saveClaimLog(log) {
  fs.writeFileSync(CLAIM_LOG_PATH, JSON.stringify(log, null, 2));
}

function isAlreadyProcessed(log, tokenAddr) {
  const addr = tokenAddr.toLowerCase();
  return log.claims.some(c => c.token.toLowerCase() === addr) ||
         log.skipped.some(s => s.token.toLowerCase() === addr);
}

/**
 * Check if bytecode is EIP-1167 minimal proxy with Agent Token Claimer impl
 */
function isAgentTokenClaimerDrop(bytecode) {
  if (!bytecode || !bytecode.startsWith(MINIMAL_PROXY_PREFIX)) {
    return false;
  }
  
  // Extract implementation address from bytecode
  // Format: 0x363d3d373d3d3d363d73<20 bytes impl>5af43d...
  const implAddr = '0x' + bytecode.slice(22, 62).toLowerCase();
  
  return implAddr === AGENT_TOKEN_CLAIMER_IMPL;
}

/**
 * Fetch recent mint transfers from Envio
 */
async function fetchRecentMints(network, limit = 20) {
  const graphqlUrl = ENVIO_GRAPHQL[network] || ENVIO_GRAPHQL.lukso;
  
  const query = {
    query: `{
      Transfer(
        where: { from_id: { _is_null: true } }
        order_by: { timestamp: desc }
        limit: ${limit * 10}
      ) {
        asset_id
        timestamp
      }
    }`
  };
  
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  
  if (!res.ok) {
    throw new Error(`Envio GraphQL error: ${res.status}`);
  }
  
  const data = await res.json();
  const transfers = data.data?.Transfer || [];
  
  // Deduplicate by asset_id
  const seen = new Set();
  const unique = [];
  
  for (const t of transfers) {
    if (!t.asset_id || seen.has(t.asset_id.toLowerCase())) continue;
    seen.add(t.asset_id.toLowerCase());
    unique.push({ address: t.asset_id, timestamp: t.timestamp });
    if (unique.length >= limit) break;
  }
  
  return unique;
}

/**
 * Fetch token names from Envio
 */
async function fetchTokenNames(tokenAddresses, network) {
  if (tokenAddresses.length === 0) return new Map();
  
  const graphqlUrl = ENVIO_GRAPHQL[network] || ENVIO_GRAPHQL.lukso;
  
  const query = {
    query: `{
      Asset(where: {id: {_in: ${JSON.stringify(tokenAddresses)}}}) {
        id
        lsp4TokenName
        lsp4TokenSymbol
      }
    }`
  };
  
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  
  if (!res.ok) return new Map();
  
  const data = await res.json();
  const assets = data.data?.Asset || [];
  
  return new Map(assets.map(a => [a.id.toLowerCase(), {
    name: a.lsp4TokenName || 'Unknown',
    symbol: a.lsp4TokenSymbol || 'Unknown',
  }]));
}

/**
 * Extract codeword from raw transaction input
 */
function extractCodeword(rawInput) {
  if (!rawInput || rawInput === '0x') return null;
  
  const hex = rawInput.startsWith('0x') ? rawInput.slice(2) : rawInput;
  const claimIdx = hex.indexOf(CLAIM_WITH_CODE_SELECTOR);
  if (claimIdx === -1) return null;
  
  const afterSelector = hex.slice(claimIdx + 8);
  const afterOffset = afterSelector.slice(64);
  const lenHex = afterOffset.slice(0, 64).replace(/^0+/, '') || '0';
  const len = parseInt(lenHex, 16);
  
  if (len === 0) return null;
  
  const strHex = afterOffset.slice(64, 64 + len * 2);
  try {
    return Buffer.from(strHex, 'hex').toString('utf8');
  } catch {
    return null;
  }
}

async function decodeCodeword(tokenAddr, network) {
  const baseUrl = BLOCKSCOUT_API_BASE[network] || BLOCKSCOUT_API_BASE.lukso;
  
  try {
    const transfersRes = await fetch(`${baseUrl}/tokens/${tokenAddr}/transfers`);
    if (!transfersRes.ok) return null;
    
    const transfersData = await transfersRes.json();
    const txHashes = (transfersData.items || [])
      .map(tx => tx.transaction_hash)
      .filter(h => h);
    
    if (txHashes.length === 0) return null;
    
    const txRes = await fetch(`${baseUrl}/transactions/${txHashes[0]}`);
    if (!txRes.ok) return null;
    
    const tx = await txRes.json();
    return extractCodeword(tx.raw_input);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// AutoCheckCommand
// ═══════════════════════════════════════════════════════════

class AutoCheckCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    const mode = args['mode'] || 'check-only';
    const network = args['network'] || 'lukso';
    const limit = parseInt(args['limit'] || '20', 10);
    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

    const validModes = ['check-only', 'claim-pending', 'auto-claim'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }

    console.log('');
    console.log('🔍 Auto-Check: Scanning for Agent Token Claimer Drops');
    console.log(`   UP: ${credentials.upAddress}`);
    console.log(`   Network: ${chainConfig.name}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Limit: ${limit}`);
    console.log('');

    const log = loadClaimLog();
    console.log(`📂 Claim log: ${log.claims.length} claimed, ${log.skipped.length} skipped`);
    console.log('');

    // Step 1: Fetch recent mints
    console.log('📡 Fetching recent LSP7 mints (Envio GraphQL)...');
    const mints = await fetchRecentMints(network, limit);
    console.log(`   Found ${mints.length} unique tokens with mint activity`);
    console.log('');

    // Step 2: Filter by EIP-1167 minimal proxy pattern
    console.log('🔎 Filtering Agent Token Claimer drops (EIP-1167 check)...');
    const drops = [];
    const notDrops = [];
    
    for (const mint of mints) {
      try {
        const bytecode = await provider.getCode(mint.address);
        
        if (isAgentTokenClaimerDrop(bytecode)) {
          drops.push(mint);
          console.log(`   ✓ ${mint.address}`);
        } else {
          notDrops.push(mint.address);
        }
      } catch (err) {
        notDrops.push(mint.address);
      }
    }
    
    console.log(`   Agent Token Claimer drops: ${drops.length}`);
    console.log(`   Other tokens: ${notDrops.length}`);
    console.log('');

    // Fetch token names
    const tokenNames = await fetchTokenNames(drops.map(d => d.address), network);

    // Print all drops found
    console.log('📋 Agent Token Claimer Drops (sorted by most recent mint):');
    drops.forEach((drop, idx) => {
      const info = tokenNames.get(drop.address.toLowerCase()) || { name: 'Unknown', symbol: 'Unknown' };
      const date = new Date(drop.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' ');
      console.log(`   [${idx + 1}] ${info.name} (${info.symbol})`);
      console.log(`       Address: ${drop.address}`);
      console.log(`       Last mint: ${date}`);
    });
    console.log('');

    // Step 3: Check eligibility
    console.log('🔎 Checking eligibility...');
    const eligible = [];
    const alreadyProcessed = [];
    const checked = [];

    for (const drop of drops) {
      const addr = drop.address;
      const tokenInfo = tokenNames.get(addr.toLowerCase()) || { name: 'Unknown', symbol: 'Unknown' };
      
      if (isAlreadyProcessed(log, addr)) {
        alreadyProcessed.push(addr);
        continue;
      }

      const dropContract = new ethers.Contract(addr, DROP_ABI, provider);
      
      try {
        const [claimActive, claimEnabled, hasClaimed, meetsReq, codewordEnabled, amountPerClaim, totalClaimers, maxSupply] = await Promise.all([
          dropContract.isClaimActive(),
          dropContract.claimEnabled(),
          dropContract.hasClaimed(credentials.upAddress),
          dropContract.meetsRequirements(credentials.upAddress),
          dropContract.codewordEnabled(),
          dropContract.amountPerClaim(),
          dropContract.totalClaimers(),
          dropContract.maxSupply().catch(() => null),
        ]);

        const isFull = maxSupply && maxSupply > 0n && totalClaimers >= maxSupply;
        const canClaim = claimActive && claimEnabled && !hasClaimed && meetsReq.tokenOk && meetsReq.followersOk && !isFull;

        if (canClaim) {
          let codeword = null;
          if (codewordEnabled) {
            codeword = await decodeCodeword(addr, network);
          }

          eligible.push({
            addr,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            amountPerClaim: amountPerClaim.toString(),
            codewordEnabled,
            codeword,
            hasCodeword: !!codeword,
            totalClaimers: totalClaimers.toString(),
            maxSupply: maxSupply?.toString() || 'unlimited',
          });

          console.log(`   ✅ ${tokenInfo.name} (${tokenInfo.symbol}) - eligible!`);
          if (codewordEnabled) {
            console.log(`      Codeword: ${codeword || '⚠️ not found'}`);
          }
          checked.push({ addr, name: tokenInfo.name, symbol: tokenInfo.symbol, result: 'eligible' });
        } else {
          const reason = !claimActive ? 'not_active'
            : !claimEnabled ? 'not_enabled'
            : hasClaimed ? 'already_claimed'
            : isFull ? 'full'
            : !meetsReq.tokenOk ? 'token_req_not_met'
            : 'follower_req_not_met';
          
          log.skipped.push({
            token: addr,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            reason,
            checkedAt: new Date().toISOString(),
          });
          checked.push({ addr, name: tokenInfo.name, symbol: tokenInfo.symbol, result: reason });
        }
      } catch (err) {
        log.skipped.push({
          token: addr,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          reason: 'check_error',
          error: err.message,
          checkedAt: new Date().toISOString(),
        });
        checked.push({ addr, name: tokenInfo.name, symbol: tokenInfo.symbol, result: 'error' });
      }
    }

    saveClaimLog(log);
    console.log('');

    // Summary
    console.log('📊 Summary');
    console.log(`   Tokens scanned: ${mints.length}`);
    console.log(`   Agent Token Claimer drops: ${drops.length}`);
    console.log(`   Already processed: ${alreadyProcessed.length}`);
    console.log(`   Eligible: ${eligible.length}`);
    console.log('');

    if (eligible.length === 0) {
      console.log('══════════════════════════');
      console.log('No eligible drops found.');
      console.log('══════════════════════════');
      return { skipExecution: true, meta: { eligible: [], drops: drops.map(d => d.address) } };
    }

    console.log('══════════════════════════');
    console.log(`🎉 Found ${eligible.length} eligible drops!`);
    console.log('══════════════════════════');
    console.log('');

    eligible.forEach((drop, idx) => {
      console.log(`[${idx + 1}] ${drop.name} (${drop.symbol})`);
      console.log(`    Address: ${drop.addr}`);
      console.log(`    Per claim: ${drop.amountPerClaim}`);
      console.log(`    Claimers: ${drop.totalClaimers}/${drop.maxSupply}`);
      if (drop.codewordEnabled) {
        console.log(`    Codeword: ${drop.codeword || '⚠️ not found'}`);
      }
      console.log('');
    });

    if (mode === 'check-only') {
      console.log('💡 To claim, run:');
      eligible.forEach((drop) => {
        if (drop.codewordEnabled && drop.codeword) {
          console.log(`   /lyx claim --token ${drop.addr} --codeword "${drop.codeword}" --yes`);
        } else if (!drop.codewordEnabled) {
          console.log(`   /lyx claim --token ${drop.addr} --yes`);
        }
      });
    } else if (mode === 'claim-pending') {
      eligible.forEach((drop) => {
        log.pending.push({
          token: drop.addr,
          name: drop.name,
          symbol: drop.symbol,
          codeword: drop.codeword,
          detectedAt: new Date().toISOString(),
        });
      });
      saveClaimLog(log);
      console.log('📝 Added to pending list (claim-log.json)');
    }

    return { skipExecution: true, meta: { eligible, mode, drops: drops.map(d => d.address) } };
  }

  onSuccess() {}
}

new AutoCheckCommand().run();