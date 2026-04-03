#!/usr/bin/env node
/**
 * Update UP metadata (LSP3 Profile)
 * 
 * Since v1.1.0: Merges with existing metadata by default.
 * Use --replace flag for full replacement (legacy behavior).
 * 
 * Since v1.2.0: Auto-fills verification hashes for images missing them.
 * This ensures lsp-indexer always recognizes profile/background images,
 * regardless of whether metadata was built manually (--json) or via flags.
 */
import { readFile } from 'fs/promises';
import { ethers } from 'ethers';
import { ERC725 } from '@erc725/erc725.js';
import LSP3Schemas from '@erc725/erc725.js/schemas/LSP3ProfileMetadata.json' with { type: 'json' };
import { DappCommand, buildUpExecute } from '../../lib/core/command.js';
import { DATA_KEYS } from '../../lib/core/constants.js';
import { uploadToPinata, uploadJsonToPinata } from '../../lib/shared/pinata.js';
import { buildVerifiableUri, fetchFromIpfs } from '../../lib/shared/metadata.js';

class UpdateProfileCommand extends DappCommand {
  async build({ args, credentials }) {
    const key = args.key;
    if (!key) {
      throw new Error('--key is required');
    }

    const jsonFile = args.json;
    const replaceMode = args.replace === true || args.replace === 'true';
    const useBuilder = !jsonFile && (args.name || args.description || args.tags || args.image || args.background || args.avatar || args.links);
    
    if (!jsonFile && !useBuilder) {
      throw new Error('--json or at least one field (--name/--description/--tags/--image/--background/--avatar/--links) is required');
    }

    console.log('🆙 Update UP metadata');
    console.log('======================');
    console.log(`UP: ${credentials.upAddress}`);
    console.log(`Key: ${key}`);
    console.log(`Mode: ${replaceMode ? 'Replace (full)' : 'Merge (default)'}`);
    console.log('');

    let parsed;
    if (jsonFile) {
      console.log('📄 Reading JSON metadata...');
      parsed = JSON.parse(await readFile(jsonFile, 'utf8'));
      console.log(' ✓ JSON file:', jsonFile);
      
      if (replaceMode) {
        // Replace mode: Use JSON as-is
        console.log('⚠️ Replace mode: Using JSON as-is (full replacement)');
      } else {
        // Merge mode: Merge with existing metadata
        console.log('🔄 Merge mode: Merging with existing metadata...');
        parsed = await this.mergeWithExisting(parsed, key, credentials);
      }

      // Auto-fill verification hashes for images missing them
      // This prevents lsp-indexer from ignoring images without verification
      if (key === 'LSP3Profile') {
        const profile = parsed.LSP3Profile || parsed;
        await this.ensureImageVerification(profile, 'profileImage');
        await this.ensureImageVerification(profile, 'backgroundImage');
        if (parsed.LSP3Profile) {
          parsed.LSP3Profile = profile;
        } else {
          parsed = profile;
        }
      }
    } else {
      // Builder mode: Fetch existing and merge
      console.log('🔄 Fetching existing metadata...');
      const existing = await this.fetchExistingMetadata(credentials.upAddress, key);
      console.log(' ✓ Existing metadata fetched');
      
      console.log('🏗️ Building updates...');
      const lsp3Data = existing;
      
      if (args.name) {
        console.log(`  - name: "${args.name}"`);
        lsp3Data.name = args.name;
      }
      if (args.description) {
        console.log(`  - description: "${args.description}"`);
        lsp3Data.description = args.description;
      }
      if (args.tags) {
        console.log(`  - tags: [${args.tags}]`);
        lsp3Data.tags = args.tags.split(',').map(t => t.trim());
      }

      if (args.image) {
        console.log('📤 Uploading profile image...');
        const cid = await uploadToPinata(args.image);
        lsp3Data.profileImage = [await this.buildImageMetadata(args.image, cid, args.imageWidth, args.imageHeight)];
        console.log(' ✓ CID:', cid);
      }

      if (args.background) {
        console.log('📤 Uploading background image...');
        const cid = await uploadToPinata(args.background);
        lsp3Data.backgroundImage = [await this.buildImageMetadata(args.background, cid, args.bgWidth, args.bgHeight)];
        console.log(' ✓ CID:', cid);
      }

      if (args.avatar) {
        console.log('📤 Uploading avatar...');
        const cid = await uploadToPinata(args.avatar);
        lsp3Data.avatar = [await this.buildAvatarMetadata(args.avatar, cid)];
        console.log(' ✓ CID:', cid);
      }

      if (args.links) {
        console.log('🔗 Building links...');
        lsp3Data.links = this.parseLinks(args.links);
        console.log(' ✓', lsp3Data.links.length, 'entries');
      }

      parsed = { [key]: lsp3Data };
      console.log(' ✓ Metadata build complete');
    }

    if (key === 'LSP3Profile' && !parsed.LSP3Profile) {
      throw new Error('LSP3Profile key is required');
    }

    const normalizedJson = JSON.stringify(parsed);
    console.log(' ✓ Valid LSP metadata');

    console.log('📤 Uploading to IPFS...');
    const cid = await uploadJsonToPinata(normalizedJson, 'lsp-metadata.json');
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
      console.log(` /lyx up:update-profile --yes`);
      console.log('');
      return { skipExecution: true };
    }

    console.log('⛓ Writing to blockchain...');
    
