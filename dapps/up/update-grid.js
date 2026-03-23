#!/usr/bin/env node
/**
 * Update UP metadata (LSP28 TheGrid)
 */
import { readFile } from 'fs/promises';
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { DATA_KEYS } from '../../lib/core/constants.js';
import { uploadJsonToPinata } from '../../lib/shared/pinata.js';
import { buildVerifiableUri, fetchFromIpfs } from '../../lib/shared/metadata.js';

class UpdateGridCommand extends DappCommand {
  async build({ args, credentials }) {
    const jsonFile = args.json;
    if (!jsonFile) {
      throw new Error('--json is required
Usage: /lyx up update-grid --json grid.json');
    }

    console.log('🆙 Update UP TheGrid metadata');
    console.log('======================');
    console.log(`UP: ${credentials.upAddress}`);
    console.log(`JSON: ${jsonFile}`);
    console.log('');

    console.log('📄 Reading JSON metadata...');
    const rawJson = await readFile(jsonFile, 'utf8');
    const parsed = JSON.parse(rawJson);

    if (!parsed.LSP28TheGrid) {
      throw new Error('LSP28 metadata requires an "LSP28TheGrid" object under the LSP28TheGrid key');
    }

    const normalizedJson = JSON.stringify(parsed);
    console.log(' ✓ Valid LSP28 metadata');

    console.log('📤 Uploading to IPFS...');
    const cid = await uploadJsonToPinata(normalizedJson, 'grid-metadata.json');
    console.log(' ✓ CID:', cid);

    console.log('🔍 Fetching from IPFS and verifying hash...');
    const ipfsBytes = await fetchFromIpfs(cid);
    console.log(' ✓', ipfsBytes.length, 'bytes');

    const verifiableUri = buildVerifiableUri(ipfsBytes, cid);
    console.log(' ✓ Hash:', ethers.keccak256(ipfsBytes));
    console.log(' ✓ VerifiableURI:', verifiableUri.slice(0, 20) + '...');
    console.log('');

    console.log('⛓ Writing to blockchain...');
    const iface = new ethers.Interface(['function setData(bytes32 dataKey, bytes data) returns (bool)']);
    const payload = iface.encodeFunctionData('setData', [DATA_KEYS.LSP28TheGrid, verifiableUri]);

    return { payload, meta: { cid } };
  }

  onSuccess(result) {
    console.log('');
    console.log('✅ TheGrid metadata updated successfully!');
    console.log('TX:', result.transactionHash);
    console.log('Explorer:', result.explorerUrl);
  }
}
new UpdateGridCommand().run();
