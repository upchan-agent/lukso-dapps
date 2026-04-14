#!/usr/bin/env node
/**
 * Agent Token Claimer - Set Requirements
 * 
 * Usage:
 *   Interactive: /lyx agent-token-claimer:set-requirements --token 0x...
 *   Non-interactive: /lyx agent-token-claimer:set-requirements --token 0x... --tokens addr1:amount1 --followers 10 --yes
 */

import { DappCommand, CHAINS, buildUpExecute } from '../../lib/core/index.js';
import { ethers } from 'ethers';
import readline from 'readline';

const DROP_ABI = [
  'function setRequirements(address[] tokens, uint256[] minBalances, uint256 minFollowers)',
  'function getTokenRequirements() view returns (address[] tokens, uint256[] minBalances)',
  'function requiredFollowers() view returns (uint256)',
];

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function formatAddr(addr) {
  return `\`${addr}\``;
}

function parseTokenRequirements(input) {
  if (!input || input.trim() === '') {
    return { tokens: [], minBalances: [] };
  }
  
  const tokens = [];
  const minBalances = [];
  
  const pairs = input.split(',');
  for (const pair of pairs) {
    const [addr, amount] = pair.trim().split(':');
    if (!addr || !amount) {
      throw new Error(`Invalid token requirement format: ${pair}. Use addr:amount`);
    }
    if (!ethers.isAddress(addr.trim())) {
      throw new Error(`Invalid address: ${addr}`);
    }
    tokens.push(addr.trim());
    minBalances.push(BigInt(amount.trim()));
  }
  
  return { tokens, minBalances };
}

class SetRequirementsCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const tokenAddr = args['token'];
    const selectedNetwork = network || 'lukso';
    const chainConfig = CHAINS[selectedNetwork] || CHAINS.lukso;
    
    if (!tokenAddr) throw new Error('--token is required');
    if (!ethers.isAddress(tokenAddr)) throw new Error('Invalid token address format');
    
    const isInteractive = !args['yes'];
    let tokens, minBalances, minFollowers;
    
    if (isInteractive) {
      console.log('');
      console.log('📋 Set Requirements');
      console.log(`   Drop: ${formatAddr(tokenAddr)}`);
      console.log('');
      console.log('   Leave empty to keep current or set none.');
      console.log('');
      
      const tokenReqInput = await prompt('Token requirements (addr1:amount1,addr2:amount2): ');
      const followersInput = await prompt('Minimum followers: ');
      
      if (tokenReqInput.trim()) {
        const req = parseTokenRequirements(tokenReqInput);
        tokens = req.tokens;
        minBalances = req.minBalances;
      } else {
        // Fetch current
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
        const current = await drop.getTokenRequirements();
        tokens = current.tokens;
        minBalances = current.minBalances;
      }
      
      if (followersInput.trim()) {
        minFollowers = BigInt(followersInput);
      } else {
        // Fetch current
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
        minFollowers = await drop.requiredFollowers();
      }
    } else {
      // Non-interactive
      if (!args['require-token'] && args['followers'] === undefined) {
        throw new Error('At least one of --require-token or --followers is required with --yes');
      }
      
      if (args['require-token']) {
        const req = parseTokenRequirements(args['require-token']);
        tokens = req.tokens;
        minBalances = req.minBalances;
      } else {
        // Fetch current
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
        const current = await drop.getTokenRequirements();
        tokens = current.tokens;
        minBalances = current.minBalances;
      }
      
      if (args['followers'] !== undefined) {
        minFollowers = BigInt(args['followers']);
      } else {
        // Fetch current
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
        minFollowers = await drop.requiredFollowers();
      }
    }
    
    console.log('');
    console.log('📡 Setting requirements...');
    console.log(`   Drop: ${formatAddr(tokenAddr)}`);
    console.log(`   Tokens: ${tokens.length > 0 ? tokens.length + ' tokens' : 'None'}`);
    console.log(`   Followers: ${minFollowers.toString()}`);
    console.log('');
    
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
    
    const txData = drop.interface.encodeFunctionData('setRequirements', [tokens, minBalances, minFollowers]);
    const payload = buildUpExecute(tokenAddr, txData);
    
    console.log('✅ Ready to set requirements!');
    console.log('');
    
    return {
      payload,
      meta: { tokenAddr, tokensCount: tokens.length, minFollowers }
    };
  }

  onSuccess(result, context) {
    const meta = result.meta;
    console.log('🎉 Requirements Set!');
    console.log('');
    console.log(`   Drop: ${formatAddr(meta.tokenAddr)}`);
    console.log(`   Tokens: ${meta.tokensCount > 0 ? meta.tokensCount + ' tokens' : 'None'}`);
    console.log(`   Followers: ${meta.minFollowers.toString()}`);
    console.log(`   TX Hash: ${result.transactionHash}`);
    console.log(`   Explorer: ${result.explorerUrl}`);
    console.log('');
  }

  onError(error, context) {
    console.log('');
    console.log('❌ Failed');
    console.log('');
    console.log(`   Error: ${error.message}`);
    console.log('');
  }
}

new SetRequirementsCommand().run();
