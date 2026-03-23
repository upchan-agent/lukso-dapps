#!/usr/bin/env node
/**
 * Display UP information
 * Fetches LSP0 information (owner, balance) and the list of LSP6 controllers and permissions
 */
import { ethers } from 'ethers';
import { DappCommand } from '../../lib/core/command.js';
import { CHAINS, ABIS, DATA_KEYS, buildPermissionsDataKey, decodePermissions } from '../../lib/core/index.js';

class InfoCommand extends DappCommand {
  needsCredentials = false;

  async build({ args }) {
    const address = args.address;
    const network = args.network || 'lukso';
    const chainConfig = CHAINS[network] || CHAINS.lukso;

    // If no address is specified, it must be provided explicitly
    const upAddress = address;
    if (!upAddress) {
      throw new Error('--address is required');
    }

    console.log('🆙 Information');
    console.log(`Address: ${upAddress}`);
    console.log(`Chain: ${chainConfig.name}`);
    console.log('');

    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const up = new ethers.Contract(upAddress, ABIS.LSP0, provider);

    // Fetch owner
    const owner = await up.owner();
    console.log(`Owner (KeyManager): ${owner}`);

    // Fetch balance
    const balance = await provider.getBalance(upAddress);
    console.log(`Balance: ${ethers.formatEther(balance)} ${chainConfig.nativeCurrency}`);

    // Fetch controller list
    console.log('');
    console.log('📋 Controllers:');
    try {
      const controllers = await this.listControllers(upAddress, provider);
      if (controllers.length === 0) {
        console.log(' None');
      } else {
        console.log(` Total: ${controllers.length}`);
        console.log('');
        for (const ctrl of controllers) {
          console.log(` - ${ctrl.address}`);
          console.log(`   Permissions: ${ctrl.permissionNames.join(', ') || 'none'}`);
        }
      }
    } catch {
      console.log(' Failed to fetch');
    }

    return { skipExecution: true };
  }

  async listControllers(upAddress, provider) {
    const up = new ethers.Contract(upAddress, ABIS.LSP0, provider);
    const lengthData = await up.getData(DATA_KEYS['AddressPermissions[]']);
    if (!lengthData || lengthData === '0x') return [];

    const count = Number(BigInt(lengthData));
    const controllers = [];
    const arrayKeyBase = DATA_KEYS['AddressPermissions[]'].slice(2, 34);

    for (let i = 0; i < count; i++) {
      const indexKey = '0x' + arrayKeyBase + i.toString(16).padStart(32, '0');
      try {
        const addressData = await up.getData(indexKey);
        if (!addressData || addressData === '0x') continue;
        const addr = '0x' + addressData.slice(-40);
        const info = await this.getControllerPermissions(upAddress, addr, provider);
        controllers.push(info);
      } catch { /* Skip */ }
    }

    return controllers;
  }

  async getControllerPermissions(upAddress, controllerAddress, provider) {
    const up = new ethers.Contract(upAddress, ABIS.LSP0, provider);
    const permissionsKey = buildPermissionsDataKey(controllerAddress);
    const permissionsData = await up.getData(permissionsKey);

    if (!permissionsData || permissionsData === '0x') {
      return {
        address: controllerAddress,
        permissions: '0x0000000000000000000000000000000000000000000000000000000000000000',
        permissionNames: [],
        hasAccess: false,
      };
    }

    const permissionNames = decodePermissions(permissionsData);
    return {
      address: controllerAddress,
      permissions: permissionsData,
      permissionNames,
      hasAccess: permissionNames.length > 0,
    };
  }

  onSuccess() {
    // Output is completed inside build()
  }
}
new InfoCommand().run();
