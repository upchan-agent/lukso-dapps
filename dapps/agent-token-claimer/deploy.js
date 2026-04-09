#!/usr/bin/env node
/**
 * Agent Token Claimer - Deploy Drop
 * 
 * Usage:
 *   Interactive: /lyx agent-token-claimer:deploy
 *   Non-interactive: /lyx agent-token-claimer:deploy --type lsp7 --name "..." --yes
 * 
 * ⚠️  This command writes to the blockchain (irreversible)
 * 
 * Note: This command only deploys the drop contract.
 * Set metadata (image) separately via:
 *   /lyx agent-token-claimer:set-metadata --token 0x... --image ./image.png
 */

import { DappCommand, CHAINS, buildUpExecute, encodeFunctionCall } from '../../lib/core/index.js';
import { ethers } from 'ethers';
import readline from 'readline';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const FACTORY_ADDRESS = '0x9b132E764f92c6E6F5E91E276E310758C33dB08F';

const FACTORY_ABI = [
  'function createTokenDrop(string name, string symbol, uint256 amountPerClaim, uint256 maxSupply, bool isNonDivisible) returns (address)',
  'function createNFTDrop(string name, string symbol, uint256 maxSupply, uint256 amountPerClaim) returns (address)',
];

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

/**
 * Prompt for user input (interactive mode)
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Format address with monospace
 */
function formatAddr(addr) {
  return `\`${addr}\``;
}

/**
 * Validate inputs
 */
