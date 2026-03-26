#!/usr/bin/env node
/**
 * Agent Token Claimer - Set Metadata
 * 
 * Usage:
 *   /lyx agent-token-claimer:set-metadata --token 0x... --image ./nft.png [--description "..."]
 * 
 * Sets LSP4 metadata for a deployed drop contract.
 * 
 * Note:
 *   - Required for NFT drops (LSP8)
 *   - Recommended for token drops (LSP7)
 */

import { DappCommand, CHAINS, buildUpExecute, encodeFunctionCall } from '../../lib/core/index.js';
import { uploadToPinata } from '../../lib/shared/pinata.js';
import { ethers } from 'ethers';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

// LSP4 Data Keys (from constants.js)
const LSP4_KEYS = {
  name: '0xdeba1e292f8ba88238e10ab3c7f88bd4be4fac56cad5194b6ecceaf653468af1',
  symbol: '0x2f0a68ab07768e01943a599e73362a0e17a63a72e94dd2e384d2c1d4db932756',
};

// ERC725Y ABI
const ERC725Y_ABI = [
  'function setData(bytes32 dataKey, bytes value) returns (bool)',
];

// ═══════════════════════════════════════════════════════════
// SetMetadataCommand
// ═══════════════════════════════════════════════════════════

class SetMetadataCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const tokenAddr = args['token'];
    const imagePath = args['image'];
    const description = args['description'] || '';
    const selectedNetwork = network || 'lukso';
    const chainConfig = CHAINS[selectedNetwork] || CHAINS.lukso;

    // Validate
    if (!tokenAddr) {
      throw new Error('--token is required (drop contract address)');
    }
    if (!ethers.isAddress(tokenAddr)) {
      throw new Error('Invalid token address format');
    }
    if (!imagePath) {
      throw new Error('--image is required (path to image file)');
    }

    console.log('');
    console.log('🖼️  Setting Metadata');
    console.log(`   Drop: ${tokenAddr}`);
    console.log(`   Image: ${imagePath}`);
    console.log(`   Network: ${chainConfig.name}`);
    console.log('');

    // Upload to IPFS
    console.log('📡 Uploading to IPFS...');
    const imageCid = await uploadToPinata(imagePath);
    console.log(`   ✅ Image CID: ${imageCid}`);
    console.log('');

    // Build LSP4 metadata
    console.log('📝 Building LSP4 metadata...');
    
    // Get token name/symbol from contract
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const drop = new ethers.Contract(tokenAddr, ['function name() view returns (string)', 'function symbol() view returns (string)'], provider);
    
    let tokenName = '';
    let tokenSymbol = '';
    try {
      tokenName = await drop.name();
      tokenSymbol = await drop.symbol();
    } catch {
      // Drop contract might not have name()/symbol()
      tokenName = 'Unknown';
      tokenSymbol = 'Unknown';
    }

    const metadata = {
      LSP4DigitalAssetMetadata: {
        name: tokenName,
        description: description,
        icon: {
          hashFunction: 'keccak256(utf8)',
          hash: ethers.keccak256(ethers.toUtf8Bytes(`ipfs://${imageCid}`)),
          url: `ipfs://${imageCid}`,
        },
      },
    };

    console.log(`   Name: ${tokenName}`);
    console.log(`   Description: ${description}`);
    console.log(`   Icon URL: ipfs://${imageCid}`);
    console.log('   ✅ Metadata built');
    console.log('');

    // Encode setData call
    console.log('📝 Encoding setData()...');
    
    // Encode metadata as bytes
    const metadataJson = JSON.stringify(metadata.LSP4DigitalAssetMetadata);
    const metadataBytes = ethers.toUtf8Bytes(metadataJson);
    
    // VerifiableURI encoding (simplified)
    // identifier: 2 bytes (0x6f35)
    // method: 4 bytes (0x90000000 for JSON)
    // dataHash: 32 bytes
    // url: string
    
    const identifier = '0x6f35';
    const method = '0x90000000'; // JSON
    const dataHash = ethers.keccak256(metadataBytes);
    const url = `ipfs://${imageCid}`;
    
    // Encode VerifiableURI
    const verifiableURI = ethers.solidityPacked(
      ['uint16', 'uint32', 'bytes32', 'string'],
      [parseInt(identifier), parseInt(method), dataHash, url]
    );

    const data = encodeFunctionCall(
      'function setData(bytes32 dataKey, bytes value) returns (bool)',
      'setData',
      [LSP4_KEYS.name, verifiableURI]
    );

    console.log(`   Payload length: ${data.length} bytes`);
    console.log('');

    // Build payload
    const payload = buildUpExecute(credentials.upAddress, tokenAddr, data);

    console.log('✅ Ready to set metadata!');
    console.log('');

    return {
      payload,
      meta: {
        tokenAddr,
        imageCid,
        tokenName,
        tokenSymbol,
        description,
      }
    };
  }

  /**
   * Success handler
   */
  onSuccess(result, context) {
    const meta = context.meta;
    
    console.log('🎉 Metadata Set Successfully!');
    console.log('');
    console.log(`   Drop: ${meta.tokenAddr}`);
    console.log(`   Name: ${meta.tokenName} (${meta.tokenSymbol})`);
    console.log(`   Image CID: ${meta.imageCid}`);
    console.log(`   TX Hash: ${result.transactionHash}`);
    console.log(`   Explorer: ${result.explorerUrl}`);
    console.log('');
    console.log('📋 Next Steps:');
    console.log('   1. Wait for confirmation');
    console.log('   2. Configure claim window: /lyx agent-token-claimer:configure --token 0x...');
    console.log('   3. View on explorer: ' + result.explorerUrl);
    console.log('');
  }

  /**
   * Error handler
   */
  onError(error, context) {
    console.log('');
    console.log('❌ Metadata Setting Failed');
    console.log('');
    console.log(`   Error: ${error.message}`);
    console.log('');
    console.log('   Possible reasons:');
    console.log('   - Not the owner of the drop contract');
    console.log('   - Insufficient LYX for gas');
    console.log('   - Invalid image path');
    console.log('   - IPFS upload failed');
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════

new SetMetadataCommand().run();
