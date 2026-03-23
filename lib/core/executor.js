/** 
 * Transaction Execution (Core) 
 * IMPORTANT: Changes to this file have broad impact and require review.
 * 
 * All executions branch according to the following model:
 * 
 * executionModel: 'lsp6' (LUKSO / LUKSO Testnet)
 * - Gasless relay is preferred → falls back to direct execution on failure
 * - Controller → KeyManager.execute(payload) → UP
 * - The LYX transfer amount is embedded in the payload (the value field of UP.execute). No msg.value is needed.
 * 
 * executionModel: 'eoa' (Base / Ethereum, etc.)
 * - Relay is not supported, so direct execution is always used
 * - EOA → wallet.sendTransaction({ to, data, value })
 * - ETH transfer amount is specified via the value parameter.
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
/**
 * Execute via gasless relay (LUKSO chains only)
 */
export async function executeRelay(upAddress, controllerAddress, privateKey, payload, network = DEFAULT_NETWORK) {
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
  // Note: msg.value to KeyManager is always 0.
  // The LYX transfer amount is already embedded in the payload (the value field of UP.execute).
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
  const relayRequest = {
    address: upAddress,
    transaction: {
      abi: payload,
      signature,
      nonce: Number(nonce),
      validityTimestamps: '0x0',
      value: ethers.toBeHex(0), // msg.value to KM is always 0 (LYX amount is inside the payload)
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
/**
 * Direct execution
 * 
 * executionModel: 'lsp6' (LUKSO)
 * Calls KeyManager.execute(payload).
 * msg.value is not needed (the LYX amount is already embedded in the value field of UP.execute inside the payload).
 * 
 * executionModel: 'eoa' (Base / Ethereum, etc.)
 * Calls wallet.sendTransaction({ to, data, value }).
 * When transferring ETH, specify the amount with the value parameter.
 * For transactions that do not require value such as ERC20, keep value = 0.
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
  // LSP6 model (LUKSO): msg.value is not needed; all information is embedded in the payload
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
 * Relay-first + direct fallback
 * 
 * value parameter:
 * - lsp6 (LUKSO): ignored. The LYX amount is already embedded in the payload.
 * - eoa (EVM): used when transferring ETH. Leave it as 0 for ERC20, etc.
 */
export async function executeWithFallback(options) {
  const {
    upAddress,
    controllerAddress,
    privateKey,
    payload,
    value = 0, // Used for EOA (ETH transfer). Ignored for LSP6.
    directMode = false,
    fallbackEnabled = true,
    network = DEFAULT_NETWORK,
  } = options;
  const chainConfig = getChainConfig(network);
  const runDirect = async () => {
    return await executeDirect(payload, privateKey, upAddress, network, value);
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
export default {
  executeRelay,
  executeDirect,
  executeWithFallback,
  checkQuota,
};
