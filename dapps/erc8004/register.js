#!/usr/bin/env node
/**
 * ERC-8004 - Register Agent on Identity Registry
 *
 * Usage:
 *   /lyx erc8004:register --name "🆙chan" [--description "AI Assistant"] [--image "https://..."]
 *
 * Registers your Universal Profile as an AI Agent on the ERC-8004 Identity Registry.
 * The agent metadata is embedded as a base64 data URI (no IPFS needed).
 *
 * NOTE: Since Universal Profiles may not implement onERC721Received,
 * the registration is done in 2 steps:
 *   Step 1: Controller EOA → register() → agent minted to controller
 *   Step 2: transferFrom(controller, UP, agentId) → agent owned by UP
 */

import { DappCommand } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004RegisterCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const name = args.name || '🆙chan Agent';
    const description = args.description || 'AI Agent registered via 🆙chan on ERC-8004';
    const image = args.image || '';
    const endpoint = args.endpoint || '';

    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const registry = new ethers.Contract(
      CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      ABIS.ERC8004_IdentityRegistry,
      provider
    );

    // Step 1: Check if UP already has an agent
    console.log('🔍 ERC-8004 - Agent Registration');
    console.log('');
    console.log(`  Name: ${name}`);
    console.log(`  UP:  ${credentials.upAddress}`);
    console.log('');

    const balance = await registry.balanceOf(credentials.upAddress);
    if (balance > 0n) {
      console.log(`⚠️  Already registered! UP already owns ${balance} agent(s).`);
      console.log('');
      console.log('  Check details: /lyx erc8004:info');
      return { skipExecution: true, meta: { status: 'already_registered', balance: Number(balance) } };
    }

    console.log('✅ No existing agent found. Proceeding...');
    console.log('');

    // Step 2: Build registration JSON (Agent Card)
    const services = [];
    if (endpoint) {
      services.push({ name: 'web', endpoint });
    }

    const agentCard = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description,
      image: image || 'https://8004scan.io/images/agent.png',
      services,
      supportedTrust: ['reputation'],
      x402Support: false,
      active: true,
      registrations: [],
    };

    const jsonStr = JSON.stringify(agentCard);
    const base64 = Buffer.from(jsonStr).toString('base64');
    const agentURI = `data:application/json;base64,${base64}`;

    // Step 3: Confirmation
    if (!args.yes) {
      console.log('📋 Registration Details:');
      console.log('══════════════════════════');
      console.log(`  Registry:  ${CONTRACTS.ERC8004_IDENTITY_REGISTRY}`);
      console.log(`  Name:      ${name}`);
      console.log(`  Desc:      ${description}`);
      if (image) console.log(`  Image:     ${image}`);
      if (endpoint) console.log(`  Endpoint:  ${endpoint}`);
      console.log('══════════════════════════');
      console.log('');
      console.log('⚠️  This action requires 3 transactions:');
      console.log('  1. Register agent (controller pays gas)');
      console.log('  2. Transfer agent to UP (controller pays gas)');
      console.log('  3. Set self-registration (controller pays gas)');
      console.log('');
      console.log('To execute, add --yes flag:');
      console.log('  /lyx erc8004:register --yes');
      return { skipExecution: true, meta: { status: 'confirm' } };
    }

    // Step 4: Execute register() from controller EOA directly
    // (UP.execute() doesn't work because UP may lack onERC721Received)
    console.log('');
    console.log('🔨 Step 1/2: Registering agent...');

    // Use the controller wallet directly, not via UP.execute()
    const wallet = new ethers.Wallet(credentials.privateKey, provider);
    const regIface = new ethers.Interface(['function register(string agentURI) returns (uint256)']);
    const regData = regIface.encodeFunctionData('register', [agentURI]);

    const tx = await wallet.sendTransaction({
      to: CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      data: regData
    });
    console.log(`  TX: ${tx.hash}`);
    const receipt = await tx.wait();

    if (receipt.status !== 1) {
      throw new Error('Registration transaction reverted');
    }

    console.log(`  ✅ Agent minted! (block ${receipt.blockNumber})`);

    // Extract agentId from Transfer event
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const logs = receipt.logs.filter(l =>
      l.address.toLowerCase() === CONTRACTS.ERC8004_IDENTITY_REGISTRY.toLowerCase() &&
      l.topics[0] === transferTopic &&
      l.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
    );
    const agentId = logs.length > 0 ? BigInt(logs[0].topics[3]).toString() : 'unknown';

    // Step 5: Transfer from controller to UP
    console.log('');
    console.log('🔨 Step 2/2: Transferring agent to UP...');

    const transferIface = new ethers.Interface(['function transferFrom(address from, address to, uint256 tokenId)']);
    const transferData = transferIface.encodeFunctionData('transferFrom', [
      credentials.controllerAddress, credentials.upAddress, BigInt(agentId)
    ]);

    const tx2 = await wallet.sendTransaction({
      to: CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      data: transferData
    });
    console.log(`  TX: ${tx2.hash}`);
    const receipt2 = await tx2.wait();

    if (receipt2.status !== 1) {
      throw new Error('Transfer transaction reverted');
    }

    console.log(`  ✅ Transferred! (block ${receipt2.blockNumber})`);

    // Step 6: Update URI with self-referencing registration (IA005 fix)
    console.log('');
    console.log('🔨 Step 3/3: Adding self-registration...');

    const regCard = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description,
      image: image || 'https://8004scan.io/images/agent.png',
      services,
      supportedTrust: ['reputation'],
      x402Support: false,
      active: true,
      registrations: [{
        agentRegistry: `eip155:${chain.chainId}:${CONTRACTS.ERC8004_IDENTITY_REGISTRY}`,
        agentId: Number(agentId)
      }],
    };

    const regJson = JSON.stringify(regCard);
    const regB64 = Buffer.from(regJson).toString('base64');
    const regURI = `data:application/json;base64,${regB64}`;

    const setUriIface = new ethers.Interface(['function setAgentURI(uint256 agentId, string newURI)']);
    const setUriData = setUriIface.encodeFunctionData('setAgentURI', [BigInt(agentId), regURI]);

    // Call via UP.execute() since it owns the agent now
    const up = new ethers.Contract(credentials.upAddress, [
      'function execute(uint256 operation, address target, uint256 value, bytes data) payable returns (bytes)'
    ], wallet);

    const gas3 = await up.execute.estimateGas(0n, CONTRACTS.ERC8004_IDENTITY_REGISTRY, 0n, setUriData)
      .catch(() => null);
    if (gas3) {
      const tx3 = await up.execute(0n, CONTRACTS.ERC8004_IDENTITY_REGISTRY, 0n, setUriData);
      console.log(`  TX: ${tx3.hash}`);
      const receipt3 = await tx3.wait();
      console.log(`  ✅ Registration added! (block ${receipt3.blockNumber})`);
    } else {
      console.log('  ⚠️  Could not set registration (setAgentURI failed)');
    }

    // Return combined result
    return {
      skipExecution: true,
      meta: {
        status: 'success',
        agentId,
        txRegister: tx.hash,
        txTransfer: tx2.hash,
        agentURI: agentURI.substring(0, 60) + '...',
      }
    };
  }

  onSuccess(result) {
    if (result.meta?.status === 'already_registered') {
      console.log('');
      console.log(`⚠️  Already registered! UP has ${result.meta.balance} agent(s).`);
      console.log('  /lyx erc8004:info');
    } else if (result.meta?.status === 'confirm') {
      // Already printed
    } else if (result.meta?.status === 'success') {
      console.log('');
      console.log('✅✅✅ Agent Registration Complete! ✅✅✅');
      console.log('──────────────────────────────────────');
      console.log(`  Agent ID:   ${result.meta.agentId}`);
      console.log(`  TX (mint):  ${result.meta.txRegister}`);
      console.log(`  TX (trans): ${result.meta.txTransfer}`);
      console.log('──────────────────────────────────────');
      console.log('');
      console.log('  8004scan:');
      console.log(`  https://8004scan.io/agents/lukso/${result.meta.agentId}`);
    }
  }
}

new ERC8004RegisterCommand().run();
