#!/usr/bin/env node
/**
 * Universal Trust - Read Skills
 * Website https://universal-trust.vercel.app/ (Agents will fail to fetch, so ask your owner to check)
 */

import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { CONTRACTS, CHAINS, ABIS } from '../../lib/core/constants.js';

class ReadSkillsCommand extends DappCommand {
  needsCredentials = false;

  async build({ args, network }) {
    const address = args.address;
    const skillKey = args['skill-key'];

    if (!address) {
      throw new Error('--address is required\nUsage: /lyx ut read-skills --address 0x... [--skill-key 0x...]');
    }

    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

    console.log('🆙 Universal Trust - Read Skills');
    console.log('');
    console.log('  Address:', address);
    console.log('  Registry:', CONTRACTS.SKILLS_REGISTRY);
    console.log('  Network:', chainConfig.name);
    console.log('');

    const registry = new ethers.Contract(
      CONTRACTS.SKILLS_REGISTRY,
      ABIS.UniversalTrustRegistry,
      provider
    );

    if (skillKey) {
      // Get the target skill
      console.log('🔑 Skill Key:', skillKey);
      console.log('');
      console.log('📖 Reading specific skill...');

      try {
        // getSkill to direct
        const skill = await registry.getSkill(address, skillKey);
        
        console.log('');
        console.log('=== Skill Details ===');
        console.log('Name:', skill.name);
        console.log('Version:', skill.version.toString());
        console.log('UpdatedAt:', new Date(Number(skill.updatedAt) * 1000).toISOString());
        console.log('');
        console.log('Content:');
        console.log(skill.content);
        
      } catch (error) {
        if (error.message?.includes('SkillNotFound')) {
          console.log('');
          console.log('⚠️  Skill not found for this address.');
        } else {
          console.error('❌ Error reading skill:', error.message);
        }
      }

    } else {
      // Get all skills
      console.log('📋 Reading all skill keys...');

      const skillKeys = await registry.getSkillKeys(address);

      if (skillKeys.length === 0) {
        console.log('');
        console.log('⚠️  No skills found for this address.');
        return { skipExecution: true };
      }

      console.log('');
      console.log(`✅ Found ${skillKeys.length} skill(s):`);
      console.log('');

      for (let i = 0; i < skillKeys.length; i++) {
        console.log(`[${i + 1}] ${skillKeys[i]}`);
      }

      console.log('');
      console.log('To read a specific skill:');
      console.log('  /lyx ut read-skills --address ' + address + ' --skill-key <SKILL_KEY>');
    }

    return { skipExecution: true };
  }

  onSuccess() {
  }
}

new ReadSkillsCommand().run();