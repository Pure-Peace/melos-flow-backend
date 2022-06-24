# MELOS-FLOW-BACKEND

Contains the flow event scanning service, sending events to AWS SQS; and the flow event hanlding service.

## Install

```bash
npm i -g yarn
yarn
```

## Config `.env`

*Example*

```bash
# production for production env, any for others
NODE_ENV=production
MONGO_URI=<mongo db uri>
WEB_APP_PORT=8080

AWS_SQS_REGION=<aws sqs region>
AWS_SQS_ACCESS_KEY_ID=
AWS_SQS_SECRET_ACCESS_KEY=

# testnet | mainnet | emulator
NETWORK = testnet

# multiple access nodes can be separated by ','
EMULATOR_ACCESS_NODES = https://localhost:8080
TESTNET_ACCESS_NODES = https://access-testnet.onflow.org
MAINNET_ACCESS_NODES = https://access.onflow.org

```

## Config `contracts.json` (scanner)

- The scanner will scan the configured contracts and events, and store the scan progress of different events in mongodb respectively.

*Example*

```json
{
    "testnet": [
        {
            "name": "MelosMarketplace",
            "address": "0xfbbc4cdfaf59224c",
            "createdBlockHeight": 71110006,
            "includeEvents": [
                "MelosSettlementInitialized",
                "MarketplaceManagerCreated",
                "MarketplaceManagerDestroyed",
                "FungibleTokenFeeUpdated",
                "ListingTxFeeCutted",
                "OfferAcceptFeeCutted",
                "FungibleTokenFeeRemoved",
                "MinimumListingDurationChanged",
                "MaxAuctionDurationChanged",
                "AllowedPaymentTokensChanged",
                "BidCreated",
                "BidRemoved",
                "BidListingCompleted",
                "ListingCreated",
                "ListingRemoved",
                "FixedPricesListingCompleted",
                "FungibleTokenRefunded",
                "UnRefundPaymentCreated",
                "UnRefundPaymentClaimed",
                "UnRefundPaymentDeposited",
                "UnRefundPaymentNotify",
                "OfferCreated",
                "OfferAccepted",
                "OfferRemoved"
            ]
        }
    ]
}
```

## Start scanner

```bash
yarn start block-scanner
```

## Start event handler

```bash
yarn start event-handler
```

## Start settlement cycle

```bash
yarn start settlement-cycle
```


## Prod running

```bash
yarn prod-run-scanner
```

```bash
yarn prod-event-handler
```

```bash
yarn prod-settlement-cycle
```

