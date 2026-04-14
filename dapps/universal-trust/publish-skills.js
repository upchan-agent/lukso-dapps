#!/usr/bin/env node
/**
 * Universal Trust - Publish Skill
 * Re-publish skill with the same skill name to overwrite, since skillKey is computed as keccak256(name).
 * Website https://universal-trust.vercel.app/ (Agents will fail to fetch, so ask your owner to check)
 */

import { ethers } from 'ethers';
import { DappCommand, buildExecutePayload } from '../../lib/core/command.js';
import { CONTRACTS, ABIS } from '../../lib/core/constants.js';

class PublishSkillsCommand extends DappCommand {
  async build({ args, credentials }) {
    const required = ['name', 'content'];
    for (const arg of required) {
      if (!args[arg]) {
        throw new Error(`--${arg} is required\nUsage: /lyx ut publish-skills --name "my-skill" --content "# My Skill\n\nDescription..."`);
      }
    }

    const name = args.name;
    const content = args.content;

    console.log('🆙 Universal Trust - Skill Publication');
    console.log('');
    console.log('  Skill Name:', name);
    console.log('  Content Length:', content.length, 'bytes');
    console.log('  Registry:', CONTRACTS.SKILLS_REGISTRY);
    console.log('');

    // Compute skillKey as keccak256 of name
    const skillKey = ethers.keccak256(ethers.toUtf8Bytes(name));
    console.log('🔑 Skill Key:', skillKey);
    console.log('');

    console.log('🔨 Building transaction...');
    console.log('');
    console.log('  Skill Name:', name);
    console.log('  Skill Key:', skillKey);
    console.log('');

    // Check for --yes flag to confirm execution
    const isConfirmMode = !args.yes;
    if (isConfirmMode) {
      console.log('⚠️ Please review the details. To execute, run again with --yes flag:');
      console.log(` /lyx universal-trust:publish-skills --yes`);
      console.log('');
      return { skipExecution: true, meta: { name, skillKey } };
    }

    const registryIface = new ethers.Interface(ABIS.UniversalTrustRegistry);
    const publishData = registryIface.encodeFunctionData('publishSkill', [skillKey, name, content]);

    const payload = buildExecutePayload(CONTRACTS.SKILLS_REGISTRY, publishData);

    return { payload, meta: { name, skillKey } };
  }

  onSuccess(result) {
    console.log('');
    console.log('✅ Skill publication completed!');
    console.log('TX:', result.transactionHash);
    console.log('Explorer:', result.explorerUrl);
    console.log('');
    console.log('Skill Key:', result.meta.skillKey);
    console.log('Skill Name:', result.meta.name);
  }
}

new PublishSkillsCommand().run();