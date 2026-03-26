#!/usr/bin/env node
/**
 * Agent Token Claimer - Check Eligibility
 * 
 * Usage:
 *   /lyx claim:check --token <address> [--address <up_address>] [--network <network>]
 * 
 * Checks if a token drop contract is claimable and verifies user eligibility.
 */

import { DappCommand, CHAINS, LSP4_DATA_KEYS } from '../../lib/core/index.js';
import { ethers } from 'ethers';

// ═══════════════════════════════════════════════════════════
// Constants (Agent Token Claimer specific)
// ═══════════════════════════════════════════════════════════

const BLOCKSCOUT_API_BASE = {
  lukso: 'https://explorer.execution.mainnet.lukso.network/api/v2/tokens',
  luksoTestnet: 'https://explorer.execution.testnet.lukso.network/api/v2/tokens',
};

// Agent Token Claimer Drop ABI
const DROP_ABI = [
  'function isClaimActive() view returns (bool)',
  'function claimEnabled() view returns (bool)',
  'function hasClaimed(address) view returns (bool)',
  'function meetsRequirements(address) view returns (bool tokenOk, bool followersOk)',
  'function codewordEnabled() view returns (bool)',
  'function maxSupply() view returns (uint256)',
  'function amountPerClaim() view returns (uint256)',
  'function totalClaimers() view returns (uint256)',
  'function totalClaimedAmount() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function totalClaimed() view returns (uint256)',
  'function getTokenRequirements() view returns (address[] tokens, uint256[] minBalances)',
  'function requiredFollowers() view returns (uint256)',
];

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

/**
 * Format address with monospace formatting
 */
function formatAddr(addr) {
  return `\`${addr}\``;
}

/**
 * Decode LSP4 string data from contract
 */
function decodeLSP4String(dataHex) {
  if (!dataHex || dataHex === '0x') return null;
  
  try {
    if (dataHex.length > 130) {
      const length = parseInt(dataHex.substring(66, 130), 16);
      const data = dataHex.substring(130, 130 + length * 2);
      return ethers.toUtf8String('0x' + data);
    } else {
      return ethers.toUtf8String(dataHex);
    }
  } catch {
    return null;
  }
}

/**
 * Fetch token info from Blockscout API
 */
async function fetchBlockscoutInfo(tokenAddr, network) {
  try {
    const baseUrl = BLOCKSCOUT_API_BASE[network] || BLOCKSCOUT_API_BASE.lukso;
    const res = await fetch(`${baseUrl}/${tokenAddr}`);
    if (res.ok) {
      const data = await res.json();
      return {
        name: data.name,
        symbol: data.symbol,
        holders: data.holders_count,
        totalSupply: data.total_supply,
      };
    }
  } catch {}
  return { name: null, symbol: null, holders: null, totalSupply: null };
}

/**
 * Fetch LSP4 name/symbol from contract
 */
async function fetchLSP4Info(tokenAddr, provider) {
  try {
    const [nameData, symbolData] = await Promise.all([
      provider.call({ to: tokenAddr, data: LSP4_DATA_KEYS.name }),
      provider.call({ to: tokenAddr, data: LSP4_DATA_KEYS.symbol }),
    ]);
    
    return {
      name: decodeLSP4String(nameData),
      symbol: decodeLSP4String(symbolData),
    };
  } catch {
    return { name: null, symbol: null };
  }
}

// ═══════════════════════════════════════════════════════════
// CheckCommand
// ═══════════════════════════════════════════════════════════

class CheckCommand extends DappCommand {
  needsCredentials = false;

  async build({ args, credentials }) {
    const tokenAddr = args['token'];
    if (!tokenAddr) {
      throw new Error('--token is required');
    }

    if (!ethers.isAddress(tokenAddr)) {
      throw new Error('Invalid address format');
    }

    const network = args['network'] || 'lukso';
    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);

    // Fetch token info (Blockscout API + LSP4 fallback)
    const [blockscoutInfo, lsp4Info] = await Promise.all([
      fetchBlockscoutInfo(tokenAddr, network),
      fetchLSP4Info(tokenAddr, provider),
    ]);

    const tokenName = blockscoutInfo.name || lsp4Info.name || 'Unknown';
    const tokenSymbol = blockscoutInfo.symbol || lsp4Info.symbol || 'Unknown';

    // Check if this is a valid drop contract
    const isDrop = await this.isDropContract(drop);
    if (!isDrop) {
      this.printTokenInfo(tokenName, tokenSymbol, tokenAddr, blockscoutInfo, chainConfig.name);
      this.printNotDropWarning();
      return { skipExecution: true, meta: { tokenAddr, isDrop: false } };
    }

