/**
 * Pinata Upload Utilities (shared)
 * Supports image and JSON file uploads via the Forever Moments proxy endpoint.
 */

import { readFile } from 'fs/promises';

// Pinata API proxy URL
const PINATA_URL = 'https://www.forevermoments.life/api/pinata';

/**
 * Upload a file to Pinata (internal shared implementation)
 *
 * @internal Not exported — use uploadToPinata or uploadJsonToPinata instead.
 * @param {Buffer|Uint8Array} fileContent - File content
 * @param {string} filename - File name (used as the multipart field name)
 * @returns {Promise<string>} IPFS CID
 */
async function uploadFile(fileContent, filename) {
  const form = new FormData();
  form.append('file', new Blob([fileContent]), filename);

  const response = await fetch(PINATA_URL, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Pinata upload failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  if (!result.IpfsHash) {
    throw new Error('Pinata response missing IpfsHash');
  }
  return result.IpfsHash;
}

/**
 * Upload an image file to Pinata
 *
 * @param {string} filePath - Absolute or relative path to the image file
 * @returns {Promise<string>} IPFS CID
 */
export async function uploadToPinata(filePath) {
  const fileContent = await readFile(filePath);
  const filename = filePath.split('/').pop();
  return await uploadFile(fileContent, filename);
}

/**
 * Upload a JSON object or string to Pinata
 *
 * @param {string|Object} jsonContent - JSON string or object to upload
 * @param {string} [filename='metadata.json'] - File name for the upload
 * @returns {Promise<string>} IPFS CID
 */
export async function uploadJsonToPinata(jsonContent, filename = 'metadata.json') {
  const content = typeof jsonContent === 'string'
    ? jsonContent
    : JSON.stringify(jsonContent);
  const fileContent = Buffer.from(content, 'utf8');
  return await uploadFile(fileContent, filename);
}

export default { uploadToPinata, uploadJsonToPinata };