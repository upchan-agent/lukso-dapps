#!/usr/bin/env node
/**
 * UP LYX Send
 * Send LYX from UP to another address
 *
 * Required Permissions:
 * - EXECUTE_RELAY_CALL (for gasless relay execution)
 *
 * LYX Transfer Permission (choose one):
 *
 * Option A: SUPER_TRANSFERVALUE(☠️DANGEROUS☠️)
 * - Allows sending LYX to ANY address without restrictions
 * - **⚠️⚠️THIS PERMISSION IS VERY DANGEROUS SO USE WITH YOUR OWN RISK⚠️⚠️**
 * - Recommended for agents that send to arbitrary addresses
 *
 * Option B: TRANSFERVALUE + AllowedCalls(Safer)
 * - Restricts sending to pre-approved addresses only
 * - Safer for fixed-destination use cases
 * - AllowedCalls entry format (CompactBytesArray, 32 bytes per entry):
 *   0x0020 00000001 <address(20bytes)> ffffffff ffffffff
 *   └─len └─VALUE └─allowed address └─any std └─any fn
 * - DYOR with tech document
 *   https://docs.lukso.tech/standards/access-control/lsp6-key-manager#allowed-calls
 *
 * Note: CALL / SUPER_CALL is NOT required for simple LYX transfers (data = 0x)
 */
import { ethers } from 'ethers';
import { DappCommand, buildExecutePayload } from '../../lib/core/command.js';

class SendLYXCommand extends DappCommand {
  needsCredentials = true;

  async build({ args, credentials }) {
    // ─── Mode: Confirm or Execute ───────────────────────────────────────
    const isConfirmMode = !args.yes;

    // ─── Required Parameters ────────────────────────────────────────────
    if (!args.to) {
      throw new Error('--to is required');
    }
    if (!args.amount) {
      throw new Error('--amount is required');
    }

    const toAddress = args.to;
    const amountLyx = ethers.parseEther(args.amount);

    // ─── Validation ─────────────────────────────────────────────────────
    if (!ethers.isAddress(toAddress)) {
      throw new Error(`Invalid address: ${toAddress}`);
    }

    // ─── Confirm Mode ───────────────────────────────────────────────────
    if (isConfirmMode) {
      console.log(`
🆙 Send LYX (Confirm)
────────────────────────────────────────
 To: ${toAddress}
 Amount: ${args.amount} LYX
 From: ${credentials.upAddress}
────────────────────────────────────────
Please review the details. To execute, run again with --yes flag:
 /lyx up:send-lyx --to ${toAddress} --amount ${args.amount} --yes
`);
      return { skipExecution: true };
    }

    // ─── Execute Mode ───────────────────────────────────────────────────
    console.log('🆙 Send LYX');
    console.log(` To: ${toAddress}`);
    console.log(` Amount: ${args.amount} LYX`);
    console.log('');

    // ─── Build UP.execute() payload ─────────────────────────────────────
    // For simple LYX transfer: UP.execute(CALL, toAddress, amountLyx, 0x)
    const payload = buildExecutePayload(
      toAddress,
      '0x', // Empty data for simple transfer
      amountLyx // LYX amount as value (embedded in payload)
    );

    return {
      payload,
      // Note: amountLyx is embedded in payload (UP.execute's value parameter)
      // msg.value to KeyManager should be 0 (UP pays from its balance)
      meta: { to: toAddress, amount: args.amount }
    };
  }

  onSuccess(result, context) {
    // nothing with skipExecution: true
    if (!result || !result.meta) {
      return;
    }

    console.log('✅ LYX Sent!');
    console.log(` To: ${result.meta.to}`);
    console.log(` Amount: ${result.meta.amount} LYX`);
    console.log(` TX: ${result.transactionHash}`);
    if (result.explorerUrl) {
      console.log(` Explorer: ${result.explorerUrl}`);
    }
  }
}
new SendLYXCommand().run();
