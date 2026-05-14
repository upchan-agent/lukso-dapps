#!/usr/bin/env node
/**
 * ERC-8004 - Set Agent Wallet
 *
 * Usage:
 *   /lyx erc8004:set-agent-wallet --agent-id 8 --wallet 0x... --deadline 2000000000 --signature 0x...
 *
 * Sets the agent's payment wallet. The new wallet MUST sign an EIP-712 message.
 * To generate the signature, use the sign-message subcommand first:
 *
 *   /lyx erc8004:set-agent-wallet --agent-id 8 --wallet 0x... --mode sign-only
 *
 * This shows the EIP-712 message to sign. Sign it with the new wallet's private key
 * and then call again with --signature.
 */

import { DappCommand, buildExecutePayload } from '../../lib/core/index.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004SetWalletCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const agentId = args['agent-id'] ? BigInt(args['agent-id']) : null;
    if (!agentId) throw new Error('--agent-id is required');

    const newWallet = args.wallet ? ethers.getAddress(args.wallet) : null;
    if (!newWallet) throw new Error('--wallet is required');

    const chain = CHAINS[network] || CHAINS.lukso;
    const deadline = args.deadline ? BigInt(args.deadline) : BigInt(Math.floor(Date.now() / 1000) + 86400); // 24h default
    const signature = args.signature || '';

    const mode = args.mode || 'execute';

    const DOMAIN_SEPARATOR = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
          ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
          ethers.keccak256(ethers.toUtf8Bytes('IdentityRegistry')),
          ethers.keccak256(ethers.toUtf8Bytes('1')),
          BigInt(chain.chainId),
          CONTRACTS.ERC8004_IDENTITY_REGISTRY,
        ]
      )
    );

    const SET_WALLET_TYPEHASH = ethers.keccak256(
      ethers.toUtf8Bytes('SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)')
    );

    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint256', 'address', 'uint256'],
        [SET_WALLET_TYPEHASH, agentId, newWallet, deadline]
      )
    );

    const digest = ethers.keccak256(
      ethers.concat(['0x1901', DOMAIN_SEPARATOR, structHash])
    );

    console.log('🔍 ERC-8004 - Set Agent Wallet');
    console.log('');
    console.log(`  Agent ID:  ${agentId.toString()}`);
    console.log(`  Wallet:    ${newWallet}`);
    console.log(`  Deadline:  ${deadline.toString()} (${new Date(Number(deadline) * 1000).toISOString()})`);
    console.log('');

    if (mode === 'sign-only') {
      console.log('📝 EIP-712 Message to sign (for the NEW wallet):');
      console.log('');
      console.log(`  Domain: IdentityRegistry (v1, chain ${chain.chainId})`);
      console.log(`  VerifyingContract: ${CONTRACTS.ERC8004_IDENTITY_REGISTRY}`);
      console.log('');
      console.log(`  Type: SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)`);
      console.log(`  agentId:    ${agentId.toString()}`);
      console.log(`  newWallet:  ${newWallet}`);
      console.log(`  deadline:   ${deadline.toString()}`);
      console.log('');
      console.log(`  keccak256 digest: ${digest}`);
      console.log('');
      console.log('  Sign with the new wallet\'s private key:');
      console.log('  const sig = new ethers.SigningKey(privateKey).sign(digest);');
      console.log('  const signature = ethers.Signature.from(sig).serialized;');
      console.log('');
      console.log('  Then call:');
      console.log(`  /lyx erc8004:set-agent-wallet --agent-id ${agentId} --wallet ${newWallet} --deadline ${deadline} --signature "<serialized>" --yes`);
      return { skipExecution: true, meta: { status: 'sign_only', digest } };
    }

    if (!signature) {
      throw new Error('--signature is required. Use --mode sign-only first to generate it.');
    }

    if (!args.yes) {
      console.log('⚠️  Review the details above. To execute:');
      console.log(`  /lyx erc8004:set-agent-wallet --agent-id ${agentId} --wallet ${newWallet} --deadline ${deadline} --yes`);
      return { skipExecution: true, meta: { status: 'confirm' } };
    }

    // Build setAgentWallet call
    const regIface = new ethers.Interface(ABIS.ERC8004_IdentityRegistry);
    const walletData = regIface.encodeFunctionData('setAgentWallet', [
      agentId, newWallet, deadline, signature
    ]);
    const payload = buildExecutePayload(CONTRACTS.ERC8004_IDENTITY_REGISTRY, walletData);
    return { payload, meta: { agentId: agentId.toString(), wallet: newWallet } };
  }

  onSuccess(result) {
    if (result.meta?.status) return;
    console.log('');
    console.log(`✅ Agent #${result.meta?.agentId} wallet set to ${result.meta?.wallet}!`);
    console.log(`  TX: ${result.transactionHash}`);
  }
}

new ERC8004SetWalletCommand().run();
