/**
 * DApp Command Base Class (core)
 * IMPORTANT: Changes to this file have broad impact — review required.
 *
 * All DApp commands extend DappCommand from this file.
 * Implementors only need to define build(). Transaction execution,
 * error handling, and argument parsing are handled by the base class.
 *
 * Execution models (delegated to executor.js):
 *   LUKSO / LUKSO Testnet : Gasless relay preferred → direct execution fallback on failure
 *   Base / Ethereum etc.  : Relay not supported, always uses direct execution
 */

import { ethers } from 'ethers';
import { executeWithFallback } from './executor.js';

/**
 * Parse command-line arguments
 * @returns {Object} Parsed arguments object
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      result[key] = value;
    }
  }

  return result;
}

/**
 * DappCommand - Base class for all DApp commands
 *
 * ## Subclass example
 * ```javascript
 * import { DappCommand, buildUpExecute } from '../../lib/core/command.js';
 * import { CONTRACTS } from '../../lib/core/constants.js';
 *
 * class FollowCommand extends DappCommand {
 *   async build({ args, credentials }) {
 *     const target = args.target;
 *     if (!target) throw new Error('--target is required');
 *
 *     const iface = new ethers.Interface(['function follow(address)']);
 *     const data = iface.encodeFunctionData('follow', [target]);
 *
 *     return {
 *       payload: buildUpExecute(CONTRACTS.LSP26, data),
 *       meta: { target }
 *     };
 *   }
 *
 *   onSuccess(result, context) {
 *     console.log(`Followed: ${result.meta.target}`);  // meta is stored in result.meta
 *   }
 * }
 *
 * new FollowCommand().run();
 * ```
 *
 * ## When sending LYX / ETH
 * On LUKSO (LSP6 model): embed the value inside the payload (UP.execute's value field).
 * On EVM (EOA model): include value in the return value of build().
 * See executor.js for details.
 */
export class DappCommand {
  /**
   * Whether UP credentials are required
   * @type {boolean}
   */
  needsCredentials = true;

  /**
   * Default network
   * @type {string}
   */
  defaultNetwork = 'lukso';

  /**
   * Main entry point
   */
  async run() {
    const context = await this.initialize();

    try {
      const result = await this.execute(context);
      this.onSuccess(result, context);
    } catch (error) {
      this.onError(error, context);
    }
  }

  /**
   * Initialization — resolves credentials and parses arguments
   * @returns {Object} Execution context
   */
  async initialize() {
    const argMap = parseArgs();

    // Credentials are injected via environment variables (set by cli.js)
    const env = process.env;
    const credentials = this.needsCredentials ? {
      upAddress: env.UP_ADDRESS,
      controllerAddress: env.CONTROLLER_ADDRESS,
      privateKey: env.CONTROLLER_PRIVATE_KEY
    } : null;

    if (this.needsCredentials && (!credentials?.upAddress || !credentials?.privateKey)) {
      throw new Error(
        'Credentials not configured.\n' +
        'Setup: create ~/.openclaw/credentials/universal-profile-key.json'
      );
    }

    return {
      args: argMap,
      credentials,
      network: argMap.network || this.defaultNetwork,
      direct: argMap.direct === 'true',
      fallback: argMap.fallback !== 'false'
    };
  }

  /**
   * Execute the transaction
   * Passes the result of build() to executor and submits the transaction.
   * @param {Object} context Execution context
   * @returns {Object} Transaction result { transactionHash, explorerUrl, meta }
   */
  async execute(context) {
    const buildResult = await this.build(context);

    if (buildResult.skipExecution) {
      return buildResult;
    }

    const txResult = await executeWithFallback({
      upAddress: context.credentials.upAddress,
      controllerAddress: context.credentials.controllerAddress,
      privateKey: context.credentials.privateKey,
      payload: buildResult.payload,
      value: buildResult.value || 0,  // Used only by EOA model (EVM). Ignored on LSP6.
      directMode: context.direct,
      fallbackEnabled: context.fallback,
      network: context.network
    });

    // Preserve meta so it is accessible as result.meta in onSuccess
    return { ...txResult, meta: buildResult.meta };
  }

