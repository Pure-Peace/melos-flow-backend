import { Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ConfigService } from '@nestjs/config';
import { ReturnModelType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

import * as sdk from '@onflow/sdk';
import * as fcl from '@onflow/fcl';

import { BlockScanRecord } from '@MelosFlow/db';

import { FlowNetwork } from 'melos-flow/sdk/config';
import { FlowEvent } from 'melos-flow/sdk/common';

const ERROR_SLEEP = 5000;
const SLEEP_DURATION = 30000;
const SCAN_STEP = 249;

@Injectable()
export class ScannerService {
  network: FlowNetwork;
  accessNode: string;
  marketplaceContractAddress: string;

  running = false;
  executorIndex = 0;

  constructor(
    @InjectModel(BlockScanRecord)
    private readonly blockRecord: ReturnModelType<typeof BlockScanRecord>,
    private readonly configService: ConfigService,
  ) {
    this.initialize();
  }

  initialize() {
    this.network = this.configService
      .get<string>('network')
      .toLowerCase() as FlowNetwork;

    if (!['testnet', 'mainnet', 'emulator'].includes(this.network)) {
      throw new Error(`Invalid network: ${this.network}`);
    }

    this.accessNode = this.cfg<string>('accessNode');
    if (!this.accessNode) {
      throw new Error(`Invalid accessNode: ${this.accessNode}`);
    }

    this.marketplaceContractAddress = this.cfg<string>('marketplaceContract');
    if (!this.marketplaceContractAddress) {
      throw new Error(
        `Invalid marketplaceContractAddress: ${this.marketplaceContractAddress}`,
      );
    }
  }

  get queries() {
    return ['ListingCreated'];
  }

  cfg<T>(path: string): T {
    return this.configService.get<T>(`${this.network}.${path}`);
  }

  toEventQuery(eventName: string) {
    const address = fcl.sansPrefix(this.marketplaceContractAddress);
    return {
      type: `A.${address}.MelosMarketplace.${eventName}`,
      address,
      eventName,
    };
  }

  async scanedHeight() {
    const block = await this.blockRecord
      .findOne({ network: this.network })
      .sort({ height: -1 });

    if (block) {
      return block.height;
    }

    const height = Number(
      this.cfg<string>('marketplaceContractCreatedBlockNumber') || '0',
    );

    await this.blockRecord.create({
      network: this.network,
      height: height,
    });

    return height;
  }

  async sleep(duration: number) {
    await new Promise((resolve: any) => setTimeout(() => resolve(), duration));
  }

  async latestHeight() {
    const { block } = await sdk.send(await sdk.build([sdk.getLatestBlock()]), {
      node: this.accessNode,
    });
    return block.height;
  }

  mongoId() {
    return new Types.ObjectId();
  }

  async eventHandle(
    query: { type: string; address: string; eventName: string },
    events: FlowEvent[],
  ) {
    switch (query.eventName) {
      case 'ListingCreated':
        for (const ev of events) {
          const {
            listingId,
            listingType,
            seller,
            nftId,
            nftType,
            nftResourceUUID,
            paymentToken,
            listingStartTime,
            listingEndTime,
          } = ev.data;
          console.log(ev);
        }
    }
  }

  async scan() {
    if (this.running === true) {
      console.warn('already running scan tasks');
      return;
    }

    this.running = true;
    let scanedHeight = await this.scanedHeight();

    const mainHandler = async () => {
      try {
        const latestHeight = await this.latestHeight();
        if (!latestHeight) {
          throw new Error(
            `Cannot get latest block height, network: ${this.network}; accessNode: ${this.accessNode}`,
          );
        }

        if (scanedHeight >= latestHeight) {
          console.log(
            `> !== ScanedHeight exceed latestHeight (#${latestHeight}); sleeping for ${
              SLEEP_DURATION / 1000
            } s ...`,
          );
          await this.sleep(SLEEP_DURATION);
          return;
        }

        let targetHeight = scanedHeight + SCAN_STEP;
        if (targetHeight >= latestHeight) {
          targetHeight = latestHeight;
        }

        console.log(
          `\n===> scanning: from ${scanedHeight} to ${targetHeight} (latest: ${latestHeight})`,
        );
        const eventQueries = this.queries.map((i) => this.toEventQuery(i));
        for (const query of eventQueries) {
          const events = (
            await sdk.send(
              await sdk.build([
                sdk.getEvents(query.type, scanedHeight, targetHeight),
              ]),
              { node: this.accessNode },
            )
          ).events.map((ev: any) => new FlowEvent(ev));

          console.log(`  | ==> ${query.type}: Found ${events.length} events.`);
          if (events.length) {
            await this.eventHandle(query, events);
            console.log(`    | ----> ${events.length} events handle done.`);
          }
        }

        scanedHeight = targetHeight;
        await this.blockRecord.updateOne({
          network: this.network,
          height: scanedHeight,
        });
        return true;
      } catch (err) {
        console.error(`\n\n!!!!! ====> SCAN ERROR:`, '\n', err);
        return false;
      }
    };

    while (true) {
      const result = await mainHandler();
      if (!result) {
        console.log(`!!! --> sleeping ${ERROR_SLEEP / 1000}s due to errors.`);
        await this.sleep(ERROR_SLEEP);
      }
    }
  }
}
