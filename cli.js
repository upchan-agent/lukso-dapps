#!/usr/bin/env node
/**
 * lukso-dapps CLI - Main entry point
 * General-purpose skill for interacting with DApps on the LUKSO blockchain
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { loadCredentials } from './lib/core/credentials.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Minimal YAML parser (supports the dapps.yaml structure only)
 */
function parseYaml(yaml) {
  const result = { dapps: {} };
  let currentDapp = null;
  let currentCmd = null;

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;

    // Root key
    if (trimmed === 'dapps:') continue;

    // DApp namespace (2-space indent)
    if (indent === 2 && trimmed.endsWith(':') && !trimmed.includes(': ')) {
      currentDapp = trimmed.slice(0, -1);
      result.dapps[currentDapp] = { description: '', commands: {} };
      currentCmd = null;
      continue;
    }

    // DApp description (4-space indent)
    if (indent === 4 && currentDapp && trimmed.startsWith('description:')) {
      result.dapps[currentDapp].description = trimmed.split(': ')[1]?.replace(/^["']|["']$/g, '') || '';
      continue;
    }

    // commands: key (4-space indent)
    if (indent === 4 && trimmed === 'commands:') continue;

    // Command definition (6-space indent)
    if (indent === 6 && trimmed.endsWith(':') && !trimmed.includes(': ')) {
      currentCmd = trimmed.slice(0, -1);
      result.dapps[currentDapp].commands[currentCmd] = {};
      continue;
    }

    // Command properties (8-space indent)
    if (indent === 8 && currentCmd) {
      const colonIdx = trimmed.indexOf(': ');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx);
        let value = trimmed.slice(colonIdx + 2).replace(/^["']|["']$/g, '');

        // Parse inline array
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        }

        // Parse boolean
        if (value === 'true') value = true;
        if (value === 'false') value = false;

        result.dapps[currentDapp].commands[currentCmd][key] = value;
      }
    }
  }

  return result;
}

// Load dapps.yaml
let manifest;
try {
  const yamlContent = readFileSync(join(__dirname, 'dapps.yaml'), 'utf8');
  manifest = parseYaml(yamlContent);
} catch (error) {
  console.error('Failed to load dapps.yaml:', error.message);
  process.exit(1);
}

/**
 * Build command registry from manifest
 */
const commands = new Map();
for (const [namespace, dapp] of Object.entries(manifest.dapps)) {
  for (const [name, config] of Object.entries(dapp.commands)) {
    commands.set(`${namespace}:${name}`, { ...config, namespace, name });
  }
}

/**
 * Spawn and run a Node.js script with the given args and environment variables
 */
function runScript(scriptPath, args, envVars) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...envVars };
    const proc = spawn('node', [scriptPath, ...args], {
      env,
      stdio: 'inherit'
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Script failed: ${error.message}`));
    });
  });
}

/**
 * Parse the command name from CLI arguments
 * Supports both "namespace:command" and "namespace command" formats
 */
function parseCommandName(args) {
  if (args.length === 0) return null;

  const first = args[0];

  // Already in namespace:command format
  if (first.includes(':')) return first;

  // Fallback: namespace subcommand format (e.g. "up follow")
  const second = args[1];
  if (!second) return null;

  return `${first}:${second}`;
}

/**
 * Print help listing all available commands
 */
function showHelp() {
  console.log('=== lukso-dapps ===\n');
  console.log('Usage: /lyx <namespace>:<command> [options]\n');

  for (const [ns, dapp] of Object.entries(manifest.dapps)) {
    console.log(`[${ns}]${dapp.description ? ' - ' + dapp.description : ''}`);
    for (const [name, config] of Object.entries(dapp.commands)) {
      const creds = config.credentials === false ? '' : ' 🔐';
      console.log(`  /lyx ${ns}:${name}${creds} - ${config.description || ''}`);
    }
    console.log('');
  }

  console.log('Global Options:');
  console.log('  --network <name>    Network selection (lukso|luksoTestnet|base|ethereum)');
  console.log('  --direct            Skip gasless relay and execute directly');
  console.log('  --fallback false    Disable direct execution fallback on relay failure');
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    return;
  }

  // Built-in commands
  if (args[0] === 'status') {
    try {
      const creds = await loadCredentials();
      console.log('=== lukso-dapps status ===');
      console.log('UP Address:  ', creds.upAddress);
      console.log('Controller:  ', creds.controllerAddress);
      console.log('');
      showHelp();
    } catch (error) {
      console.error('Failed to load credentials:', error.message);
      console.log('Setup: create ~/.openclaw/credentials/universal-profile-key.json');
      process.exit(1);
    }
    return;
  }

  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  // Parse and resolve command
  const cmdName = parseCommandName(args);
  const config = commands.get(cmdName);

  if (!config) {
    console.error(`Unknown command: ${args.join(' ')}`);
    console.error('Available commands:');
    showHelp();
    process.exit(1);
  }

  // Strip command name tokens from args
  const skipCount = cmdName.includes(':') ? 1 : 2;
  const cmdArgs = args.slice(skipCount);

  // Prepare environment variables
  const envVars = {};

  if (config.credentials !== false) {
    try {
      const creds = await loadCredentials();
      envVars.UP_ADDRESS = creds.upAddress;
      envVars.CONTROLLER_ADDRESS = creds.controllerAddress;
      envVars.CONTROLLER_PRIVATE_KEY = creds.privateKey;
    } catch (error) {
      console.error('Failed to load credentials:', error.message);
      console.log('Setup: create ~/.openclaw/credentials/universal-profile-key.json');
      process.exit(1);
    }
  }

  // Resolve and validate script path
  const scriptPath = join(__dirname, config.file);

  if (!existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  // Execute
  try {
    await runScript(scriptPath, cmdArgs, envVars);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error.message);
  process.exit(1);
});