#!/usr/bin/env node
/**
 * Update UP metadata (LSP3 Profile)
 * 
 * Since v1.1.0: Merges with existing metadata by default.
 * Use --replace flag for full replacement (legacy behavior).
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
    const replaceMode = args.replace === true;
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

    console.log('⛓ Writing to blockchain...');
    // Use setData directly as the payload
    const iface = new ethers.Interface(['function setData(bytes32 dataKey, bytes data) returns (bool)']);
    const payload = iface.encodeFunctionData('setData', [DATA_KEYS.LSP3Profile, verifiableUri]);

    return { payload, meta: { key, cid } };
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
