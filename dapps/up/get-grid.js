#!/usr/bin/env node
/**
 * Fetch UP TheGrid metadata (LSP28)
 */
import { ERC725 } from '@erc725/erc725.js';
import { DappCommand } from '../../lib/core/command.js';
import { CHAINS } from '../../lib/core/index.js';

// LSP28TheGrid schema (manually defined - not available in erc725.js package)
const LSP28_SCHEMA = [{
  name: 'LSP28TheGrid',
  key: '0x724141d9918ce69e6b8afcf53a91748466086ba2c74b94cab43c649ae2ac23ff',
  keyType: 'Singleton',
  valueType: 'bytes',
  valueContent: 'VerifiableURI',
}];

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

    console.log('📡 Fetching LSP28 data via erc725.js...');
    const erc725 = new ERC725(
      LSP28_SCHEMA,
      upAddress,
      chainConfig.rpcUrl,
      { ipfsGateway: 'https://api.universalprofile.cloud/ipfs/' }
    );

    const grid = await erc725.fetchData('LSP28TheGrid');
    const lsp28Data = grid.value.LSP28TheGrid;

    if (!lsp28Data) {
      console.log(' → LSP28 data is not set');
      return { skipExecution: true };
    }

    console.log('');
    console.log('📋 TheGrid metadata:');
    console.log('');

    // LSP28TheGrid is an array of grid sections
    const sections = Array.isArray(lsp28Data) ? lsp28Data : [lsp28Data];
    console.log(`Sections (${sections.length}):`);
    console.log('');

    sections.forEach((section, sIndex) => {
      console.log(`[${sIndex + 1}] ${section.title || '(untitled)'}`);
      if (section.gridColumns) {
        console.log(`    Columns: ${section.gridColumns}`);
      }
      if (section.visibility !== undefined) {
        console.log(`    Visibility: ${section.visibility}`);
      }

      const items = section.grid || section.items || [];
      if (items.length > 0) {
        console.log(`    Items (${items.length}):`);
        items.forEach((item, iIndex) => {
          console.log(`      (${iIndex + 1}) ${item.type || 'N/A'} ${item.width}x${item.height}`);
          if (item.properties && Object.keys(item.properties).length > 0) {
            const src = item.properties.src;
            if (src) {
              console.log(`          src: ${src}`);
            }
          }
        });
      } else {
        console.log('    (empty)');
      }
      console.log('');
    });
  

    return { skipExecution: true };
  }

  onSuccess() {
    // Output is completed inside build()
  }
}
new GetGridCommand().run();
