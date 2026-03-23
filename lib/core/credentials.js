/**
 * Credentials Management (core)
 * IMPORTANT: Changes to path resolution and save logic have broad impact — review required.
 *
 * Handles loading, saving, and path resolution for the credentials file.
 * File permissions (0o600) are enforced since the file contains a private key.
 *
 * Credentials file lookup order (see resolveCredentialsPath):
 *   1. UP_CREDENTIALS_PATH env var (existence check applied)
 *   2. ~/.openclaw/credentials/universal-profile-key.json
 *   3. ~/.clawdbot/credentials/universal-profile-key.json (backward-compat fallback)
 *
 * Credentials file format:
 * {
 *   "universalProfile": { "address": "0x..." },
 *   "controller": { "address": "0x...", "privateKey": "0x..." }
 * }
 */

import { readFile, writeFile, mkdir, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

/**
 * Resolve the credentials file path
 *
 * Note: This function returns a path only — it does NOT guarantee the file exists.
 *       Existence checks are the responsibility of the caller (loadCredentials).
 *       The one exception is UP_CREDENTIALS_PATH: if the env var points to a
 *       non-existent file, a warning is logged and the lookup falls back to defaults.
 *
 * @returns {string} Credentials file path (may not exist)
 */
export function resolveCredentialsPath() {
  // 1. Prefer env var if set (with existence check)
  if (process.env.UP_CREDENTIALS_PATH) {
    const envPath = process.env.UP_CREDENTIALS_PATH;
    if (existsSync(envPath)) {
      return envPath;
    }
    // Warn rather than silently ignoring a misconfigured env var
    console.warn(`WARN: UP_CREDENTIALS_PATH "${envPath}" does not exist. Falling back to default.`);
  }

  // 2. Primary: ~/.openclaw/credentials/universal-profile-key.json
  const primaryPath = join(os.homedir(), '.openclaw', 'credentials', 'universal-profile-key.json');
  if (existsSync(primaryPath)) {
    return primaryPath;
  }

  // 3. Fallback (backward compat): ~/.clawdbot/credentials/universal-profile-key.json
  return join(os.homedir(), '.clawdbot', 'credentials', 'universal-profile-key.json');
}

/**
 * Load credentials from the resolved credentials file
 *
 * @returns {Promise<{ upAddress: string, controllerAddress: string, privateKey: string }>}
 * @throws {Error} If the file is missing, required fields are absent, or JSON is invalid
 */
export async function loadCredentials() {
  const credentialsPath = resolveCredentialsPath();

  // resolveCredentialsPath returns a path without guaranteeing existence — check here
  if (!existsSync(credentialsPath)) {
    throw new Error(
      `Credentials file not found at: ${credentialsPath}\n` +
      `Set UP_CREDENTIALS_PATH environment variable or create the file manually`
    );
  }

  let config;
  try {
    config = JSON.parse(await readFile(credentialsPath, 'utf8'));
  } catch (error) {
    // Wrap I/O and JSON parse errors with context
    throw new Error(`Failed to read credentials file (${credentialsPath}): ${error.message}`);
  }

  // Validate required fields
  if (!config.universalProfile?.address) {
    throw new Error('Missing universalProfile.address in credentials file');
  }
  if (!config.controller?.address) {
    throw new Error('Missing controller.address in credentials file');
  }
  if (!config.controller?.privateKey) {
    throw new Error('Missing controller.privateKey in credentials file');
  }

  return {
    upAddress: config.universalProfile.address,
    controllerAddress: config.controller.address,
    privateKey: config.controller.privateKey,
  };
}

/**
 * Save credentials to the resolved credentials file
 * The file is saved with permissions 0o600 (owner read/write only).
 *
 * @param {Object} credentials
 * @param {Object} credentials.universalProfile          - UP info
 * @param {string} credentials.universalProfile.address  - UP address
 * @param {Object} credentials.controller                - Controller info
 * @param {string} credentials.controller.address        - Controller address
 * @param {string} credentials.controller.privateKey     - Private key
 * @returns {Promise<string>} Path where the file was saved
 */
export async function saveCredentials(credentials) {
  const credentialsPath = resolveCredentialsPath();

  // Create directory if it doesn't exist
  await mkdir(join(credentialsPath, '..'), { recursive: true });

  // Write as formatted JSON
  await writeFile(credentialsPath, JSON.stringify(credentials, null, 2), 'utf8');

  // Restrict permissions to protect the private key (Unix only)
  try {
    await chmod(credentialsPath, 0o600);
  } catch {
    // chmod is not supported on Windows — log a warning instead
    console.warn('WARN: Could not set file permissions. Ensure the credentials file is protected manually.');
  }

  return credentialsPath;
}

export default { loadCredentials, saveCredentials, resolveCredentialsPath };