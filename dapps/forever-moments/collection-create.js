#!/usr/bin/env node
/**
 * Collection Create
 * Forever Moments Agent API v1 Compliant
 * https://www.forevermoments.life/api/agent/v1/agents.md
 * 
 * ⚠️  Two-Step Process:
 * 1. Deploy (create collection contract)
 * 2. Register (add to registry)
 * 
 * ⚠️  You CAN'T DELETE collection once created so be careful. (The removeCollection(address) function with registry contract is limited to contract owner)
 */

import { readFile } from 'fs/promises';
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { API_BASE, ALLOWED_CATEGORIES } from '../../lib/core/constants.js';
import { createLSP3Metadata } from '../../lib/shared/metadata.js';
import { uploadToPinata } from '../../lib/shared/pinata.js';

class CollectionCreateCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    // ─── Required Parameters ────────────────────────────────────────────
    if (!args.name) {
      throw new Error('--name is required');
    }
    if (!args.image) {
      throw new Error('--image is required');
    }
    if (!args.category) {
      throw new Error('--category is required');
    }

    // ─── Validate Category ──────────────────────────────────────────────
    if (!ALLOWED_CATEGORIES.includes(args.category)) {
      throw new Error(`Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`);
    }

    const name = args.name;
    const description = args.description || '';
    const imagePath = args.image;
    const category = args.category;

    // ─── Upload Image ───────────────────────────────────────────────────
    console.log('📤 Uploading image to IPFS...');
    const imageCid = await uploadToPinata(imagePath);
    console.log(`   ✓ CID: ${imageCid}`);
    console.log('');

    // ─── Create Metadata ────────────────────────────────────────────────
    console.log('📝 Creating metadata...');
    const imageBytes = await readFile(imagePath);
    const metadata = createLSP3Metadata(name, description, imageCid, imageBytes, category);
    console.log('   ✓ Metadata created');
    console.log('');

    // ─── Step 1: collections/build-create ───────────────────────────────
    console.log('📝 Step 1/4: Building deploy transaction...');
    const buildRes = await fetch(`${API_BASE}/collections/build-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUPAddress: credentials.upAddress,
        controllerAddress: credentials.upAddress,  // UP address (NOT EOA)
        lsp3MetadataJson: metadata,
        collectionType: 1,
      }),
    });

    if (!buildRes.ok) {
      throw new Error(`collections/build-create failed: ${buildRes.status}`);
    }

    const buildResult = await buildRes.json();
    if (!buildResult.success) {
      throw new Error(`collections/build-create error: ${JSON.stringify(buildResult)}`);
    }

    const deployPayload = buildResult.data.derived.upExecutePayload;

    // ─── Confirm Mode ───────────────────────────────────────────────────
    if (!args.yes) {
      console.log(`
🆙 Collection Create (Confirm)
────────────────────────────────────────
  Name: ${name}
  Description: ${description || '(none)'}
  Image: ${imagePath}
  Category: ${category}
────────────────────────────────────────

This command executes in 2 steps:
  1. Deploy (create collection contract)
  2. Register (add to registry)

Please review the details. To execute, run again with --yes flag:

  /lyx forever-moments:create-collection --name "${name}" --image ${imagePath} --category "${category}" --yes
`);
      
      return { skipExecution: true };
    }

    // ─── Execute Mode ───────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════');
    console.log('Step 1/2: Deploy');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // ─── Step 2: relay/prepare (deploy) ─────────────────────────────────
    console.log('📝 Step 2/4: Preparing relay (deploy)...');
    const prepareDeployRes = await fetch(`${API_BASE}/relay/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: credentials.upAddress,
        controllerAddress: credentials.controllerAddress,
        payload: deployPayload,
      }),
    });

    if (!prepareDeployRes.ok) {
      throw new Error(`relay/prepare failed: ${prepareDeployRes.status}`);
    }

    const prepareDeployResult = await prepareDeployRes.json();
    if (!prepareDeployResult.success) {
      throw new Error(`relay/prepare error: ${JSON.stringify(prepareDeployResult)}`);
    }

    const {
      hashToSign: deployHash,
      nonce: deployNonce,
      relayerUrl: deployRelayerUrl,
      validityTimestamps: deployValidityTimestamps = '0x0',
    } = prepareDeployResult.data;

    console.log('   ✓ Relay prepared');
    console.log('');

    // ─── Step 3: Sign (deploy) ──────────────────────────────────────────
    console.log('📝 Signing (deploy)...');

    const signingKey = new ethers.SigningKey(credentials.privateKey);
    const deploySignature = signingKey.sign(ethers.getBytes(deployHash));
    const deploySignatureSerialized = ethers.Signature.from(deploySignature).serialized;

    console.log('   ✓ Signed');
    console.log('');

    // ─── Step 4: relay/submit (deploy) ──────────────────────────────────
    console.log('📝 Submitting (deploy)...');
    
    const submitDeployRes = await fetch(`${API_BASE}/relay/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: credentials.upAddress,
        payload: deployPayload,
        signature: deploySignatureSerialized,
        nonce: deployNonce,
        validityTimestamps: deployValidityTimestamps,
        relayerUrl: deployRelayerUrl,
      }),
    });

    const submitDeployText = await submitDeployRes.text();

    if (!submitDeployRes.ok) {
      throw new Error(`relay/submit failed: ${submitDeployRes.status} - ${submitDeployText}`);
    }

    let submitDeployResult;
    try {
      submitDeployResult = JSON.parse(submitDeployText);
    } catch {
      throw new Error(`relay/submit response is not JSON`);
    }

    if (!submitDeployResult.success) {
      throw new Error(`relay/submit failed: ${JSON.stringify(submitDeployResult)}`);
    }
    
    if (submitDeployResult.data?.status === 400 || submitDeployResult.data?.ok === false) {
      const detail = submitDeployResult.data?.responseText ?? JSON.stringify(submitDeployResult.data);
      throw new Error(`relay/submit relayer error: ${detail}`);
    }

    // Parse responseText (it's a JSON string)
    let deployRelayResponse;
    try {
      deployRelayResponse = JSON.parse(submitDeployResult.data?.responseText || '{}');
    } catch {
      deployRelayResponse = {};
    }

    const deployTxHash = submitDeployResult.data?.transactionHash || deployRelayResponse.transactionHash;
    const deployExplorerUrl = submitDeployResult.data?.explorerUrl || deployRelayResponse.explorerUrl;

    if (!deployTxHash) {
      throw new Error(`txHash not found: ${JSON.stringify(submitDeployResult)}`);
    }

    console.log('   ✓ Submitted');
    console.log('');
    console.log('✅ Deploy Complete!');
    console.log(`   TX: ${deployTxHash}`);
    if (deployExplorerUrl) console.log(`   Explorer: ${deployExplorerUrl}`);
    console.log('');

    // ─── Step 5: collections/finalize-create ────────────────────────────
    console.log('═══════════════════════════════════════════');
    console.log('Step 2/2: Register');
    console.log('═══════════════════════════════════════════');
    console.log('');

    console.log('📝 Building register transaction...');
    const finalizeRes = await fetch(`${API_BASE}/collections/finalize-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployTxHash: deployTxHash,
        ownerUPAddress: credentials.upAddress,
        controllerAddress: credentials.upAddress,  // UP address (NOT EOA)
        collectionType: 1,
      }),
    });

    if (!finalizeRes.ok) {
      throw new Error(`collections/finalize-create failed: ${finalizeRes.status}`);
    }

    const finalizeResult = await finalizeRes.json();
    if (!finalizeResult.success) {
      throw new Error(`collections/finalize-create error: ${JSON.stringify(finalizeResult)}`);
    }

    const registerPayload = finalizeResult.data.derived.upExecutePayload;
    const collectionAddress = finalizeResult.data.collectionAddress;

    console.log('   ✓ Register transaction built');
    console.log(`   Collection Address: ${collectionAddress}`);
    console.log('');

    // ─── Step 6: relay/prepare (register) ───────────────────────────────
    console.log('📝 Preparing relay (register)...');
    const prepareRegisterRes = await fetch(`${API_BASE}/relay/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: credentials.upAddress,
        controllerAddress: credentials.controllerAddress,
        payload: registerPayload,
      }),
    });

    if (!prepareRegisterRes.ok) {
      throw new Error(`relay/prepare failed: ${prepareRegisterRes.status}`);
    }

    const prepareRegisterResult = await prepareRegisterRes.json();
    if (!prepareRegisterResult.success) {
      throw new Error(`relay/prepare error: ${JSON.stringify(prepareRegisterResult)}`);
    }

    const {
      hashToSign: registerHash,
      nonce: registerNonce,
      relayerUrl: registerRelayerUrl,
      validityTimestamps: registerValidityTimestamps = '0x0',
    } = prepareRegisterResult.data;

    console.log('   ✓ Relay prepared');
    console.log('');

    // ─── Step 7: Sign (register) ────────────────────────────────────────
    console.log('📝 Signing (register)...');

    const registerSignature = signingKey.sign(ethers.getBytes(registerHash));
    const registerSignatureSerialized = ethers.Signature.from(registerSignature).serialized;

    console.log('   ✓ Signed');
    console.log('');

    // ─── Step 8: relay/submit (register) ────────────────────────────────
    console.log('📝 Submitting (register)...');
    
    const submitRegisterRes = await fetch(`${API_BASE}/relay/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: credentials.upAddress,
        payload: registerPayload,
        signature: registerSignatureSerialized,
        nonce: registerNonce,
        validityTimestamps: registerValidityTimestamps,
        relayerUrl: registerRelayerUrl,
      }),
    });

    const submitRegisterText = await submitRegisterRes.text();

    if (!submitRegisterRes.ok) {
      throw new Error(`relay/submit failed: ${submitRegisterRes.status} - ${submitRegisterText}`);
    }

    let submitRegisterResult;
    try {
      submitRegisterResult = JSON.parse(submitRegisterText);
    } catch {
      throw new Error(`relay/submit response is not JSON`);
    }

    if (!submitRegisterResult.success) {
      throw new Error(`relay/submit failed: ${JSON.stringify(submitRegisterResult)}`);
    }
    
    if (submitRegisterResult.data?.status === 400 || submitRegisterResult.data?.ok === false) {
      const detail = submitRegisterResult.data?.responseText ?? JSON.stringify(submitRegisterResult.data);
      throw new Error(`relay/submit relayer error: ${detail}`);
    }

    // Parse responseText (it's a JSON string)
    let registerRelayResponse;
    try {
      registerRelayResponse = JSON.parse(submitRegisterResult.data?.responseText || '{}');
    } catch {
      registerRelayResponse = {};
    }

    const registerTxHash = submitRegisterResult.data?.transactionHash || registerRelayResponse.transactionHash;
    const registerExplorerUrl = submitRegisterResult.data?.explorerUrl || registerRelayResponse.explorerUrl;

    if (!registerTxHash) {
      throw new Error(`txHash not found: ${JSON.stringify(submitRegisterResult)}`);
    }

    console.log('   ✓ Submitted');
    console.log('');
    console.log('✅ Collection Create Complete!');
    console.log(`   Name: ${name}`);
    console.log(`   Address: ${collectionAddress}`);
    console.log(`   Deploy TX: ${deployTxHash}`);
    console.log(`   Register TX: ${registerTxHash}`);
    if (registerExplorerUrl) console.log(`   Explorer: ${registerExplorerUrl}`);

    return {
      skipExecution: true,
      meta: { name, collectionAddress, deployTxHash, registerTxHash, registerExplorerUrl },
    };
  }

  onSuccess() {
    // All handled in build()
  }
}

new CollectionCreateCommand().run();