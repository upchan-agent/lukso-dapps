/** 
 * Transaction Execution (Core) 
 * IMPORTANT: Changes to this file have broad impact and require review.
 * 
 * All executions branch according to the following model:
 * 
 * executionModel: 'lsp6' (LUKSO / LUKSO Testnet)
 * - Gasless relay is preferred → falls back to direct execution on failure
 * - The LYX transfer amount is embedded in the payload (the value field of UP.execute). No msg.value is needed.
 * 
 * executionModel: 'eoa' (Base / Ethereum, etc.)
 * - Relay is not supported, so direct execution is always used
 * - EOA → wallet.sendTransaction({ to, data, value })
 * - ETH transfer amount is specified via the value parameter.
 * 
 * --- msg.sender attribution model ---
 * 
 * For setData operations (LSP3 profile updates, etc.), there are two execution paths:
 * 
 * 1. Direct (executeDirectSetData):
 *    Controller EOA → UP.setData() → LSP20 verify via KM
 *    msg.sender at UP = Controller EOA ← proper attribution
 * 
 * 2. Relay (executeRelaySetData):
 *    Relayer EOA → KM.executeRelayCall(sig, ..., setDataPayload) → UP.setData()
 *    msg.sender at UP = KM (unavoidable by LSP6 design)
 *    Attribution: KM emits PermissionsVerified(controllerAddress) event
 *    → Indexers (UniversalEverything, etc.) use this event for attribution
 *    → This is the same mechanism the official browser extension uses
 * 
 * For general execute operations (LYX transfers, contract calls):
 *    Use executeRelay() / executeDirect() / executeWithFallback() as before.
 *    The payload is UP.execute(operation, target, value, data).
 * 
 * For setData operations specifically:
 *    Use executeRelaySetData() / executeDirectSetData() / executeSetDataWithFallback()
 *    The payload is UP.setData(key, value) — NOT wrapped in UP.execute().
 */
import { ethers } from 'ethers';
import { CHAINS, LSP25_VERSION, ABIS } from './constants.js';
const DEFAULT_NETWORK = 'lukso';

/**
 * Get chain configuration (falls back to lukso if not found)
 */
function getChainConfig(network) {
  const config = CHAINS[network];
  if (!config) {
    console.warn(`⚠️ Unknown network "${network}". Falling back to lukso.`);
    return CHAINS[DEFAULT_NETWORK];
  }
  return config;
}

// ============================================================
//  Internal: LSP25 signature builder
// ============================================================

/**
 * Build LSP25 signature for a relay call payload.
 * 
 * This is the shared signing logic used by both executeRelay() and
 * executeRelaySetData(). Extracted to avoid code duplication.
 * 
 * @param {Object} params
 * @param {string} params.upAddress - Universal Profile address
 * @param {string} params.controllerAddress - Controller EOA address
 * @param {string} params.privateKey - Controller's private key
 * @param {string} params.payload - ABI-encoded function call on UP
 * @param {string} params.network - Network name
 * @returns {Promise<{signature, nonce, kmAddress, chainConfig}>}
 */
