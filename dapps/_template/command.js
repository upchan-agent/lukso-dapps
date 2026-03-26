#!/usr/bin/env node
/**
 * DApp Command Template
 *
 * Usage:
 * 1. Copy this file and save as {name}.js
 * 2. Rename TemplateCommand to match your command (e.g. FollowCommand)
 * 3. Implement the sections marked with TODO
 * 4. Register the command in dapps.yaml
 *
 * Run the command:
 *   /lyx <namespace>:<command-name> --param1 value
 */

import { DappCommand, buildUpExecute, encodeFunctionCall } from '../../lib/core/command.js';
// import { CONTRACTS } from '../../lib/core/constants.js';
import { ethers } from 'ethers';

/**
 * TemplateCommand - Replace with your command class name (e.g. FollowCommand)
 *
 * Steps:
 * 1. Rename the class
 * 2. Set needsCredentials (false for read-only commands)
 * 3. Implement build()
 * 4. Override onSuccess() / onError() if needed
 */
class TemplateCommand extends DappCommand {
  /**
   * Whether UP credentials are required
   * true:  UP interaction needed (default)
   * false: read-only, no credentials needed
   */
  needsCredentials = true;

  /**
   * Build the transaction data
   *
   * @param {Object} context Execution context
   *   - args:        Command arguments (accessed as args['key'])
   *   - credentials: { upAddress, controllerAddress, privateKey }
   *   - network:     Network name
   * @returns {Object} { payload, value?, meta?, skipExecution? }
   */
  async build({ args, credentials }) {
    // TODO: Validate required arguments
    const myParam = args['my-param'];
    if (!myParam) {
      throw new Error('--my-param is required');
    }

    // ⚠️ Confirmation mode (recommended for TX operations)
    // Add `yes` to dapps.yaml args array to enable this feature
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(`   /lyx <namespace>:<command-name> --my-param ${myParam} --yes`);
      console.log('');
      return { skipExecution: true };
    }

    console.log(`📝 Executing: ${myParam}`);

    // TODO: Set the target contract address
    const targetAddress = '0x...'; // or import from constants.js

    // TODO: Encode function call data
    // Option 1: using encodeFunctionCall helper
    const data = encodeFunctionCall(
      'function myFunction(string) external',
      'myFunction',
      [myParam]
    );

    // Option 2: using ethers.Interface directly
    // const iface = new ethers.Interface(['function myFunction(string) external']);
    // const data = iface.encodeFunctionData('myFunction', [myParam]);

    // Build UP.execute() payload
    const payload = buildUpExecute(credentials.upAddress, targetAddress, data);

    return {
      payload,          // Required: encoded payload passed to UP.execute()
      // Note: For LYX transfers, embed the amount via buildUpExecute(target, '0x', amountLyx)
      // Do NOT pass value separately — it is for msg.value to KeyManager (always 0 on LUKSO)
      meta: { myParam } // Optional: passed to onSuccess / onError
    };
  }

  /**
   * Success handler (optional — override only if customization is needed)
   *
   * @param {Object} result { transactionHash, explorerUrl, meta }
   * @param {Object} context Execution context
   */
  onSuccess(result, context) {
    // TODO: Customize success message
    console.log(`✅ Done: ${result.meta.myParam}`);
    console.log(`TX: ${result.transactionHash}`);
    console.log(`Explorer: ${result.explorerUrl}`);
  }

  /**
   * Error handler (optional — delete to use the default implementation)
   *
   * @param {Error} error
   * @param {Object} context Execution context
   */
  onError(error, context) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the command
new TemplateCommand().run();