import * as fs from 'fs';
import * as path from 'path';

import { FlowNetwork } from '@melosstudio/flow-sdk';

export const isProd = process.env.NODE_ENV === 'production';

export type ContractCfg = {
  name: string;
  address: string;
  createdBlockHeight: number;
  includeEvents: string[];
};
export type AccountCfg = { address: string; pk: string; keyId: number };

export function getConfigByNetwork(file: string, network: FlowNetwork) {
  try {
    return JSON.parse(
      fs
        .readFileSync(path.join(__dirname, `../../../${file}`), {
          encoding: 'utf-8',
        })
        .toString(),
    )[network];
  } catch (err) {
    console.warn(`Failed to load config "${file}": `, err);
    return [];
  }
}

export function getAccounts(network: FlowNetwork): AccountCfg[] {
  return getConfigByNetwork('accounts.json', network);
}

export function getContracts(network: FlowNetwork): ContractCfg[] {
  return getConfigByNetwork('contracts.json', network);
}

export function getAccessNodes(network: FlowNetwork) {
  switch (network) {
    case 'emulator':
      return (
        process.env.EMULATOR_ACCESS_NODE || 'https://localhost:8080'
      ).split(',');
    case 'testnet':
      return (
        process.env.TESTNET_ACCESS_NODE || 'https://access-testnet.onflow.org'
      ).split(',');
    case 'mainnet':
      return (
        process.env.MAINNET_ACCESS_NODE || 'https://access.onflow.org'
      ).split(',');
  }
}

export default () => ({
  mongodb: process.env.MONGO_URI,
  prod: isProd,
  'web-api': {
    port: process.env.WEB_APP_PORT || 6000,
  },
  network: process.env.NETWORK,
  testnet: {
    accounts: getAccounts('testnet'),
    accessNodes: getAccessNodes('testnet'),
    contracts: getContracts('testnet'),
  },
  mainnet: {
    accounts: getAccounts('mainnet'),
    accessNodes: getAccessNodes('mainnet'),
    contracts: getContracts('mainnet'),
  },
  emulator: {
    accounts: getAccounts('emulator'),
    accessNodes: getAccessNodes('emulator'),
    contracts: getContracts('emulator'),
  },
});
