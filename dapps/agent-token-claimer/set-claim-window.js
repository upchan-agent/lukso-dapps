#!/usr/bin/env node
/**
 * Agent Token Claimer - Set Claim Window
 * 
 * Usage:
 *   Interactive: /lyx agent-token-claimer:set-claim-window --token 0x...
 *   Non-interactive: /lyx agent-token-claimer:set-claim-window --token 0x... --start ... --end ... --yes
 */

import { DappCommand, CHAINS, buildUpExecute } from '../../lib/core/index.js';
import { ethers } from 'ethers';
import readline from 'readline';

const DROP_ABI = ['function setClaimWindow(uint256 startTime, uint256 endTime)'];

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

function parseTimestamp(input) {
  if (!input || input.trim() === '') {
    return 0n;
  }
  const timestamp = parseInt(input);
  if (!isNaN(timestamp)) {
    return BigInt(timestamp);
  }
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return BigInt(Math.floor(date.getTime() / 1000));
  }
  throw new Error(`Invalid timestamp format: ${input}`);
}

class SetClaimWindowCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const tokenAddr = args['token'];
    const selectedNetwork = network || 'lukso';
    const chainConfig = CHAINS[selectedNetwork] || CHAINS.lukso;
    
    if (!tokenAddr) throw new Error('--token is required');
    if (!ethers.isAddress(tokenAddr)) throw new Error('Invalid token address format');
    
    const isInteractive = !args['yes'];
    let startTime, endTime;
    
    if (isInteractive) {
      console.log('');
      console.log('📋 Set Claim Window');
      console.log(`   Drop: ${formatAddr(tokenAddr)}`);
      console.log('');
      console.log('   Leave empty to skip.');
      console.log('');
      
      const startInput = await prompt('Start time (ISO or Unix timestamp): ');
      const endInput = await prompt('End time (ISO or Unix timestamp): ');
      
      startTime = startInput.trim() ? parseTimestamp(startInput) : 0n;
      endTime = endInput.trim() ? parseTimestamp(endInput) : 0n;
    } else {
      if (!args['claim-start'] && !args['claim-end']) {
        throw new Error('At least one of --claim-start or --claim-end is required with --yes');
      }
      startTime = args['claim-start'] ? parseTimestamp(args['claim-start']) : 0n;
      endTime = args['claim-end'] ? parseTimestamp(args['claim-end']) : 0n;
    }
    
    if (startTime === 0n && endTime === 0n) {
      throw new Error('At least one of start time or end time must be specified');
    }
    
    console.log('');
    console.log('📡 Setting claim window...');
    console.log(`   Drop: ${formatAddr(tokenAddr)}`);
    console.log(`   Start: ${startTime > 0n ? new Date(Number(startTime) * 1000).toISOString() : 'Not set'}`);
    console.log(`   End: ${endTime > 0n ? new Date(Number(endTime) * 1000).toISOString() : 'Not set'}`);
    console.log('');
    
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const drop = new ethers.Contract(tokenAddr, DROP_ABI, provider);
    
    const txData = drop.interface.encodeFunctionData('setClaimWindow', [startTime, endTime]);
    const payload = buildUpExecute(credentials.upAddress, tokenAddr, txData);
    
    console.log('✅ Ready to set claim window!');
    console.log('');
    
    return {
      payload,
      meta: { tokenAddr, startTime, endTime }
    };
  }

  onSuccess(result, context) {
    const meta = result.meta;
    console.log('🎉 Claim Window Set!');
    console.log('');
    console.log(`   Drop: ${formatAddr(meta.tokenAddr)}`);
    console.log(`   Start: ${meta.startTime > 0n ? new Date(Number(meta.startTime) * 1000).toISOString() : 'Not set'}`);
    console.log(`   End: ${meta.endTime > 0n ? new Date(Number(meta.endTime) * 1000).toISOString() : 'Not set'}`);
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

new SetClaimWindowCommand().run();
