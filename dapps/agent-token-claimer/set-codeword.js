#!/usr/bin/env node
/**
 * Agent Token Claimer - Set Codeword
 * 
 * Usage:
 *   Interactive: /lyx agent-token-claimer:set-codeword --token 0x...
 *   Non-interactive: /lyx agent-token-claimer:set-codeword --token 0x... --codeword "secret" --yes
 */

import { DappCommand, CHAINS, buildUpExecute } from '../../lib/core/index.js';
import { ethers } from 'ethers';
import readline from 'readline';

const DROP_ABI = [
  'function setCodeword(string word)',
  'function clearCodeword()',
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

class SetCodewordCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const tokenAddr = args['token'];
    const selectedNetwork = network || 'lukso';
    const chainConfig = CHAINS[selectedNetwork] || CHAINS.lukso;
    
    if (!tokenAddr) throw new Error('--token is required');
    if (!ethers.isAddress(tokenAddr)) throw new Error('Invalid token address format');
    
    const isInteractive = !args['yes'];
    let codeword;
    let clearCodeword = false;
    
    if (isInteractive) {
      console.log('');
      console.log('📋 Set Codeword');
      console.log(`   Drop: ${formatAddr(tokenAddr)}`);
      console.log('');
      console.log('   Leave empty to clear codeword.');
      console.log('');
      
      const codewordInput = await prompt('Codeword (leave empty to clear): ');
      
      if (codewordInput.trim() === '') {
        clearCodeword = true;
      } else {
        codeword = codewordInput.trim();
      }
    } else {
      if (args['codeword'] === undefined) {
        throw new Error('--codeword is required with --yes (use empty string to clear)');
      }
      if (args['codeword'] === '') {
        clearCodeword = true;
      } else {
        codeword = args['codeword'];
      }
    }
    
    console.log('');
    console.log('📡 Setting codeword...');
    console.log(`   Drop: ${formatAddr(tokenAddr)}`);
    console.log(`   Codeword: ${clearCodeword ? 'Clear' : 'Set'}`);
    console.log('');
    
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
    
    let txData;
    if (clearCodeword) {
      txData = drop.interface.encodeFunctionData('clearCodeword', []);
    } else {
      txData = drop.interface.encodeFunctionData('setCodeword', [codeword]);
    }
    
    const payload = buildUpExecute(credentials.upAddress, tokenAddr, txData);
    
    console.log('✅ Ready to set codeword!');
    console.log('');
    
    return {
      payload,
      meta: { tokenAddr, codeword: clearCodeword ? 'Cleared' : 'Set' }
    };
  }

  onSuccess(result, context) {
    const meta = result.meta;
    console.log('🎉 Codeword Updated!');
    console.log('');
    console.log(`   Drop: ${formatAddr(meta.tokenAddr)}`);
    console.log(`   Codeword: ${meta.codeword}`);
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

new SetCodewordCommand().run();
