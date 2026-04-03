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
      throw new Error('--json is required\nUsage: /lyx up update-grid --json grid.json');
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

    // Check --yes flag for confirmation mode
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(` /lyx up:update-grid --yes`);
      console.log('');
      return { skipExecution: true };
    }

    console.log('⛓ Writing to blockchain...');
    
    // Use executeSetDataWithFallback() for gasless relay support.
    // Relay path:  Relayer → KM.executeRelayCall(sig, ..., UP.setData(key, value)) → UP
    // Direct path: Controller EOA → UP.setData(key, value)
    // Use --direct flag to force direct execution (skip relay, save quota).
    const { executeSetDataWithFallback } = await import('../../lib/core/executor.js');
    const result = await executeSetDataWithFallback({
      dataKey: DATA_KEYS.LSP28TheGrid,
      dataValue: verifiableUri,
      controllerAddress: credentials.controllerAddress,
      privateKey: credentials.privateKey,
      upAddress: credentials.upAddress,
      directMode: args.direct === true || args.direct === 'true',
    });
    
    console.log('✅ TheGrid metadata updated successfully!');
    console.log(`TX: ${result.transactionHash}`);
    console.log(`Explorer: ${result.explorerUrl}`);
    console.log('');
    
    // Skip default execution flow (we already executed)
    return { skipExecution: true, meta: { ...result, cid } };
  }
}
new UpdateGridCommand().run();
