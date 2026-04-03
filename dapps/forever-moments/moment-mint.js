#!/usr/bin/env node
/**
 * Moment Mint
 * Forever Moments Agent API v1 Compliant
 * https://www.forevermoments.life/api/agent/v1/agents.md
 * 
 * ⚠️ Your up address is used as collection by default.
 * - If you haven't ever created collection it will fail, so register or create your collection at first.
 * 
 * Supported file extensions: **not verified**
 * - Images: .tif, .tiff, .gif, .apng, .xbm, .xlt, .jpe, .jpeg, .heif, .ico, .webp, .svgz, .jpg, .heic, .svg, .png, .bmp, .avif
 * - Videos: .mpe, .mpeg, .ogm, .mkv, .mpg, .wmv, .webm, .ogv, .mov, .asx, .mp4, .avi
 * - Audio: .opus, .oga, .mka, .flac, .weba, .wav, .ogg, .m4a, .mid, .mp3, .aiff, .wma, .au
 * 
 * Size limits: **according to the UI of official website**
 * - Images: 8MB max
 * - Videos: 100MB max
 * - Audio: 50MB max
 */

import { readFile } from 'fs/promises';
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { API_BASE } from '../../lib/core/constants.js';
import { uploadToPinata } from '../../lib/shared/pinata.js';

class MomentMintCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    // ─── Mode: Confirm or Execute ───────────────────────────────────────
    const isConfirmMode = !args.yes;
    
    // ─── Required Parameters ────────────────────────────────────────────
    if (!args.title) {
      throw new Error('--title is required');
    }
    if (!args.description) {
      throw new Error('--description is required');
    }
    if (!args.image && !args.video && !args.audio) {
      throw new Error('--image, --video, or --audio is required');
    }

    const title = args.title;
    const description = args.description;
    // Use user's UP address as default collection (can be overridden)
    const collection = args.collection || credentials.upAddress;
    const tags = args.tags ? args.tags.split(',') : [];

    // ─── Upload Files ───────────────────────────────────────────────────
    let imageCid = null;
    let imageHash = null;
    let videoCid = null;
    let videoHash = null;
    let audioCid = null;

    if (args.image) {
      console.log('📤 Uploading image to IPFS...');
      const imageBuffer = await readFile(args.image);
      imageCid = await uploadToPinata(args.image);
      imageHash = ethers.keccak256(imageBuffer);
      console.log(`   ✓ CID: ${imageCid}`);
      console.log(`   ✓ Hash: ${imageHash}`);
      console.log('');
    }

    if (args.video) {
      console.log('📤 Uploading video to IPFS...');
      const videoBuffer = await readFile(args.video);
      videoCid = await uploadToPinata(args.video);
      videoHash = ethers.keccak256(videoBuffer);
      console.log(`   ✓ CID: ${videoCid}`);
      console.log(`   ✓ Hash: ${videoHash}`);
      console.log('');
    }

    if (args.audio) {
      console.log('📤 Uploading audio to IPFS...');
      audioCid = await uploadToPinata(args.audio);
      console.log(`   ✓ CID: ${audioCid}`);
      console.log('');
    }

    // ─── Create Metadata ────────────────────────────────────────────────
    // NOTE: verification object is required for lsp-indexer to recognize images.
    // The FM API auto-fills width/height but does NOT auto-fill verification,
    // because it doesn't have access to the raw file bytes at that point.
    // The official FM UI computes keccak256 in the browser before sending metadata.
    console.log('📝 Creating metadata...');
    const imageVerification = imageHash
      ? { method: "keccak256(bytes)", data: imageHash }
      : undefined;
    const videoVerification = videoHash
      ? { method: "keccak256(bytes)", data: videoHash }
      : undefined;

    const metadata = {
      LSP4Metadata: {
        name: title,
        description: description,
        images: imageCid ? [[{
          url: `ipfs://${imageCid}`,
          verification: imageVerification
        }]] : [],
        icon: imageCid ? [{
          url: `ipfs://${imageCid}`,
          verification: imageVerification
        }] : [],
        videos: videoCid ? [[{
          url: `ipfs://${videoCid}`,
          verification: videoVerification
        }]] : [],
        assets: audioCid ? [{
          url: `ipfs://${audioCid}`,
          fileType: args.audio.split('.').pop().toLowerCase()
        }] : [],
        tags: tags,
        links: [],
        documents: [],
        attributes: []
      }
    };
    console.log('   ✓ Metadata created');
    console.log('');

    // ─── Step 1: moments/build-mint ─────────────────────────────────────
    console.log('📝 Step 1/4: Building transaction...');
    const buildRes = await fetch(`${API_BASE}/moments/build-mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userUPAddress: credentials.upAddress,
        collectionUP: collection,
        metadataJson: metadata,
      }),
    });

    if (!buildRes.ok) {
      throw new Error(`moments/build-mint failed: ${buildRes.status}`);
    }

    const buildResult = await buildRes.json();
    if (!buildResult.success) {
      throw new Error(`moments/build-mint error: ${JSON.stringify(buildResult)}`);
    }

    const payload = buildResult.data.derived.upExecutePayload;

    // ─── Confirm Mode ───────────────────────────────────────────────────
    if (isConfirmMode) {
      const mediaInfo = [];
      if (args.image) mediaInfo.push(`Image: ${args.image}`);
      if (args.video) mediaInfo.push(`Video: ${args.video}`);
      if (args.audio) mediaInfo.push(`Audio: ${args.audio}`);

      console.log(`
🆙 Moment Mint (Confirm)
────────────────────────────────────────
  Title: ${title}
  Description: ${description}
  ${mediaInfo.join('\n  ')}
  Collection: ${collection}
────────────────────────────────────────

Please review the details. To execute, run again with --yes flag:

  /lyx fm mint --title "${title}" --description "${description}" ${args.image ? `--image ${args.image}` : ''}${args.video ? ` --video ${args.video}` : ''}${args.audio ? ` --audio ${args.audio}` : ''} --yes
`);
      
      return { skipExecution: true };
    }

    // ─── Execute Mode ───────────────────────────────────────────────────
    console.log('🆙 Moment Mint');
    console.log(`   Title: ${title}`);
    console.log(`   Collection: ${collection}`);
    console.log('');

    // ─── Step 2: relay/prepare ──────────────────────────────────────────
    console.log('📝 Step 2/4: Preparing relay...');
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
    console.log('✅ Moment Mint Complete!');
    console.log(`   Title: ${title}`);
    console.log(`   TX: ${txHash}`);
    if (explorerUrl) console.log(`   Explorer: ${explorerUrl}`);

    return {
      skipExecution: true,
      meta: { title, collection, txHash, explorerUrl },
    };
  }

  onSuccess() {
    // All handled in build()
  }
}

new MomentMintCommand().run();