    // Gather drop information
    const dropInfo = await this.gatherDropInfo(drop);
    
    // Check personal eligibility
    const upAddr = args['address'] || credentials?.upAddress;
    const eligibility = upAddr && ethers.isAddress(upAddr)
      ? await this.checkEligibility(drop, upAddr, dropInfo.tokenRequirements)
      : null;

    // Build and print output
    this.printOutput(tokenAddr, tokenName, tokenSymbol, blockscoutInfo, dropInfo, eligibility, chainConfig.name);

    return { skipExecution: true, meta: { tokenAddr, isDrop: true, ...dropInfo } };
  }

  /**
   * Check if contract is a valid Agent Token Claimer drop contract
   */
  async isDropContract(contract) {
    try {
      // Try to call multiple drop-specific methods
      await Promise.all([
        contract.isClaimActive(),
        contract.claimEnabled(),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gather all drop contract information
   */
  async gatherDropInfo(drop) {
    // Check token type first
    const isLSP7 = await drop.decimals().then(() => true).catch(() => false);
    
    const [
      tokenRequirements,
      requiredFollowers,
      maxSupply,
      amountPerClaim,
      totalClaimers,
      totalClaimed,
      claimActive,
      claimEnabled,
      codewordEnabled,
    ] = await Promise.all([
      drop.getTokenRequirements().then(req => 
        req.tokens.map((t, i) => ({
          address: t,
          minBalance: req.minBalances[i]?.toString() || '0'
        }))
      ).catch(() => null),
      drop.requiredFollowers().catch(() => null),
      drop.maxSupply().catch(() => null),
      drop.amountPerClaim().catch(() => null),
      drop.totalClaimers().catch(() => null),
      isLSP7 
        ? drop.totalClaimedAmount().catch(() => null)
        : drop.totalClaimed().catch(() => null),
      drop.isClaimActive().catch(() => false),
      drop.claimEnabled().catch(() => false),
      drop.codewordEnabled().catch(() => false),
    ]);

    return {
      isLSP7,
      tokenRequirements,
      requiredFollowers,
      maxSupply,
      amountPerClaim,
      totalClaimers,
      totalClaimed,
      claimActive,
      claimEnabled,
      codewordEnabled,
    };
  }

  /**
   * Check user eligibility
   */
  async checkEligibility(drop, upAddr, tokenRequirements) {
    const [hasClaimed, meetsReq] = await Promise.all([
      drop.hasClaimed(upAddr),
      drop.meetsRequirements(upAddr),
    ]);

    return {
      address: upAddr,
      hasClaimed,
      tokenOk: meetsReq.tokenOk,
      followersOk: meetsReq.followersOk,
      tokenRequirements,
      requiredFollowers: await drop.requiredFollowers().catch(() => null),
    };
  }

  /**
   * Print token info for non-drop contracts
   */
  printTokenInfo(name, symbol, addr, blockscoutInfo, chainName) {
    console.log('📊 Token Information (from Blockscout API)');
    console.log('');
    console.log(`  Name: ${name}`);
    console.log(`  Symbol: ${symbol}`);
    console.log(`  Address: ${formatAddr(addr)}`);
    console.log(`  Chain: ${chainName}`);
    if (blockscoutInfo.totalSupply) {
      console.log(`  Total Supply: ${blockscoutInfo.totalSupply}`);
    }
    if (blockscoutInfo.holders !== null) {
      console.log(`  Holders: ${blockscoutInfo.holders}`);
    }
    console.log('');
  }

  /**
   * Print warning for non-drop contracts
   */
  printNotDropWarning() {
    console.log('⚠️  This does not appear to be an Agent Token Claimer drop contract.');
    console.log('   (This is a regular LSP7/LSP8 token, not a claimable drop)');
    console.log('');
  }

  /**
   * Print full eligibility output
   */
  printOutput(addr, name, symbol, blockscoutInfo, dropInfo, eligibility, chainName) {
    const lines = [];
    
    lines.push('🔍 Token Drop Eligibility');
    lines.push('');
    
    // Token Info
    lines.push('📊 Token Info');
    lines.push(`  Type: ${dropInfo.isLSP7 ? 'LSP7' : 'LSP8'}`);
    lines.push(`  Name: ${name}`);
    lines.push(`  Symbol: ${symbol}`);
    lines.push(`  Address: ${formatAddr(addr)}`);
    lines.push(`  Chain: ${chainName}`);
    if (blockscoutInfo.holders !== null) {
      lines.push(`  Holders: ${blockscoutInfo.holders}`);
    }
    lines.push('');
    
    // Supply
    lines.push('📈 Supply');
    if (blockscoutInfo.totalSupply) {
      lines.push(`  Total Supply: ${blockscoutInfo.totalSupply}`);
    } else if (dropInfo.maxSupply !== null && dropInfo.maxSupply > 0n) {
      lines.push(`  Max Supply: ${dropInfo.maxSupply.toString()}`);
    } else {
      lines.push('  Max Supply: Unlimited');
    }
    
    if (dropInfo.totalClaimed !== null) {
      if (dropInfo.maxSupply !== null && dropInfo.maxSupply > 0n) {
        const pct = (dropInfo.totalClaimed * 100n) / dropInfo.maxSupply;
        const remaining = dropInfo.maxSupply - dropInfo.totalClaimed;
        lines.push(`  Claimed: ${dropInfo.totalClaimed.toString()} (${pct}%)`);
        lines.push(`  Remaining: ${remaining.toString()}`);
      } else {
        lines.push(`  Claimed: ${dropInfo.totalClaimed.toString()}`);
      }
    }
    if (dropInfo.totalClaimers !== null) {
      lines.push(`  Claimers: ${dropInfo.totalClaimers.toString()}`);
    }
    if (dropInfo.amountPerClaim !== null) {
      lines.push(`  Per Claim: ${dropInfo.amountPerClaim.toString()}`);
    }
    lines.push('');
    
    // Claim Status
    lines.push('📋 Claim Status');
    lines.push(`  Active: ${dropInfo.claimActive ? 'Yes' : 'No'}`);
    lines.push(`  Enabled: ${dropInfo.claimEnabled ? 'Yes' : 'No'}`);
    lines.push(`  Codeword: ${dropInfo.codewordEnabled ? 'Required' : 'Not required'}`);
    lines.push('');
    
    // Eligibility
    if (eligibility) {
      lines.push('👤 Your Eligibility');
      lines.push(`  Address: ${formatAddr(eligibility.address)}`);
      lines.push(`  Claimed: ${eligibility.hasClaimed ? 'Yes' : 'No'}`);
      
      if (eligibility.tokenRequirements && eligibility.tokenRequirements.length > 0) {
        lines.push('  Token Requirements:');
        eligibility.tokenRequirements.forEach((req, idx) => {
          lines.push(`    [${idx + 1}] ${formatAddr(req.address)}`);
          lines.push(`        Min: ${req.minBalance}`);
        });
      } else {
        lines.push('  Token Requirements: None');
      }
      lines.push(`  Token Status: ${eligibility.tokenOk ? 'OK' : 'Not met'}`);
      
      if (eligibility.requiredFollowers && eligibility.requiredFollowers > 0n) {
        lines.push(`  Follower Requirements: ${eligibility.requiredFollowers.toString()}`);
      } else {
        lines.push('  Follower Requirements: None');
      }
      lines.push(`  Follower Status: ${eligibility.followersOk ? 'OK' : 'Not met'}`);
      lines.push('');
    }
    
    // Summary
    const canClaim = dropInfo.claimActive && 
                     (!eligibility || !eligibility.hasClaimed) && 
                     (!eligibility || eligibility.tokenOk) && 
                     (!eligibility || eligibility.followersOk);
    
    lines.push('══════════════════════════');
    if (canClaim) {
      lines.push('You CAN claim this token!');
      lines.push('');
      lines.push(`Run: /lyx claim:execute --token ${addr}`);
    } else {
      lines.push('You CANNOT claim yet');
      const reasons = [];
      if (!dropInfo.claimActive) reasons.push('Claim period not active');
      if (eligibility?.hasClaimed) reasons.push('Already claimed');
      if (eligibility && !eligibility.tokenOk) reasons.push('Token requirement not met');
      if (eligibility && !eligibility.followersOk) reasons.push('Follower requirement not met');
      if (dropInfo.codewordEnabled) reasons.push('Codeword required');
      
      if (reasons.length > 0) {
        lines.push('');
        lines.push('Reasons:');
        reasons.forEach(r => lines.push(`  - ${r}`));
      }
    }
    lines.push('══════════════════════════');
    
    console.log(lines.join('\n'));
  }

  onSuccess() {
    // 出力は build() 内で完了
  }
}

// ═══════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════

new CheckCommand().run();
