const isProd = process.env.NODE_ENV === 'production';

export default () => ({
  mongodb: process.env.MONGO_URI,
  prod: isProd,
  'web-api': {
    port: process.env.WEB_APP_PORT || 6000,
  },
  network: process.env.NETWORK,
  testnet: {
    privatekeys: process.env.TESTNET_ACCOUNTS,
    accessNode: process.env.TESTNET_ACCESS_NODE,
    marketplaceContract: process.env.TESTNET_MARKETPLACE_CONTRACT,
    marketplaceContractCreatedBlockNumber:
      process.env.TESTNET_MARKETPLACE_CREATED_BLOCKNUMBER,
  },
  mainnet: {
    privatekeys: process.env.MAINNET_ACCOUNTS,
    accessNode: process.env.MAINNET_ACCESS_NODE,
    marketplaceContract: process.env.MAINNET_MARKETPLACE_CONTRACT,
    marketplaceContractCreatedBlockNumber:
      process.env.MAINNET_MARKETPLACE_CREATED_BLOCKNUMBER,
  },
});
