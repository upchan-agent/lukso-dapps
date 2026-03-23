#!/usr/bin/env node
/**
 * Fetch UP TheGrid metadata (LSP28)
 */
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { CHAINS, ABIS, DATA_KEYS } from '../../lib/core/index.js';
import { decodeVerifiableURI, fetchJsonFromIpfs } from '../../lib/shared/metadata.js';

class GetGridCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    const network = args.network || 'lukso';
    const chainConfig = CHAINS[network] || CHAINS.lukso;

    // If --address is omitted, fall back to the current user's UP
    const upAddress = args.address || credentials?.upAddress;
    if (!upAddress) {
      throw new Error('--address is required (or configure credentials)');
    }

    console.log('🆙 Fetch TheGrid metadata');
    console.log('======================');
    console.log(`UP: ${upAddress}`);
    console.log(`Chain: ${chainConfig.name}`);
    console.log('');

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const up = new ethers.Contract(upAddress, ABIS.LSP0, provider);

    console.log('📡 Fetching LSP28 data key...');
    const rawData = await up.getData(DATA_KEYS.LSP28TheGrid);

    if (!rawData || rawData === '0x') {
      console.log(' → LSP28 data is not set');
      return { skipExecution: true };
    }

    console.log(' ✓ Raw data:', rawData.slice(0, 40) + '...');
    console.log(' ✓ Length:', rawData.length, 'bytes');
    console.log('');

    console.log('🔓 Decoding VerifiableURI...');
    const decoded = decodeVerifiableURI(rawData);

    if (!decoded) {
      console.log(' → Decode failed');
      return { skipExecution: true };
    }

    if (decoded.hash) {
      console.log(' ✓ Hash:', decoded.hash);
      console.log(' ✓ URL:', decoded.url);
    } else {
      console.log(' ✓ Raw data:', decoded.raw);
      return { skipExecution: true };
    }

    console.log('');
    console.log('📥 Fetching JSON from IPFS...');
    const json = await fetchJsonFromIpfs(decoded.url);

    console.log('');
    console.log('📋 TheGrid metadata:');
    console.log(JSON.stringify(json, null, 2));

    return { skipExecution: true };
  }

  onSuccess() {
    // Output is completed inside build()
  }
}
new GetGridCommand().run();
