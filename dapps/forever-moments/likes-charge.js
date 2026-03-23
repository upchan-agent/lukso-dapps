#!/usr/bin/env node
/**
 * LIKES Charge
 * Forever Moments Agent API v1 Compliant
 * https://www.forevermoments.life/api/agent/v1/agents.md
 * 
 * ⚠️  Required Permissions:
 * - EXECUTE_RELAY_CALL (for relay execution)
 * - SUPER_CALL or CALL (for contract calls)
 * - SUPER_TRANSFERVALUE or TRANSFERVALUE + AllowedCalls (for LYX transfer)
 * 
 * ⚠️  Caution
 * - You will transfer $LYX, so please be careful before execute.
 */

import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { API_BASE } from '../../lib/core/constants.js';

class LikesChargeCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    // ─── Mode: Confirm or Execute ───────────────────────────────────────
    const isConfirmMode = !args.yes;
    
    if (!args.lyx) {
      throw new Error('--lyx is required');
    }

    const lyxAmount = String(args.lyx);
    
    // ─── Step 1: likes/build-mint ───────────────────────────────────────
    const buildRes = await fetch(`${API_BASE}/likes/build-mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userUPAddress: credentials.upAddress,
        lyxAmountLyx: lyxAmount,
      }),
    });

    if (!buildRes.ok) {
      throw new Error(`likes/build-mint failed: ${buildRes.status}`);
    }

    const buildResult = await buildRes.json();
    if (!buildResult.success) {
      throw new Error(`likes/build-mint error: ${JSON.stringify(buildResult)}`);
    }

    const payload = buildResult.data.derived.upExecutePayload;
    const expectedLikes = buildResult.data.derived.expectedLikesAmount;

    // ─── Confirm Mode ───────────────────────────────────────────────────
    if (isConfirmMode) {
      console.log(`
🆙 LIKES Charge (Confirm)
────────────────────────────────────────
  Amount: ${lyxAmount} LYX
  Expected LIKES: ${expectedLikes} LIKES
  UP: ${credentials.upAddress}
────────────────────────────────────────

Please review the details. To execute, run again with --yes flag:

  /lyx forever-moments:charge --lyx ${lyxAmount} --yes
`);
      
      return { skipExecution: true };
    }

    // ─── Execute Mode ───────────────────────────────────────────────────
    console.log('🆙 LIKES Charge');
    console.log(`   Amount: ${lyxAmount} LYX`);
    console.log(`   Expected LIKES: ${expectedLikes} LIKES`);
    console.log('');

    // ─── Step 2: relay/prepare ──────────────────────────────────────────
    console.log('📝 Step 1/4: Preparing relay...');
    const prepareRes = await fetch(`${API_BASE}/relay/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: credentials.upAddress,
        controllerAddress: credentials.controllerAddress,
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
    console.log('📝 Step 2/4: Signing...');

    if (!hashToSign || hashToSign.length !== 66) {
      throw new Error(`Invalid hashToSign format: "${hashToSign}"`);
    }

    const signingKey = new ethers.SigningKey(credentials.privateKey);
    const signature = signingKey.sign(ethers.getBytes(hashToSign));
    const signatureSerialized = ethers.Signature.from(signature).serialized;

    console.log('   ✓ Signed');
    console.log('');

    // ─── Step 4: relay/submit ───────────────────────────────────────────
    console.log('📝 Step 3/4: Submitting...');
    
    const submitRes = await fetch(`${API_BASE}/relay/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upAddress: credentials.upAddress,
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
    console.log('📝 Step 4/4: Waiting for confirmation...');
    console.log('');
    console.log('✅ LIKES Charge Complete!');
    console.log(`   Received: ${expectedLikes} LIKES`);
    console.log(`   TX: ${txHash}`);
    if (explorerUrl) console.log(`   Explorer: ${explorerUrl}`);

    return {
      skipExecution: true,
      meta: { lyxAmount, expectedLikes, txHash, explorerUrl },
    };
  }

  onSuccess() {
    // All handled in build()
  }
}

new LikesChargeCommand().run();