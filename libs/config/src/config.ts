import fs from 'fs';
import { FlowNetwork } from 'melos-flow/sdk/config';
import path from 'path';

export const isProd = process.env.NODE_ENV === 'production';

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

export function getAccounts(
  network: FlowNetwork,
): { address: string; pk: string; keyId: number }[] {
  return getConfigByNetwork('accounts.json', network);
}

export function getContracts(
  network: FlowNetwork,
): { contract: string; address: string; createdBlockHeight: number }[] {
  return getConfigByNetwork('contracts.json', network);
}

export function getEvents(
  network: FlowNetwork,
): { contract: string; events: string[] }[] {
  return getConfigByNetwork('events.json', network);
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
    events: getEvents('testnet'),
  },
  mainnet: {
    accounts: getAccounts('mainnet'),
    accessNodes: getAccessNodes('mainnet'),
    contracts: getContracts('mainnet'),
    events: getEvents('mainnet'),
  },
  emulator: {
    accounts: getAccounts('emulator'),
    accessNodes: getAccessNodes('emulator'),
    contracts: getContracts('emulator'),
    events: getEvents('emulator'),
  },
});