async function _buildRelaySignature({ upAddress, controllerAddress, privateKey, payload, network }) {
  const chainConfig = getChainConfig(network);
  if (!chainConfig.supportsRelay || !chainConfig.relayerUrl) {
    throw new Error(
      `Chain "${network}" does not support gasless relay. Please use direct execution.`
    );
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const up = new ethers.Contract(upAddress, ABIS.LSP0, provider);
  const kmAddress = await up.owner();
  const km = new ethers.Contract(kmAddress, ABIS.LSP6, provider);
  const nonce = await km.getNonce(controllerAddress, 0);

  // Build the LSP25 message
  // msg.value to KeyManager is always 0.
  const encodedMessage = ethers.solidityPacked(
    ['uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes'],
    [LSP25_VERSION, BigInt(chainConfig.chainId), nonce, 0n, 0n, payload]
  );

  if (process.env.DEBUG_LSP25) {
    console.log('[DEBUG] LSP25 encoded message:', {
      version: Number(LSP25_VERSION),
      chainId: Number(chainConfig.chainId),
      nonce: Number(nonce),
      validityTimestamps: 0,
      payloadLength: payload.length,
    });
  }

  // EIP-191 v0 hash
  const hash = ethers.keccak256(
    ethers.concat(['0x19', '0x00', kmAddress, encodedMessage])
  );

  if (process.env.DEBUG_LSP25) {
    console.log('[DEBUG] EIP-191 hash:', hash);
    console.log('[DEBUG] KeyManager address:', kmAddress);
  }

  // Sign
  const sig = new ethers.SigningKey(privateKey).sign(hash);
  const signature = ethers.Signature.from(sig).serialized;

  // Local signature verification
  const recovered = ethers.recoverAddress(hash, signature);
  if (recovered.toLowerCase() !== controllerAddress.toLowerCase()) {
    throw new Error(`Signature verification failed! recovered: ${recovered}, expected: ${controllerAddress}`);
  }

  return { signature, nonce, kmAddress, chainConfig };
}

/**
 * Send a signed relay request to the LUKSO relayer API.
 * 
 * @param {Object} params
 * @param {string} params.upAddress - Universal Profile address
 * @param {string} params.payload - ABI-encoded payload
 * @param {string} params.signature - LSP25 signature
 * @param {BigInt} params.nonce - Controller nonce
 * @param {Object} params.chainConfig - Chain configuration
 * @returns {Promise<{transactionHash: string, explorerUrl: string}>}
 */
async function _sendRelayRequest({ upAddress, payload, signature, nonce, chainConfig }) {
  const relayRequest = {
    address: upAddress,
    transaction: {
      abi: payload,
      signature,
      nonce: Number(nonce),
      validityTimestamps: '0x0',
      value: ethers.toBeHex(0),
    }
  };

  const response = await fetch(`${chainConfig.relayerUrl}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relayRequest)
  });
  const result = await response.json();

  if (!response.ok || !result.transactionHash) {
    const error = new Error(`Relay API (${response.status}): ${JSON.stringify(result)}`);
    error.statusCode = response.status;
    error.responseBody = result;
    throw error;
  }

  return {
    transactionHash: result.transactionHash,
    explorerUrl: `${chainConfig.explorerUrl}/tx/${result.transactionHash}`
  };
}

// ============================================================
//  General purpose: execute() operations (LYX transfers, etc.)
// ============================================================

/**
 * Execute via gasless relay (LUKSO chains only)
 * 
 * Use for general UP.execute() operations (LYX transfers, contract calls).
 * The payload should be UP.execute(operation, target, value, data) encoded.
 * 
 * For setData operations, use executeRelaySetData() instead.
 */
export async function executeRelay(upAddress, controllerAddress, privateKey, payload, network = DEFAULT_NETWORK) {
  const { signature, nonce, chainConfig } = await _buildRelaySignature({
    upAddress, controllerAddress, privateKey, payload, network
  });

  return _sendRelayRequest({ upAddress, payload, signature, nonce, chainConfig });
}

/**
 * Direct execution (via KeyManager)
 * 
 * executionModel: 'lsp6' (LUKSO)
 * Calls KeyManager.execute(payload).
 * msg.sender at UP = KM. For setData operations where attribution matters,
 * use executeDirectSetData() instead.
 * 
 * executionModel: 'eoa' (Base / Ethereum, etc.)
 * Calls wallet.sendTransaction({ to, data, value }).
 */
export async function executeDirect(payload, privateKey, upAddress, network = DEFAULT_NETWORK, value = 0) {
  const chainConfig = getChainConfig(network);
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // EOA model (Base / Ethereum, etc.)
  if (chainConfig.executionModel === 'eoa') {
    const valueBigInt = typeof value === 'bigint' ? value : BigInt(value);
    const tx = await wallet.sendTransaction({
      to: upAddress,
      data: payload,
      ...(valueBigInt > 0n ? { value: valueBigInt } : {}),
    });
    const receipt = await tx.wait();
    return {
      transactionHash: receipt.hash,
      explorerUrl: `${chainConfig.explorerUrl}/tx/${receipt.hash}`
    };
  }

  // LSP6 model (LUKSO)
  const up = new ethers.Contract(upAddress, ABIS.LSP0, provider);
  const kmAddress = await up.owner();
  const km = new ethers.Contract(kmAddress, ABIS.LSP6, wallet);
  const tx = await km.execute(payload);
  const receipt = await tx.wait();
  return {
    transactionHash: receipt.hash,
    explorerUrl: `${chainConfig.explorerUrl}/tx/${receipt.hash}`
  };
}

/**
 * Relay-first + direct fallback (general execute operations)
 * 
 * For setData operations, use executeSetDataWithFallback() instead.
 */
export async function executeWithFallback(options) {
  const {
    upAddress,
    controllerAddress,
    privateKey,
    payload,
    value = 0,
    directMode = false,
    fallbackEnabled = true,
    network = DEFAULT_NETWORK,
  } = options;

  const chainConfig = getChainConfig(network);

  const runDirect = async () => {
    return await executeDirect(payload, privateKey, upAddress, network, value);
  };

  if (!chainConfig.supportsRelay) {
    return await runDirect();
  }

  if (directMode) {
    return await runDirect();
  }

  try {
    if (process.env.DEBUG_LSP25) {
      console.log('[DEBUG] Attempting relay execution...');
    }
    const relayResult = await executeRelay(upAddress, controllerAddress, privateKey, payload, network);
    if (process.env.DEBUG_LSP25) {
      console.log('[DEBUG] Relay execution successful:', relayResult.transactionHash);
    }
    return relayResult;
  } catch (relayError) {
    const errorMessage = relayError.message || 'Unknown relay error';
    const statusCode = relayError.statusCode;
    console.warn(`⚠️ Relay error${statusCode ? ` (${statusCode})` : ''}: ${errorMessage}`);
    if (process.env.DEBUG_LSP25) {
      console.warn('[DEBUG] Full error:', relayError);
    }
    if (!fallbackEnabled) {
      throw relayError;
    }
    console.log('→ Falling back to direct execution');
    return await runDirect();
  }
}

// ============================================================
//  setData operations (LSP3 profile updates, etc.)
//  These functions ensure the payload is UP.setData() directly,
//  matching the browser extension's behavior.
// ============================================================

/**
 * Direct execution - UP.setData() call
 * 
 * Controller EOA → UP.setData() → LSP20 verify via KM
 * msg.sender at UP = Controller EOA (proper attribution)
 * 
 * @param {string} dataKey - ERC725Y data key (e.g., LSP3Profile key)
 * @param {string} dataValue - Encoded data value (e.g., VerifiableURI)
 * @param {string} privateKey - Controller's private key
 * @param {string} upAddress - Universal Profile address
 * @param {string} network - Network name (default: 'lukso')
 * @returns {Promise<{transactionHash: string, explorerUrl: string}>}
 */
export async function executeDirectSetData(dataKey, dataValue, privateKey, upAddress, network = DEFAULT_NETWORK) {
  const chainConfig = getChainConfig(network);
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const up = new ethers.Contract(upAddress, ABIS.LSP0, wallet);
  const tx = await up.setData(dataKey, dataValue);
  const receipt = await tx.wait();

  return {
    transactionHash: receipt.hash,
    explorerUrl: `${chainConfig.explorerUrl}/tx/${receipt.hash}`
  };
}

/**
 * Gasless relay execution for setData operations.
 * 
 * This is the relay equivalent of executeDirectSetData().
 * The payload is UP.setData(key, value) — NOT wrapped in UP.execute().
 * This matches the exact pattern the official browser extension uses.
 * 
 * Call chain:
 *   Relayer EOA → KM.executeRelayCall(sig, nonce, ts, setDataPayload) → UP.setData()
 * 
 * msg.sender at UP = KM (unavoidable in relay mode — same as browser extension)
 * Attribution: KM emits PermissionsVerified(controllerAddress) event
 *              → Indexers use this event to identify the acting controller
 * 
 * @param {string} dataKey - ERC725Y data key (e.g., LSP3Profile key)
 * @param {string} dataValue - Encoded data value (e.g., VerifiableURI)
 * @param {string} controllerAddress - Controller EOA address (the signer)
 * @param {string} privateKey - Controller's private key
 * @param {string} upAddress - Universal Profile address
 * @param {string} network - Network name (default: 'lukso')
 * @returns {Promise<{transactionHash: string, explorerUrl: string}>}
 */
export async function executeRelaySetData(dataKey, dataValue, controllerAddress, privateKey, upAddress, network = DEFAULT_NETWORK) {
  const chainConfig = getChainConfig(network);

  // Encode UP.setData(key, value) as the relay payload.
  // This is a direct function call on UP — NOT wrapped in UP.execute().
  // The relayer will call: KM.executeRelayCall(sig, nonce, ts, this_payload)
  // KM will then forward this payload to UP: UP.setData(key, value)
  const upInterface = new ethers.Interface(ABIS.LSP0);
  const payload = upInterface.encodeFunctionData('setData', [dataKey, dataValue]);

  if (process.env.DEBUG_LSP25) {
    console.log('[DEBUG] setData relay payload:', {
      dataKey,
      dataValueLength: dataValue.length,
      encodedPayloadLength: payload.length,
      functionSelector: payload.slice(0, 10),
    });
  }

  const { signature, nonce } = await _buildRelaySignature({
    upAddress, controllerAddress, privateKey, payload, network
  });

  return _sendRelayRequest({ upAddress, payload, signature, nonce, chainConfig });
}

/**
 * Gasless relay execution for setDataBatch operations.
 * 
 * Same as executeRelaySetData but for multiple key-value pairs.
 * 
 * @param {string[]} dataKeys - Array of ERC725Y data keys
 * @param {string[]} dataValues - Array of encoded data values
 * @param {string} controllerAddress - Controller EOA address (the signer)
 * @param {string} privateKey - Controller's private key
 * @param {string} upAddress - Universal Profile address
 * @param {string} network - Network name (default: 'lukso')
 * @returns {Promise<{transactionHash: string, explorerUrl: string}>}
 */
export async function executeRelaySetDataBatch(dataKeys, dataValues, controllerAddress, privateKey, upAddress, network = DEFAULT_NETWORK) {
  const chainConfig = getChainConfig(network);

  const upInterface = new ethers.Interface(ABIS.LSP0);
  const payload = upInterface.encodeFunctionData('setDataBatch', [dataKeys, dataValues]);

  if (process.env.DEBUG_LSP25) {
    console.log('[DEBUG] setDataBatch relay payload:', {
      keysCount: dataKeys.length,
      encodedPayloadLength: payload.length,
      functionSelector: payload.slice(0, 10),
    });
  }

  const { signature, nonce } = await _buildRelaySignature({
    upAddress, controllerAddress, privateKey, payload, network
  });

  return _sendRelayRequest({ upAddress, payload, signature, nonce, chainConfig });
}

/**
 * Relay-first + direct fallback for setData operations.
 * 
 * This is the setData-specific version of executeWithFallback().
 * 
 * Relay path:  KM.executeRelayCall(sig, nonce, ts, UP.setData(key, value))
 *              → msg.sender at UP = KM, attribution via PermissionsVerified event
 * 
 * Direct path: Controller EOA → UP.setData(key, value)
 *              → msg.sender at UP = Controller EOA
 * 
 * Both paths use UP.setData() as the payload — never wrapped in UP.execute().
 * 
 * @param {Object} options
 * @param {string} options.dataKey - ERC725Y data key
 * @param {string} options.dataValue - Encoded data value
 * @param {string} options.controllerAddress - Controller EOA address
 * @param {string} options.privateKey - Controller's private key
 * @param {string} options.upAddress - Universal Profile address
 * @param {boolean} [options.directMode=false] - Skip relay, use direct only
 * @param {boolean} [options.fallbackEnabled=true] - Allow direct fallback on relay failure
 * @param {string} [options.network='lukso'] - Network name
 * @returns {Promise<{transactionHash: string, explorerUrl: string}>}
 */
export async function executeSetDataWithFallback(options) {
  const {
    dataKey,
    dataValue,
    controllerAddress,
    privateKey,
    upAddress,
    directMode = false,
    fallbackEnabled = true,
    network = DEFAULT_NETWORK,
  } = options;

  const chainConfig = getChainConfig(network);

  const runDirect = async () => {
    return await executeDirectSetData(dataKey, dataValue, privateKey, upAddress, network);
  };

  // Chains without relay support always use direct execution
  if (!chainConfig.supportsRelay) {
    return await runDirect();
  }

  // Skip relay if directMode is specified
  if (directMode) {
    return await runDirect();
  }

  // LUKSO: Gasless relay preferred → direct fallback on failure
  try {
    if (process.env.DEBUG_LSP25) {
      console.log('[DEBUG] Attempting relay setData execution...');
    }
    const relayResult = await executeRelaySetData(
      dataKey, dataValue, controllerAddress, privateKey, upAddress, network
    );
    if (process.env.DEBUG_LSP25) {
      console.log('[DEBUG] Relay setData execution successful:', relayResult.transactionHash);
    }
    return relayResult;
  } catch (relayError) {
    const errorMessage = relayError.message || 'Unknown relay error';
    const statusCode = relayError.statusCode;
    console.warn(`⚠️ Relay setData error${statusCode ? ` (${statusCode})` : ''}: ${errorMessage}`);
    if (process.env.DEBUG_LSP25) {
      console.warn('[DEBUG] Full error:', relayError);
    }
    if (!fallbackEnabled) {
      throw relayError;
    }
    console.log('→ Falling back to direct setData execution');
    return await runDirect();
  }
}

// ============================================================
//  Quota management
// ============================================================

/**
 * Check relay quota (LUKSO chains only)
 * @param {string} upAddress - UP address
 * @param {string} privateKey - Controller private key
 * @param {string} network - Network name
 * @returns {Promise<{ remaining: number, limit: number, used: number, resetDate: string }>}
 */
export async function checkQuota(upAddress, privateKey, network = DEFAULT_NETWORK) {
  const chainConfig = getChainConfig(network);
  if (!chainConfig.supportsRelay || !chainConfig.relayerUrl) {
    throw new Error(`Chain "${network}" does not support quota checks`);
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${upAddress}:${timestamp}`;
  const wallet = new ethers.Wallet(privateKey);
  const signature = await wallet.signMessage(message);
  if (process.env.DEBUG_LSP25) {
    console.log('[DEBUG] Quota check:', { upAddress, timestamp, message });
  }
  const response = await fetch(`${chainConfig.relayerUrl}/quota`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: upAddress,
      timestamp,
      signature,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Quota API (${response.status}): ${JSON.stringify(result)}`);
  }
  return {
    remaining: result.remaining,
    limit: result.limit,
    used: result.used,
    resetDate: result.resetDate,
  };
}

// ============================================================
//  High-level Helpers (Payload builders + executors)
//  These wrap the low-level functions for common operations.
// ============================================================

/**
 * Build UP.execute() payload for contract calls.
 * 
 * @param {string} targetAddress - Target contract address
 * @param {string} calldata - ABI-encoded function call data
 * @param {bigint} value - LYX value to send (default: 0n)
 * @param {number} operation - Operation type (0=CALL, 1=CREATE, 2=DELEGATECALL)
 * @returns {string} ABI-encoded execute payload
 */
export function buildExecutePayload(targetAddress, calldata, value = 0n, operation = 0) {
  const upInterface = new ethers.Interface(ABIS.LSP0);
  return upInterface.encodeFunctionData('execute', [operation, targetAddress, value, calldata]);
}

/**
 * Execute LSP7 token transfer via UP.execute(CALL).
 * 
 * Pattern: Controller → UP.execute(0, token, 0, transferCalldata) → LSP7.transfer()
 * 
 * @param {Object} options
 * @param {string} options.tokenAddress - LSP7 token contract address
 * @param {string} options.recipient - Recipient address
 * @param {bigint|string} options.amount - Amount to transfer (bigint or string)
 * @param {string} options.privateKey - Controller's private key
 * @param {string} options.upAddress - Universal Profile address
 * @param {string} options.controllerAddress - Controller EOA address (for relay)
 * @param {boolean} [options.force=true] - Force transfer even if recipient has no LSP1
 * @param {string} [options.network='lukso'] - Network name
 * @param {boolean} [options.directMode=false] - Skip relay, use direct only
 * @returns {Promise<{transactionHash: string, explorerUrl: string}>}
 */
export async function executeLSP7Transfer(options) {
  const {
    tokenAddress,
    recipient,
    amount,
    privateKey,
    upAddress,
    controllerAddress,
    force = true,
    network = DEFAULT_NETWORK,
    directMode = false,
  } = options;

  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);

  // Build LSP7.transfer calldata
  const lsp7Interface = new ethers.Interface(ABIS.LSP7);
  const calldata = lsp7Interface.encodeFunctionData('transfer', [
    upAddress,      // from (UP itself)
    recipient,      // to
    amountBigInt,   // amount
    force,          // force
    '0x',           // data
  ]);

  // Wrap in UP.execute()
  const payload = buildExecutePayload(tokenAddress, calldata);

  return executeWithFallback({
    upAddress,
    controllerAddress,
    privateKey,
    payload,
    network,
    directMode,
  });
}

/**
 * Execute LYX transfer (native token).
 * 
 * On LUKSO: Uses UP.execute(0, recipient, value, '0x')
 * On EVM chains: Uses wallet.sendTransaction({ to, value })
 * 
 * @param {Object} options
 * @param {string} options.recipient - Recipient address
 * @param {bigint|string} options.amount - LYX amount in wei (bigint or string)
 * @param {string} options.privateKey - Controller's private key
 * @param {string} options.upAddress - Universal Profile address (or EOA address on EVM chains)
 * @param {string} options.controllerAddress - Controller EOA address (for relay)
 * @param {string} [options.network='lukso'] - Network name
 * @param {boolean} [options.directMode=false] - Skip relay, use direct only
 * @returns {Promise<{transactionHash: string, explorerUrl: string}>}
 */
export async function executeLyxTransfer(options) {
  const {
    recipient,
    amount,
    privateKey,
    upAddress,
    controllerAddress,
    network = DEFAULT_NETWORK,
    directMode = false,
  } = options;

  const chainConfig = getChainConfig(network);
  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);

  // On LUKSO: Use UP.execute for LYX transfers
  // On EVM chains: Use direct sendTransaction
  if (chainConfig.executionModel === 'eoa') {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const tx = await wallet.sendTransaction({
      to: recipient,
      value: amountBigInt,
    });
    const receipt = await tx.wait();
    return {
      transactionHash: receipt.hash,
      explorerUrl: `${chainConfig.explorerUrl}/tx/${receipt.hash}`,
    };
  }

  // LUKSO: Use UP.execute(CALL)
  const payload = buildExecutePayload(recipient, '0x', amountBigInt);

  return executeWithFallback({
    upAddress,
    controllerAddress,
    privateKey,
    payload,
    value: amountBigInt,
    network,
    directMode,
  });
}

export default {
  // General execute operations (LYX transfers, contract calls)
  executeRelay,
  executeDirect,
  executeWithFallback,
  // setData operations (LSP3 profile updates, etc.)
  executeDirectSetData,
  executeRelaySetData,
  executeRelaySetDataBatch,
  executeSetDataWithFallback,
  // High-level helpers
  buildExecutePayload,
  executeLSP7Transfer,
  executeLyxTransfer,
  // Quota
  checkQuota,
};
