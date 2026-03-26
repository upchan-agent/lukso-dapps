/**
 * LSP Metadata Builders
 * LSP3 / LSP4 compliant metadata construction utilities
 */

import { ethers } from 'ethers';

// ============================================================
// VerifiableURI Utilities
// ============================================================

/**
 * Build a VerifiableURI
 * Format: 0x00006f357c6a + dataLen(2) + hash(32) + url
 *
 * @param {Buffer} contentBytes - Raw content bytes (used to compute keccak256 hash)
 * @param {string} cid - IPFS CID
 * @returns {string} VerifiableURI hex string
 */
export function buildVerifiableUri(contentBytes, cid) {
  const hash = ethers.keccak256(contentBytes).slice(2);
  const url = Buffer.from(`ipfs://${cid}`, 'utf8').toString('hex');
  return `0x00006f357c6a0020${hash}${url}`;
}

/**
 * Decode a VerifiableURI
 * Format: identifier(2) + method(4) + dataLen(2) + hash(32) + url(variable)
 *
 * Note: Function name uses uppercase URI to match the LSP standard terminology.
 * New callers may prefer decodeVerifiableUri (lowercase) if added in future.
 *
 * @param {string} data - VerifiableURI hex string
 * @returns {{ hash: string, url: string, dataLen?: number } | { raw: string } | null}
 */
export function decodeVerifiableURI(data) {
  if (!data || data === '0x') {
    return null;
  }

  // Standard format: 0x00006f357c6a + dataLen(2) + hash(32) + url
  if (data.startsWith('0x00006f357c6a')) {
    const dataLen = parseInt(data.slice(14, 18), 16);
    const hash = '0x' + data.slice(18, 82);
    const urlHex = data.slice(82);
    const url = Buffer.from(urlHex, 'hex').toString('utf8');

    return { hash, url, dataLen };
  }

  // Legacy format: 0x6f357c6a + hash + url
  if (data.startsWith('0x6f357c6a')) {
    const hash = '0x' + data.slice(10, 74);
    const urlHex = data.slice(74);
    const url = Buffer.from(urlHex, 'hex').toString('utf8');

    return { hash, url };
  }

  return { raw: data };
}

/**
 * Extract the URI from a VerifiableURI (convenience wrapper)
 * Kept for backward compatibility.
 *
 * @param {string} verifiableUri - VerifiableURI hex string
 * @returns {string|null} URI string, or null if not decodable
 */
export function extractUriFromVerifiableUri(verifiableUri) {
  const decoded = decodeVerifiableURI(verifiableUri);
  return decoded?.url || null;
}

/**
 * Fetch raw data from IPFS
 *
 * @param {string} cid - IPFS CID (ipfs:// prefix is optional)
 * @returns {Promise<Buffer>} Raw content as Buffer
 */
export async function fetchFromIpfs(cid) {
  const cleanCid = cid.replace('ipfs://', '');
  const res = await fetch(`https://api.universalprofile.cloud/ipfs/${cleanCid}`);
  if (!res.ok) {
    throw new Error(`IPFS fetch failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Fetch and parse JSON from IPFS
 *
 * @param {string} cid - IPFS CID (ipfs:// prefix is optional)
 * @returns {Promise<Object>} Parsed JSON object
 */
export async function fetchJsonFromIpfs(cid) {
  const cleanCid = cid.replace('ipfs://', '');
  const res = await fetch(`https://api.universalprofile.cloud/ipfs/${cleanCid}`);
  if (!res.ok) {
    throw new Error(`IPFS fetch failed (${res.status})`);
  }
  return await res.json();
}

// ============================================================
// Metadata Builders
// ============================================================

/**
 * Build LSP4 metadata (LSP4-DigitalAsset-Metadata compliant)
 * 
 * Supports LSP7 tokens and LSP8 NFTs with full LSP4 spec compliance.
 * Reference: https://docs.lukso.tech/standards/LSP-4-DigitalAsset-Metadata/
 * 
 * @param {Object} options - Metadata options
 * @param {string} options.name - Asset name (required)
 * @param {string} options.description - Asset description (required)
 * @param {Array} [options.links=[]] - Related links [{title, url}]
 * @param {Array} [options.icon=[]] - Token icon for LSP7 (multiple sizes) [{width, height, url, verification?}]
 * @param {Array} [options.images=[]] - NFT images for LSP8 [[{width, height, url, verification?}]]
 * @param {Array} [options.assets=[]] - Additional assets (video, audio, 3D, etc.) [{url, fileType, verification?}]
 * @param {Array} [options.attributes=[]] - Custom attributes [{key, value, type}]
 * @param {Array} [options.tags=[]] - Legacy tags (converted to attributes for backward compatibility)
 * @returns {Object} LSP4Metadata object
 */
export function createLSP4Metadata(options) {
  const {
    name,
    description,
    links = [],
    icon = [],
    images = [],
    assets = [],
    attributes = [],
    tags = []  // Legacy support
  } = options || {};

  if (!name || !description) {
    throw new Error('LSP4 metadata requires name and description');
  }

  // Convert legacy tags to attributes for backward compatibility
  const mergedAttributes = [
    ...attributes,
    ...(tags.length > 0 ? [{ key: 'tags', value: tags.join(', '), type: 'string' }] : [])
  ];

  return {
    LSP4Metadata: {
      name,
      description,
      ...(links.length > 0 && { links }),
      ...(icon.length > 0 && { icon }),
      ...(images.length > 0 && { images }),
      ...(assets.length > 0 && { assets }),
      ...(mergedAttributes.length > 0 && { attributes: mergedAttributes })
    }
  };
}

/**
 * Build LSP3 metadata (for Collection / Profile)
 *
 * @param {string}      name           - Profile or collection name
 * @param {string}      description    - Description
 * @param {string}      imageCid       - Profile image IPFS CID
 * @param {Buffer|null} imageBytes     - Raw image bytes for hash verification (optional)
 * @param {string}      category       - Content category
 * @param {number}      collectionType - Collection type (default: 1)
 * @param {string}      visibility     - Visibility setting (default: 'public')
 * @returns {Object} LSP3Profile metadata object
 */
export function createLSP3Metadata(name, description, imageCid, imageBytes = null, category, collectionType = 1, visibility = 'public') {
  const hash = imageBytes ? ethers.keccak256(imageBytes) : '0x';

  return {
    LSP3Profile: {
      name: name,
      description: description,
      profileImage: [{
        width: 1920,
        height: 1080,
        url: `ipfs://${imageCid}`,
        verification: {
          method: 'keccak256(bytes)',
          data: hash
        }
      }],
      categories: [category],
      visibility: visibility,
      collectionType: collectionType,
      status: 'active',
      timestamps: {
        createdAt: new Date().toISOString()
      }
    }
  };
}

export default {
  buildVerifiableUri,
  decodeVerifiableURI,
  extractUriFromVerifiableUri,
  fetchFromIpfs,
  fetchJsonFromIpfs,
  createLSP4Metadata,
  createLSP3Metadata,
};