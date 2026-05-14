#!/usr/bin/env node
/**
 * ERC-8004 - Evaluate Agent (automated analysis + feedback)
 *
 * Usage:
 *   /lyx erc8004:evaluate --agent-id 8 [--yes]
 *
 * Analyzes an agent's UP (code, profile, LYX, followers) and submits
 * quantitative feedback tags: reachable, starred, followers, profile.
 */

import { DappCommand, buildExecutePayload } from '../../lib/core/index.js';
import { executeWithFallback } from '../../lib/core/executor.js';
import { CONTRACTS, ABIS, CHAINS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

class ERC8004EvaluateCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials, network }) {
    const rawAgentId = args['agent-id'];
    if (rawAgentId === undefined) throw new Error('--agent-id is required');
    const agentId = BigInt(rawAgentId);

    const chain = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
    const registry = new ethers.Contract(
      CONTRACTS.ERC8004_IDENTITY_REGISTRY,
      ABIS.ERC8004_IdentityRegistry,
      provider
    );

    // Fetch agent info
    const owner = await registry.ownerOf(agentId);
    let uri = ''; try { uri = await registry.tokenURI(agentId); } catch {}

    let name = '';
    if (uri.startsWith('data:application/json;base64,')) {
      try {
        const d = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'));
        name = d.name || '';
      } catch {}
    }

    const currentBlock = await provider.getBlockNumber();

    // === Analysis ===
    const code = await provider.getCode(owner);
    const isContract = code !== '0x' && code.length > 4;
    const reachable = 1; // agent exists on registry

    // LSP3Profile
    let hasProfile = 0;
    try {
      const LSP3Key = '0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5';
      const pd = await provider.call({ to: owner, data: '0x54f6127f' + LSP3Key.slice(2).padStart(64, '0') });
      hasProfile = (pd !== '0x' && pd.length > 100) ? 1 : 0;
    } catch {}

    // LYX balance
    let hasLYX = 0;
    try {
      const bal = await provider.getBalance(owner);
      hasLYX = bal > ethers.parseEther('1') ? 1 : 0;
    } catch {}

    // LSP26 followers (only for contracts)
    let followers = 0;
    if (isContract) {
      try {
        const LSP26 = '0xf01103E5a9909Fc0DBe8166dA7085e0285daDDcA';
        const f = await provider.call({ to: LSP26, data: '0xb07b4c4d' + owner.toLowerCase().slice(2).padStart(64, '0') });
        followers = Number(BigInt(f));
      } catch {}
    }

    // Services count
    let services = 0;
    if (uri.startsWith('data:application/json;base64,')) {
      try {
        const d = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'));
        services = (d.services || []).length;
      } catch {}
    }

    // star calculation (v3: fellow LUKSO agents - generous)
    let starred = 70; // base: everyone gets this
    if (isContract) {
      starred += hasProfile * 10;
      starred += hasLYX * 5;
      starred += 5; // UP bonus
    }
    starred += Math.min(services * 5, 10);
    starred += Math.min(followers, 5);
    starred = Math.min(starred, 100);

    // === Display ===
    console.log('🔍 ERC-8004 - Evaluate Agent');
    console.log('');
    console.log(`  Agent ID:  ${agentId.toString()}`);
    console.log(`  Name:      ${name}`);
    console.log(`  Owner:     ${owner}`);
    console.log(`  Type:      ${isContract ? 'Contract (UP)' : 'EOA'}`);
    console.log('');
    console.log('📊 Evaluation Results:');
    console.log('────────────────────────');
    console.log(`  reachable:          ${reachable}   (registered on-chain)`);
    console.log(`  hasProfile:         ${hasProfile}   ${isContract ? '(LSP3 metadata)' : '(EOA - n/a)'}`);
    console.log(`  hasLYX:             ${hasLYX}   ${isContract ? '(>1 LYX in wallet)' : '(EOA)'}`);
    console.log(`  followers (LSP26):  ${followers}`);
    console.log(`  services:           ${services}`);
    console.log(`  isContract:         ${isContract ? 1 : 0}`);
    console.log('────────────────────────');
    console.log(`  ⭐ starred score:   ${starred}/100`);
    console.log('');

    // === Build feedback transactions ===
    if (!args.yes) {
      console.log('⚠️  This will submit feedback to the Reputation Registry.');
      console.log('  Tags to submit: reachable, starred' + (followers > 0 ? ', followers' : '') + (hasProfile ? ', profile' : ''));
      console.log('');
      console.log('To execute:');
      console.log(`  /lyx erc8004:evaluate --agent-id ${agentId} --yes`);
      return { skipExecution: true, meta: { status: 'confirm' } };
    }

    // Build feedback payloads and submit via executor (relay → direct fallback)
    const repIface = new ethers.Interface([
      'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
    ]);
    const repAddr = CONTRACTS.ERC8004_REPUTATION_REGISTRY;

    const feedbacks = [
      { tag: 'reachable', value: reachable },
      { tag: 'starred', value: starred },
    ];
    if (followers > 0) feedbacks.push({ tag: 'followers', value: followers });
    if (hasProfile) feedbacks.push({ tag: 'profile', value: hasProfile });

    for (const fb of feedbacks) {
      const fbData = repIface.encodeFunctionData('giveFeedback', [
        agentId, BigInt(fb.value), 0, fb.tag, '', '', '', ethers.ZeroHash
      ]);
      const payload = buildExecutePayload(repAddr, fbData);

      console.log(`  Submitting ${fb.tag}: ${fb.value}...`);
      try {
        const result = await executeWithFallback({
          upAddress: credentials.upAddress,
          controllerAddress: credentials.controllerAddress,
          privateKey: credentials.privateKey,
          payload,
          value: 0,
          network: network || 'lukso',
        });
        console.log(`    ✅ TX: ${result.transactionHash}`);
        // Delay between feedbacks to avoid relay nonce conflicts
        await new Promise(r => setTimeout(r, 5000));
      } catch (e) {
        console.log(`    ❌ Failed: ${e.message.substring(0, 80)}`);
      }
    }

    console.log('');
    console.log(`✅ Evaluation complete for Agent #${agentId.toString()} (${name})`);
    return { skipExecution: true, meta: { status: 'success', agentId: agentId.toString(), feedbacks: feedbacks.map(f => `${f.tag}=${f.value}`).join(', ') } };
  }
}

new ERC8004EvaluateCommand().run();
