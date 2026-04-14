#!/usr/bin/env node
/**
 * Universal Trust - Register Agent
 * Website https://universal-trust.vercel.app/ (Agents will fail to fetch, so ask your owner to check)
 */

import { ethers } from 'ethers';
import { DappCommand, buildExecutePayload } from '../../lib/core/command.js';
import { CONTRACTS, CHAINS, ABIS } from '../../lib/core/constants.js';

class RegisterCommand extends DappCommand {
  async build({ args, credentials, network }) {
    const required = ['name', 'description'];
    for (const arg of required) {
      if (!args[arg]) {
        throw new Error(`--${arg} is required\nUsage: /lyx ut register --name "MyAgent" --description "Description" [--metadata-uri "ipfs://..."]`);
      }
    }

    const name = args.name;
    const description = args.description;
    const metadataURI = args['metadata-uri'] || '';

    console.log('🆙 Universal Trust - Agent Registration');
    console.log('');
    console.log('  Name:', name);
    console.log('  Description:', description);
    console.log('  Metadata URI:', metadataURI || '(empty)');
    console.log('');

    // Step 1: Check if already registered
    console.log('🔍 Step 1: Checking registration status...');
    const isRegistered = await this.checkIsRegistered(credentials.upAddress, network);

    if (isRegistered) {
      console.log('⚠️  Already registered! Skipping registration.');
      console.log('');
      console.log('To verify details: /lyx ut verify --address ' + credentials.upAddress + ' --detailed');
      return { skipExecution: true, meta: { name, upAddress: credentials.upAddress, status: 'already_registered' } };
    }

    console.log('✅ Not registered yet. Proceeding to Step 2...');
    console.log('');

    // Step 2: Register
    console.log('🔨 Step 2: Building register transaction...');
    console.log('');
    console.log('  Agent Name:', name);
    console.log('  UP Address:', credentials.upAddress);
    console.log('');

    // Check for --yes flag to confirm execution
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(` /lyx universal-trust:register --yes`);
      console.log('');
      return { skipExecution: true, meta: { name, upAddress: credentials.upAddress, status: 'confirm' } };
    }

    const registryIface = new ethers.Interface(ABIS.UniversalTrustRegistry);
    const registerData = registryIface.encodeFunctionData('register', [name, description, metadataURI]);

    const payload = buildExecutePayload(CONTRACTS.UNIVERSAL_TRUST_REGISTRY, registerData);

    return { payload, meta: { name, upAddress: credentials.upAddress } };
  }

  async checkIsRegistered(address, network) {
    const rpcUrl = CHAINS[network]?.rpcUrl || CHAINS.lukso.rpcUrl;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const registry = new ethers.Contract(
      CONTRACTS.UNIVERSAL_TRUST_REGISTRY,
      ABIS.UniversalTrustRegistry,
      provider
    );
    return await registry.isRegistered(address);
  }

  onSuccess(result) {
    if (result.meta?.status === 'already_registered') {
      console.log('⚠️  Already registered! Skipping registration.');
      console.log('To verify details: /lyx ut verify --address ' + result.meta?.upAddress + ' --detailed');
    } else if (result.meta?.status === 'confirm') {
      // Confirmation mode - message already printed in build()
    } else {
      console.log('');
      console.log('✅ Registration completed!');
      console.log('TX:', result.transactionHash);
      console.log('Explorer:', result.explorerUrl);
      console.log('');
      console.log('Verify with: /lyx ut verify --address ' + result.meta?.upAddress + ' --detailed');
    }
  }
}

new RegisterCommand().run();