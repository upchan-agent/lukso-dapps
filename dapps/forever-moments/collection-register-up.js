#!/usr/bin/env node
/**
 * Collection Register UP
 * Register your UP address as a Collection on Forever Moments
 * Forever Moments Agent API v1 Compliant
 * https://www.forevermoments.life/api/agent/v1/agents.md
 * 
 * This command registers your existing UP address as a collection.
 * No new contract deployment is needed - your UP becomes the collection.
 * 
 * Required Permissions:
 * - EXECUTE_RELAY_CALL (for relay execution)
 * - SUPER_CALL or CALL (for contract calls)
 */

import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { API_BASE } from '../../lib/core/constants.js';

class RegisterUPCollectionCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    // ─── Mode: Confirm or Execute ───────────────────────────────────────
    const isConfirmMode = !args.yes;
    
    const collection = credentials.upAddress;
    const collectionType = args.type || 1; // 1 = Open collection (default)

    // collectionTypes は confirm / execute 両方で使用するため先頭で定義
    const collectionTypes = { 0: 'Invite-only', 1: 'Open', 2: 'Token-gated' };

    // ─── Step 1: collections/build-register ─────────────────────────────
    console.log('📝 Step 1/4: Building registration transaction...');
    const buildRes = await fetch(`${API_BASE}/collections/build-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerUPAddress: collection,
        controllerAddress: collection,  // Must equal ownerUPAddress (UP address, not EOA!)
        collectionUPAddress: collection,
        collectionType: collectionType,
        joiningFeeLyx: args.fee || '0',
        gatingTokenAddress: args.gating || null,
      }),
    });

    if (!buildRes.ok) {
      throw new Error(`collections/build-register failed: ${buildRes.status}`);
    }

    const buildResult = await buildRes.json();
    if (!buildResult.success) {
      throw new Error(`collections/build-register error: ${JSON.stringify(buildResult)}`);
    }

    const payload = buildResult.data.derived.upExecutePayload;

    // ─── Confirm Mode ───────────────────────────────────────────────────
    if (isConfirmMode) {
      
      console.log(`
🆙 Register UP as Collection (Confirm)
────────────────────────────────────────
  Collection: ${collection}
  Type: ${collectionTypes[collectionType] || 'Open'}
  Joining Fee: ${args.fee || '0'} LYX
  Gating Token: ${args.gating || 'None'}
────────────────────────────────────────

This will register your UP address (${collection}) as a collection.
No new contract will be deployed - your UP becomes the collection.

Please review the details. To execute, run again with --yes flag:

  /lyx forever-moments:register-up --yes
`);
      
      return { skipExecution: true };
    }

    // ─── Execute Mode ───────────────────────────────────────────────────
    console.log('🆙 Register UP as Collection');
    console.log(`   Collection: ${collection}`);
    console.log(`   Type: ${collectionTypes[collectionType] || 'Open'}`);
    console.log('');

    // ─── Step 2: relay/prepare ──────────────────────────────────────────
    console.log('📝 Step 2/4: Preparing relay...');
    const prepareRes = await fetch(`${API_BASE}/relay/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: collection,
        controllerAddress: collection,  // UP address (not EOA!)
        payload: payload,
      }),
    });

    if (!prepareRes.ok) {
      throw new Error(`relay/prepare failed: ${prepareRes.status}`);
    }

    const prepareResult = await prepareRes.json();
    if (!prepareResult.success) {
      throw new Error(`relay/prepare error: ${JSON.stringify(prepareResult)}`);
    }

    const {
      hashToSign,
      nonce,
      relayerUrl,
      validityTimestamps = '0x0',
    } = prepareResult.data;

    console.log('   ✓ Relay prepared');
    console.log('');

    // ─── Step 3: Sign ───────────────────────────────────────────────────
    console.log('📝 Step 3/4: Signing...');

    if (!hashToSign || hashToSign.length !== 66) {
      throw new Error(`Invalid hashToSign format: "${hashToSign}"`);
    }

    const signingKey = new ethers.SigningKey(credentials.privateKey);
    const signature = signingKey.sign(ethers.getBytes(hashToSign));
    const signatureSerialized = ethers.Signature.from(signature).serialized;

    console.log('   ✓ Signed');
    console.log('');

    // ─── Step 4: relay/submit ───────────────────────────────────────────
    console.log('📝 Step 4/4: Submitting...');
    
    const submitRes = await fetch(`${API_BASE}/relay/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: collection,
        payload: payload,
        signature: signatureSerialized,
        nonce: nonce,
        validityTimestamps: validityTimestamps,
        relayerUrl: relayerUrl,
      }),
    });

    const submitText = await submitRes.text();

    if (!submitRes.ok) {
      throw new Error(`relay/submit failed: ${submitRes.status} - ${submitText}`);
    }

    let submitResult;
    try {
      submitResult = JSON.parse(submitText);
    } catch {
      throw new Error(`relay/submit response is not JSON`);
    }

    if (!submitResult.success) {
      throw new Error(`relay/submit failed: ${JSON.stringify(submitResult)}`);
    }
    
    if (submitResult.data?.status === 400 || submitResult.data?.ok === false) {
      const detail = submitResult.data?.responseText ?? JSON.stringify(submitResult.data);
      throw new Error(`relay/submit relayer error: ${detail}`);
    }

    // Parse responseText (it's a JSON string)
    let relayResponse;
    try {
      relayResponse = JSON.parse(submitResult.data?.responseText || '{}');
    } catch {
      relayResponse = {};
    }

    const txHash = submitResult.data?.transactionHash || relayResponse.transactionHash;
    const explorerUrl = submitResult.data?.explorerUrl || relayResponse.explorerUrl;

    if (!txHash) {
      throw new Error(`txHash not found: ${JSON.stringify(submitResult)}`);
    }

    console.log('   ✓ Submitted');
    console.log('');
    console.log('✅ UP Collection Registration Complete!');
    console.log(`   Collection: ${collection}`);
    console.log(`   TX: ${txHash}`);
    if (explorerUrl) console.log(`   Explorer: ${explorerUrl}`);

    return {
      skipExecution: true,
      meta: { collection, collectionType, txHash, explorerUrl },
    };
  }

  onSuccess() {
    // All handled in build()
  }
}

new RegisterUPCollectionCommand().run();