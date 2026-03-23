#!/usr/bin/env node
/**
 * Update UP metadata (LSP3 Profile)
 */
import { readFile } from 'fs/promises';
import { ethers } from 'ethers';
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
    const useBuilder = !jsonFile && (args.name || args.description);
    if (!jsonFile && !useBuilder) {
      throw new Error('--json or --name/--description is required');
    }

    console.log('🆙 Update UP metadata');
    console.log('======================');
    console.log(`UP: ${credentials.upAddress}`);
    console.log(`Key: ${key}`);
    console.log('');

    let parsed;
    if (jsonFile) {
      console.log('📄 Reading JSON metadata...');
      parsed = JSON.parse(await readFile(jsonFile, 'utf8'));
      console.log(' ✓ JSON file:', jsonFile);
    } else {
      console.log('🏗️ Building metadata...');
      const lsp3Data = {};
      if (args.name) lsp3Data.name = args.name;
      if (args.description) lsp3Data.description = args.description;
      if (args.tags) lsp3Data.tags = args.tags.split(',').map(t => t.trim());

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