function validateInputs(inputs) {
  const errors = [];
  
  // Type check
  if (!['lsp7', 'lsp8'].includes(inputs.type)) {
    errors.push('Type must be "lsp7" or "lsp8"');
  }
  
  // Required fields
  if (!inputs.name || inputs.name.trim() === '') {
    errors.push('Name is required');
  }
  if (!inputs.symbol || inputs.symbol.trim() === '') {
    errors.push('Symbol is required');
  }
  
  // Amount check
  if (!inputs.amount || inputs.amount <= 0) {
    errors.push('Amount per claim must be > 0');
  }
  
  // Max supply check (0 = unlimited, so >= 0 is OK)
  if (inputs.max < 0) {
    errors.push('Max supply must be >= 0 (0 = unlimited)');
  }
  
  // LSP8 specific: amount per claim max is 50
  if (inputs.type === 'lsp8' && inputs.amount > 50) {
    errors.push('LSP8 amount per claim max is 50');
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Print deployment summary
 */
function printSummary(inputs) {
  console.log('');
  console.log('📋 Deploy Summary');
  console.log('══════════════════════════');
  console.log(`Type: ${inputs.type.toUpperCase()}`);
  console.log(`Name: ${inputs.name}`);
  console.log(`Symbol: ${inputs.symbol}`);
  console.log(`Amount per Claim: ${inputs.amount}`);
  console.log(`Max Supply: ${inputs.max > 0 ? inputs.max.toString() : 'Unlimited'}`);
  
  if (inputs.type === 'lsp7') {
    console.log(`Divisibility: ${inputs.isNonDivisible ? 'Non-divisible (decimals=0)' : 'Divisible (decimals=18)'}`);
  } else {
    console.log(`Divisibility: N/A (NFT)`);
  }
  
  console.log('══════════════════════════');
  console.log('');
  console.log('⚠️  This action cannot be undone!');
  console.log('');
  
  // Metadata notice based on type
  if (inputs.type === 'lsp8') {
    console.log('⚠️  NFT Metadata Required');
    console.log('');
    console.log('   NFT drops require metadata (image + description).');
    console.log('   Set metadata after deployment:');
    console.log('');
    console.log('   /lyx agent-token-claimer:set-metadata \\');
    console.log('     --token <drop-address> \\');
    console.log('     --image ./nft.png \\');
    console.log('     --description "Description..."');
    console.log('');
  } else {
    console.log('📋 After Deployment:');
    console.log('   1. Set metadata (recommended): /lyx agent-token-claimer:set-metadata --token 0x... --image ./image.png');
    console.log('   2. Configure claim window: /lyx agent-token-claimer:configure --token 0x...');
    console.log('   3. Or use web interface: https://agent-token-claimer.vercel.app/manage/0x...');
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// DeployCommand
// ═══════════════════════════════════════════════════════════

class DeployCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const selectedNetwork = network || 'lukso';
    const chainConfig = CHAINS[selectedNetwork] || CHAINS.lukso;
    
    const isInteractive = !args['yes'];
    
    // ═══════════════════════════════════════════════════════════
    // Collect inputs
    // ═══════════════════════════════════════════════════════════
    
    let inputs = {
      type: args['type'],
      name: args['name'],
      symbol: args['symbol'],
      amount: args['amount'] ? parseInt(args['amount']) : null,
      max: args['max'] ? parseInt(args['max']) : null,
      isNonDivisible: true, // Default to non-divisible (safe)
    };
    
    if (isInteractive) {
      console.log('');
      console.log('🆙 Deploy New Drop');
      console.log('');
      
      // Type
      if (!inputs.type) {
        inputs.type = await prompt('Token Type? (lsp7/lsp8): ');
      }
      
      // Name
      if (!inputs.name) {
        inputs.name = await prompt('Token Name: ');
      }
      
      // Symbol
      if (!inputs.symbol) {
        inputs.symbol = await prompt('Token Symbol: ');
      }
      
      // Amount
      if (!inputs.amount) {
        const amountStr = await prompt('Amount per Claim: ');
        inputs.amount = parseInt(amountStr);
      }
      
      // Max supply
      if (inputs.max === null) {
        const maxStr = await prompt('Max Supply (0 = unlimited): ');
        inputs.max = parseInt(maxStr);
      }
      
      // LSP7 only: Divisibility
      if (inputs.type === 'lsp7') {
        console.log('');
        console.log('📋 Token Divisibility');
        console.log('─────────────────────────────────');
        console.log('Non-divisible (decimals=0):');
        console.log('  - 1 個、2 個、3 個...（整数のみ）');
        console.log('  - 例：MKEY (420 個)');
        console.log('  - NFT 的な使い方');
        console.log('');
        console.log('Divisible (decimals=18):');
        console.log('  - 1.5 個、0.001 個...（小数可能）');
        console.log('  - 例：LYX (1.5 LYX)');
        console.log('  - 通貨的な使い方');
        console.log('─────────────────────────────────');
        console.log('');
        
        const answer = await prompt('Non-divisible? (yes/no): ');
        inputs.isNonDivisible = answer.toLowerCase() === 'yes';
      }
      
      // Validate
      validateInputs(inputs);
      
      // Print summary
      printSummary(inputs);
      
      // Confirm
      const confirm = await prompt('Proceed? (yes/no): ');
      if (confirm.toLowerCase() !== 'yes') {
        console.log('❌ Cancelled');
        return { skipExecution: true };
      }
    } else {
      // Non-interactive mode (--yes)
      // Validate required fields
      if (!inputs.type || !inputs.name || !inputs.symbol || !inputs.amount || inputs.max === null) {
        throw new Error('--type, --name, --symbol, --amount, --max are required with --yes');
      }
      
      // Handle divisibility flags
      if (args['non-divisible']) {
        inputs.isNonDivisible = true;
      }
      if (args['divisible']) {
        inputs.isNonDivisible = false;
      }
      
      // Validate
      validateInputs(inputs);
      
      // Print summary
      printSummary(inputs);
    }
    
    // ═══════════════════════════════════════════════════════════
    // Deploy
    // ═══════════════════════════════════════════════════════════
    
    console.log('');
    console.log('📡 Deploying drop contract...');
    console.log(`   Factory: ${formatAddr(FACTORY_ADDRESS)}`);
    console.log(`   Network: ${chainConfig.name}`);
    console.log('');
    
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    
    let dropAddr;
    
    if (inputs.type === 'lsp7') {
      console.log('📝 Calling createTokenDrop()...');
      // createTokenDrop(string name, string symbol, uint256 amountPerClaim, uint256 maxSupply, bool isNonDivisible)
      const txData = factory.interface.encodeFunctionData('createTokenDrop', [
        inputs.name,
        inputs.symbol,
        inputs.amount,
        inputs.max,
        inputs.isNonDivisible,
      ]);
      
      const payload = buildUpExecute(credentials.upAddress, FACTORY_ADDRESS, txData);
      
      console.log('   Payload encoded');
      console.log('');
      
      return {
        payload,
        meta: {
          type: 'deploy',
          dropType: inputs.type,
          name: inputs.name,
          symbol: inputs.symbol,
          amount: inputs.amount,
          max: inputs.max,
          isNonDivisible: inputs.isNonDivisible,
        }
      };
    } else {
      console.log('📝 Calling createNFTDrop()...');
      // createNFTDrop(string name, string symbol, uint256 maxSupply, uint256 amountPerClaim)
      const txData = factory.interface.encodeFunctionData('createNFTDrop', [
        inputs.name,
        inputs.symbol,
        inputs.max,
        inputs.amount,
      ]);
      
      const payload = buildUpExecute(credentials.upAddress, FACTORY_ADDRESS, txData);
      
      console.log('   Payload encoded');
      console.log('');
      
      return {
        payload,
        meta: {
          type: 'deploy',
          dropType: inputs.type,
          name: inputs.name,
          symbol: inputs.symbol,
          amount: inputs.amount,
          max: inputs.max,
        }
      };
    }
  }

  /**
   * Success handler
   */
  onSuccess(result, context) {
    const meta = result.meta;
    
    console.log('🎉 Drop Deployed Successfully!');
    console.log('');
    console.log(`   Type: ${meta.dropType.toUpperCase()}`);
    console.log(`   Name: ${meta.name} (${meta.symbol})`);
    console.log(`   TX Hash: ${result.transactionHash}`);
    console.log(`   Explorer: ${result.explorerUrl}`);
    console.log('');
    
    // Next steps based on type
    if (meta.dropType === 'lsp8') {
      console.log('⚠️  Next: Set NFT Metadata (Required)');
      console.log('');
      console.log('   NFT drops require metadata. Set it now:');
      console.log('');
      console.log('   /lyx agent-token-claimer:set-metadata \\');
      console.log('     --token <drop-address> \\');
      console.log('     --image ./nft.png \\');
      console.log('     --description "Description..."');
      console.log('');
      console.log('   Or use web interface:');
      console.log('   https://agent-token-claimer.vercel.app/manage/<drop-address>');
      console.log('');
    } else {
      console.log('📋 Next Steps:');
      console.log('   1. Wait for confirmation');
      console.log('   2. Set metadata (recommended): /lyx agent-token-claimer:set-metadata --token <address> --image ./image.png');
      console.log('   3. Configure claim window: /lyx agent-token-claimer:configure --token <address>');
      console.log('   4. Or use web interface: https://agent-token-claimer.vercel.app/manage/<address>');
      console.log('');
    }
  }

  /**
   * Error handler
   */
  onError(error, context) {
    console.log('');
    console.log('❌ Deployment Failed');
    console.log('');
    console.log(`   Error: ${error.message}`);
    console.log('');
    console.log('   Possible reasons:');
    console.log('   - Insufficient LYX for gas');
    console.log('   - Factory contract error');
    console.log('   - Network congestion');
    console.log('   - Invalid parameters');
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════

new DeployCommand().run();
