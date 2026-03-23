/**
 * LSP6 Permission Encoding/Decoding Utilities
 */

import { PERMISSIONS, PERMISSION_NAMES, DATA_KEYS } from './constants.js';

const ZERO_BYTES32 = '0x' + '0'.repeat(64);

/**
 * Encode permission names into bytes32 format
 * @param {string[]} permissionNames - Array of permission names
 * @returns {string} Encoded permissions as hex string
 */
export function encodePermissions(permissionNames) {
  if (!Array.isArray(permissionNames)) {
    permissionNames = [permissionNames];
  }

  let combined = 0n;

  for (const name of permissionNames) {
    const upperName = name.toUpperCase();

    if (upperName === 'ALL_PERMISSIONS') {
      return PERMISSIONS.ALL_PERMISSIONS;
    }

    const permValue = PERMISSIONS[upperName];
    if (!permValue) {
      throw new Error(`Unknown permission: ${name}`);
    }

    combined |= BigInt(permValue);
  }

  return '0x' + combined.toString(16).padStart(64, '0');
}

/**
 * Decode permission bytes32 into permission names
 * @param {string} permissions - Hex string of permissions
 * @returns {string[]} Array of permission names
 */
export function decodePermissions(permissions) {
  if (!permissions || permissions === '0x' || permissions === ZERO_BYTES32) {
    return [];
  }

  const result = [];
  const permValue = BigInt(permissions);

  for (const [bit, name] of Object.entries(PERMISSION_NAMES)) {
    const bitNum = parseInt(bit);
    const mask = 1n << BigInt(bitNum);

    if ((permValue & mask) !== 0n) {
      result.push(name);
    }
  }

  return result;
}

/**
 * Build LSP6 permissions data key for a controller address
 * @param {string} controllerAddress - Controller address
 * @returns {string} ERC725Y data key for permissions
 */
export function buildPermissionsDataKey(controllerAddress) {
  const prefix = DATA_KEYS['AddressPermissions:Permissions'];
  const addressPart = controllerAddress.slice(2).toLowerCase();
  return prefix + addressPart;
}

export default {
  encodePermissions,
  decodePermissions,
  buildPermissionsDataKey,
};