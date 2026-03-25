#!/usr/bin/env node
/**
 * Token operations (LSP7/LSP8)
 * Token transfer and information display
 */
import { ethers } from 'ethers';
import { DappCommand, buildUpExecute } from '../../lib/core/command.js';
import { CHAINS, LSP4_DATA_KEYS, ABIS } from '../../lib/core/index.js';

class TokensCommand extends DappCommand {
  needsCredentials = true; // transfer requires credentials; info is skipped inside build

  async build({ args, credentials, network }) {
    const rawArgs = process.argv.slice(2);
    const subCommand = rawArgs.find(a => !a.startsWith('--'));
    if (!subCommand) {
      throw new Error(`A subcommand is required
Usage:
 /lyx up tokens info --token 0x...
 /lyx up tokens transfer --token 0x... --to 0x... --amount 100`);
    }

    const chainConfig = CHAINS[network] || CHAINS.lukso;
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

    if (subCommand === 'info') {
      return await this.buildInfo(args, provider);
    } else if (subCommand === 'transfer') {
      if (!credentials?.upAddress || !credentials?.privateKey) {
        throw new Error('Credentials are required for transfer');
      }
      return await this.buildTransfer(args, credentials, provider, network);
    } else {
      throw new Error(`Unknown subcommand: ${subCommand}`);
    }
  }

  async buildInfo(args, provider) {
    const tokenAddress = args.token;
    if (!tokenAddress) {
      throw new Error('--token is required');
    }

    console.log('🆙 Token Information');
    console.log(`Address: ${tokenAddress}`);
    console.log('');

    const info = await this.getTokenInfo(tokenAddress, provider);
    console.log(`Decimals: ${info.decimals}`);
    console.log(`Total Supply: ${info.totalSupplyDisplay} ${info.symbol}`);
    console.log(`(On-chain: ${info.totalSupplyRaw})`);

    return { skipExecution: true };
  }

  async buildTransfer(args, credentials, provider, network) {
    const tokenAddress = args.token;
    const toAddress = args.to;
    const amount = args.amount;

    if (!tokenAddress || !toAddress || !amount) {
      throw new Error('--token, --to, and --amount are required');
    }

    console.log('🆙 Token Transfer');
    console.log(`Token: ${tokenAddress}`);
    const info = await this.getTokenInfo(tokenAddress, provider);
    console.log(`Name: ${info.name} (${info.symbol})`);
    console.log(`To: ${toAddress}`);
    console.log(`Amount: ${amount} ${info.symbol}`);
    console.log('');

    console.log('🔨 Building transaction...');
    const token = new ethers.Contract(tokenAddress, ABIS.LSP7, provider);
    const decimals = await token.decimals();
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);
    const transferData = token.interface.encodeFunctionData('transfer', [
      credentials.upAddress,
      toAddress,
      amountInWei,
      true, // force
      '0x' // data
    ]);

    const payload = buildUpExecute(credentials.upAddress, tokenAddress, transferData);
    console.log('✅ Payload built');
    console.log('');

    return { payload, meta: { tokenAddress, toAddress, amount, symbol: info.symbol } };
  }

  async getTokenInfo(tokenAddress, provider) {
    const erc725y = new ethers.Contract(tokenAddress, ABIS.ERC725Y, provider);
    const token = new ethers.Contract(tokenAddress, ABIS.LSP7, provider);
    const [nameData, symbolData, decimals, totalSupply] = await Promise.all([
      erc725y.getData(LSP4_DATA_KEYS.name).catch(() => '0x'),
      erc725y.getData(LSP4_DATA_KEYS.symbol).catch(() => '0x'),
      token.decimals().catch(() => 18),
      token.totalSupply().catch(() => 0n),
    ]);

    let name = 'Unknown';
    let symbol = '???';

    if (nameData && nameData !== '0x') {
      try {
        if (nameData.length > 130) {
          const length = parseInt(nameData.substring(66, 130), 16);
          const dataHex = nameData.substring(130, 130 + length * 2);
          name = ethers.toUtf8String('0x' + dataHex);
        } else {
          name = ethers.toUtf8String(nameData);
        }
      } catch { /* ignore */ }
    }

    if (symbolData && symbolData !== '0x') {
      try {
        if (symbolData.length > 130) {
          const length = parseInt(symbolData.substring(66, 130), 16);
          const dataHex = symbolData.substring(130, 130 + length * 2);
          symbol = ethers.toUtf8String('0x' + dataHex);
        } else {
          symbol = ethers.toUtf8String(symbolData);
        }
      } catch { /* ignore */ }
    }

    const decimalsNum = Number(decimals);
    const totalSupplyFormatted = ethers.formatUnits(totalSupply, decimalsNum);
    const totalSupplyInt = Math.floor(parseFloat(totalSupplyFormatted)).toLocaleString();

    return {
      name,
      symbol,
      decimals: decimalsNum,
      totalSupplyRaw: totalSupply.toString(),
      totalSupply: totalSupplyFormatted,
      totalSupplyDisplay: totalSupplyInt,
    };
  }

  onSuccess(result) {
    if (result.meta) {
      console.log('✅ Transfer completed!');
      console.log(`TX: ${result.transactionHash}`);
      console.log(`Explorer: ${result.explorerUrl}`);
    }
  }
}
new TokensCommand().run();
