#!/usr/bin/env node
/**
 * Display UP profile (LSP3)
 */
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { CHAINS, ABIS, DATA_KEYS } from '../../lib/core/index.js';
import { extractUriFromVerifiableUri, fetchJsonFromIpfs } from '../../lib/shared/metadata.js';

class GetProfileCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    const network = args.network || 'lukso';
    const chainConfig = CHAINS[network] || CHAINS.lukso;

    // If --address is omitted, fall back to the current user's UP
    const upAddress = args.address || credentials?.upAddress;
    if (!upAddress) {
      throw new Error('--address is required (or configure credentials)');
    }

    console.log('🆙 UP Profile');
    console.log('======================');
    console.log(`Address: ${upAddress}`);
    console.log('');

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const upContract = new ethers.Contract(upAddress, ABIS.LSP0, provider);

    console.log('📡 Fetching on-chain data...');
    const verifiableUri = await upContract.getData(DATA_KEYS.LSP3Profile);
    if (verifiableUri === '0x') {
      console.log('⚠️ LSP3Profile is not set');
      return { skipExecution: true };
    }

    const uri = extractUriFromVerifiableUri(verifiableUri);
    console.log(' ✓ URI:', uri);

    console.log('📥 Fetching metadata...');
    const metadata = await fetchJsonFromIpfs(uri);
    console.log(' ✓ Done');
    console.log('');

    const lsp3 = metadata.LSP3Profile;
    if (!lsp3) {
      throw new Error('LSP3Profile key not found in metadata');
    }

    console.log('📋 LSP3Profile:');
    console.log(` Name: ${lsp3.name || '(not set)'}`);
    console.log(` Description: ${lsp3.description || '(not set)'}`);

    if (lsp3.tags?.length > 0) {
      console.log(` Tags: ${lsp3.tags.join(', ')}`);
    }

    if (lsp3.links?.length > 0) {
      console.log(' Links:');
      lsp3.links.forEach(link => {
        console.log(` - ${link.title}: ${link.url}`);
      });
    }

    if (lsp3.profileImage?.length > 0) {
      console.log(' Images:');
      lsp3.profileImage.forEach(img => {
        const size = img.width && img.height ? ` (${img.width}x${img.height})` : '';
        console.log(` - profileImage${size}: ${img.url}`);
      });
    }

    if (lsp3.backgroundImage?.length > 0) {
      if (!lsp3.profileImage?.length) console.log(' Images:');
      lsp3.backgroundImage.forEach(img => {
        const size = img.width && img.height ? ` (${img.width}x${img.height})` : '';
        console.log(` - backgroundImage${size}: ${img.url}`);
      });
    }

    if (lsp3.avatar?.length > 0) {
      console.log(' Avatar:');
      lsp3.avatar.forEach(avatar => {
        const fileType = avatar.fileType ? ` (${avatar.fileType})` : '';
        console.log(` - avatar${fileType}: ${avatar.url}`);
      });
    }

    console.log('');
    console.log('🔗 URI:');
    console.log(` ${uri}`);

    return { skipExecution: true };
  }

  onSuccess() {
    // Output is completed inside build()
  }
}
new GetProfileCommand().run();