    // Use executeSetDataWithFallback() for gasless relay support.
    // Relay path:  Relayer → KM.executeRelayCall(sig, ..., UP.setData(key, value)) → UP
    //              msg.sender at UP = KM; attribution via PermissionsVerified event
    // Direct path: Controller EOA → UP.setData(key, value)
    //              msg.sender at UP = Controller EOA (proper attribution)
    // Use --direct flag to force direct execution (skip relay, save quota).
    const { executeSetDataWithFallback } = await import('../../lib/core/executor.js');
    const result = await executeSetDataWithFallback({
      dataKey: DATA_KEYS.LSP3Profile,
      dataValue: verifiableUri,
      controllerAddress: credentials.controllerAddress,
      privateKey: credentials.privateKey,
      upAddress: credentials.upAddress,
      directMode: args.direct === true || args.direct === 'true',
    });
    
    console.log('✅ Metadata update completed!');
    console.log(`TX: ${result.transactionHash}`);
    console.log(`Explorer: ${result.explorerUrl}`);
    console.log('');
    
    // Skip default execution flow (we already executed)
    return { skipExecution: true, meta: { ...result, key, cid } };
  }

  /**
   * Auto-fill verification hashes for image entries that are missing them.
   * 
   * lsp-indexer requires verification objects to recognize images.
   * When metadata is built manually (--json mode or by AI agent),
   * verification is often omitted, causing images to not appear.
   * 
   * This fetches the image bytes from IPFS and computes keccak256.
   * Only processes ipfs:// URLs (https:// images already have verification
   * from the UP cloud proxy).
   * 
   * @param {Object} profile - LSP3Profile object (mutated in place)
   * @param {string} fieldName - 'profileImage' or 'backgroundImage'
   */
  async ensureImageVerification(profile, fieldName) {
    const images = profile[fieldName];
    if (!Array.isArray(images) || images.length === 0) return;

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.verification) continue; // Already has verification

      const url = img.url;
      if (!url) continue;

      // Only process ipfs:// URLs
      if (!url.startsWith('ipfs://')) {
        console.log(`  ⚠️ ${fieldName}[${i}]: non-IPFS URL, skipping verification`);
        continue;
      }

      try {
        const cid = url.replace('ipfs://', '');
        console.log(`  🔐 ${fieldName}[${i}]: fetching from IPFS for verification...`);
        const imageBytes = await fetchFromIpfs(cid);
        const hash = ethers.keccak256(imageBytes);
        img.verification = { method: 'keccak256(bytes)', data: hash };
        console.log(`  ✓ ${fieldName}[${i}]: verification added (${hash.slice(0, 14)}...)`);
      } catch (err) {
        console.log(`  ⚠️ ${fieldName}[${i}]: could not fetch for verification: ${err.message}`);
        // Continue without verification — better than failing the whole update
      }
    }
  }

  /**
   * Fetch existing metadata from chain using erc725.js
   */
  async fetchExistingMetadata(upAddress, key) {
    const { chainConfig } = await this.getProvider();
    
    try {
      const erc725 = new ERC725(
        LSP3Schemas,
        upAddress,
        chainConfig.rpcUrl,
        { ipfsGateway: 'https://api.universalprofile.cloud/ipfs/' }
      );
      
      const profile = await erc725.fetchData('LSP3Profile');
      return profile.value.LSP3Profile || {};
    } catch (error) {
      console.log('⚠️ erc725.js fetchData failed:', error.message);
      return {};
    }
  }

  /**
   * Merge new metadata with existing
   */
  async mergeWithExisting(newParsed, key, credentials) {
    const existing = await this.fetchExistingMetadata(credentials.upAddress, key);
    
    if (Object.keys(existing).length === 0) {
      // No existing data: return as new
      return newParsed;
    }
    
    // Deep merge
    const merged = JSON.parse(JSON.stringify(existing));
    
    for (const [k, v] of Object.entries(newParsed)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && merged[k]) {
        // Recursively merge objects
        merged[k] = { ...merged[k], ...v };
      } else {
        // Overwrite other values
        merged[k] = v;
      }
    }
    
    return merged;
  }

  /**
   * Get provider from chain config
   */
  async getProvider() {
    const { CHAINS } = await import('../../lib/core/constants.js');
    const chainConfig = CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    return { provider, chainConfig };
  }

  async buildImageMetadata(filePath, cid, width, height) {
    const imageBytes = await readFile(filePath);
    const hash = ethers.keccak256(imageBytes);
    const url = `ipfs://${cid}`;
    return { width: width || 500, height: height || 500, url, verification: { method: 'keccak256(bytes)', data: hash } };
  }

  async buildAvatarMetadata(filePath, cid) {
    const imageBytes = await readFile(filePath);
    const hash = ethers.keccak256(imageBytes);
    const url = `ipfs://${cid}`;
    const ext = filePath.split('.').pop().toLowerCase();
    const fileType = { fbx: 'fbx', obj: 'obj', gltf: 'gltf', glb: 'glb', png: 'png', jpg: 'jpg', jpeg: 'jpeg', gif: 'gif', webp: 'webp' }[ext] || 'unknown';
    return { verification: { method: 'keccak256(bytes)', data: hash }, url, fileType };
  }

  parseLinks(linksStr) {
    if (!linksStr) return [];
    return linksStr.split(',').map(pair => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) throw new Error('Invalid format');
      return { title: pair.slice(0, eqIndex).trim(), url: pair.slice(eqIndex + 1).trim() };
    });
  }

  onSuccess(result) {
    console.log('');
    console.log('✅ Metadata update completed!');
    console.log('TX:', result.transactionHash);
    console.log('Explorer:', result.explorerUrl);
  }
}
new UpdateProfileCommand().run();