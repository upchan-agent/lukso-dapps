#!/usr/bin/env node
/**
 * Agent Token Claimer - Set Claim Enabled
 * 
 * Usage:
 *   Interactive: /lyx agent-token-claimer:set-claim-enabled --token 0x...
 *   Non-interactive: /lyx agent-token-claimer:set-claim-enabled --token 0x... --enabled --yes
 */

import { DappCommand, CHAINS, buildUpExecute } from '../../lib/core/index.js';
import { ethers } from 'ethers';
import readline from 'readline';

const DROP_ABI = ['function setClaimEnabled(bool enabled)'];

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

class SetClaimEnabledCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const tokenAddr = args['token'];
    const selectedNetwork = network || 'lukso';
    const chainConfig = CHAINS[selectedNetwork] || CHAINS.lukso;
    
    if (!tokenAddr) throw new Error('--token is required');
    if (!ethers.isAddress(tokenAddr)) throw new Error('Invalid token address format');
    
    const isInteractive = !args['yes'];
    let enabled;
    
    if (isInteractive) {
      console.log('');
      console.log('📋 Set Claim Enabled');
      console.log(`   Drop: ${formatAddr(tokenAddr)}`);
      console.log('');
      
      const answer = await prompt('Enable claiming? (yes/no): ');
      enabled = answer.toLowerCase() === 'yes';
    } else {
      if (args['enabled'] === undefined) {
        throw new Error('--enabled is required with --yes (use --enabled or --enabled false)');
      }
      enabled = args['enabled'] !== 'false' && args['enabled'] !== false;
    }
    
    console.log('');
    console.log('📡 Setting claim enabled...');
    console.log(`   Drop: ${formatAddr(tokenAddr)}`);
    console.log(`   Enabled: ${enabled}`);
    console.log('');
    
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
    
    const txData = drop.interface.encodeFunctionData('setClaimEnabled', [enabled]);
    const payload = buildUpExecute(credentials.upAddress, tokenAddr, txData);
    
    console.log('✅ Ready to set claim enabled!');
    console.log('');
    
    return {
      payload,
      meta: { tokenAddr, enabled }
    };
  }

  onSuccess(result, context) {
    const meta = result.meta;
    console.log('🎉 Claim Enabled!');
    console.log('');
    console.log(`   Drop: ${formatAddr(meta.tokenAddr)}`);
    console.log(`   Enabled: ${meta.enabled}`);
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

new SetClaimEnabledCommand().run();