  /**
   * Build the transaction data (must be implemented by subclass)
   *
   * @param {Object} context Execution context { args, credentials, network, direct, fallback }
   * @returns {Object} Build result
   *   - payload {string}        - Encoded transaction data
   *                               LUKSO: UP.execute() encoded via buildUpExecute
   *                               EVM  : Contract function calldata
   *   - value  {bigint}         - Native token amount (EOA model only, optional)
   *                               LUKSO (LSP6): ignored — embed LYX amount inside payload
   *                               EVM   (EOA) : set when sending ETH; omit for ERC20 etc.
   *   - meta   {Object}         - Arbitrary data passed to onSuccess/onError (optional)
   *   - skipExecution {boolean} - If true, skip executeWithFallback (e.g. confirm mode)
   */
  async build(context) {
    throw new Error('build() must be implemented by subclass');
  }

  /**
   * Success handler (can be overridden by subclass)
   * @param {Object} result Transaction result { transactionHash, explorerUrl, meta }
   * @param {Object} context Execution context
   */
  onSuccess(result, context) {
    console.log(`✅ Done`);
    console.log(`TX: ${result.transactionHash}`);
    if (result.explorerUrl) {
      console.log(`Explorer: ${result.explorerUrl}`);
    }
  }

  /**
   * Error handler (can be overridden by subclass)
   * @param {Error} error
   * @param {Object} context Execution context
   */
  onError(error, context) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Build a UP.execute() payload (LSP6 model only)
 *
 * Used when executing transactions via the LUKSO KeyManager.
 * Set value when the transaction involves a LYX transfer.
 * When passing this payload to executor, msg.value must be 0.
 *
 * @param {string}        target     - Target address (contract or EOA)
 * @param {string}        data       - Encoded function call data ('0x' for simple LYX transfer)
 * @param {bigint|number} value      - LYX amount to transfer (default: 0)
 * @param {number}        operation  - Operation type (default: 0 = CALL)
 * @returns {string} Encoded payload
 */
export function buildUpExecute(target, data, value = 0, operation = 0) {
  const iface = new ethers.Interface([
    'function execute(uint256 operation, address target, uint256 value, bytes data)'
  ]);

  return iface.encodeFunctionData('execute', [
    operation,
    target,
    BigInt(value),
    data
  ]);
}

/**
 * Factory function for simple command implementations
 * Use when you prefer a functional style over class syntax.
 *
 * @example
 * ```javascript
 * const MyCommand = createCommand(
 *   async (args, credentials) => {
 *     return { payload: '0x...', meta: { value: args.value } };
 *   },
 *   {
 *     onSuccess: (result, context) => {
 *       console.log(`Done: ${result.meta.value}`);
 *     }
 *   }
 * );
 *
 * new MyCommand().run();
 * ```
 *
 * @param {Function} buildFn              - build() implementation: (args, credentials) => { payload, value?, meta? }
 * @param {Object}   options
 * @param {boolean}  options.needsCredentials - Whether credentials are required (default: true)
 * @param {string}   options.defaultNetwork   - Default network
 * @param {Function} options.onSuccess        - Custom success handler
 * @param {Function} options.onError          - Custom error handler
 */
export function createCommand(buildFn, options = {}) {
  return class extends DappCommand {
    needsCredentials = options.needsCredentials !== false;
    defaultNetwork = options.defaultNetwork || 'lukso';

    async build(context) {
      return buildFn(context.args, context.credentials);
    }

    onSuccess(result, context) {
      if (options.onSuccess) {
        options.onSuccess(result, context);
      } else {
        super.onSuccess(result, context);
      }
    }

    onError(error, context) {
      if (options.onError) {
        options.onError(error, context);
      } else {
        super.onError(error, context);
      }
    }
  };
}

/**
 * Encode a contract function call
 *
 * @param {string} abi          - ABI string for a single function e.g. 'function transfer(address,uint256)'
 * @param {string} functionName - Function name
 * @param {Array}  args         - Function arguments
 * @returns {string} Encoded calldata
 */
export function encodeFunctionCall(abi, functionName, args) {
  const iface = new ethers.Interface([abi]);
  return iface.encodeFunctionData(functionName, args);
}

export default {
  DappCommand,
  buildUpExecute,
  createCommand,
  encodeFunctionCall
};