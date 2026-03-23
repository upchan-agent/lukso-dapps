#!/usr/bin/env node
/**
 * Universal Trust - Verify Registration
 * Check if an address is registered as an agent
 * Website https://universal-trust.vercel.app/ (Agents will fail to fetch, so ask your owner to check)
 */

import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { CONTRACTS, CHAINS, ABIS } from '../../lib/core/constants.js';

const UNIVERSAL_TRUST_REGISTRY = CONTRACTS.UNIVERSAL_TRUST_REGISTRY;

class VerifyCommand extends DappCommand {
  needsCredentials = false;

  async build({ args, network }) {
    const address = args.address;
    const detailed = args.detailed;

    if (!address) {
      throw new Error('--address is required\nUsage: /lyx ut verify --address 0x... [--detailed]');
    }

    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

    const details = await this.getVerifyDetails(address, provider);

    if (!details || !details.registered) {
      console.log('❌ Not registered');
      return { skipExecution: true };
    }

    if (!detailed) {
      console.log('✅ Registered');
      return { skipExecution: true };
    }

    // Detailed output
    console.log('=== Universal Trust - Agent Status ===');
    console.log('');
    console.log('Address:', address);
    console.log('Name:', details.name || '-');
    console.log('');
    console.log('Status:');
    console.log('  Registered:', details.registered ? '✅ Yes' : '❌ No');
    console.log('  Active:', details.active ? '✅ Yes' : '❌ No');
    console.log('  isUP:', details.isUP ? '✅ Yes' : '❌ No');
    console.log('');
    console.log('Metrics:');
    console.log('  Reputation:', details.reputation);
    console.log('  Endorsements:', details.endorsements);
    console.log('  Trust Score:', details.trustScore);

    return { skipExecution: true };
  }

  async getVerifyDetails(address, provider) {
    const registry = new ethers.Contract(
      CONTRACTS.UNIVERSAL_TRUST_REGISTRY,
      ABIS.UniversalTrustRegistry,
      provider
    );

    try {
      const result = await registry.verify(address);
      return {
        registered: result[0],
        active: result[1],
        isUP: result[2],
        reputation: result[3].toString(),
        endorsements: result[4].toString(),
        trustScore: result[5].toString(),
        name: result[6]
      };
    } catch {
      return null;
    }
  }

  onSuccess() {
  }
}

new VerifyCommand().run();