import { Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ConfigService } from '@nestjs/config';
import { ReturnModelType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

import * as sdk from '@onflow/sdk';
import * as fcl from '@onflow/fcl';

import { BlockScanRecord } from '@MelosFlow/db';

import { FlowNetwork, FlowEvent } from '@melosstudio/flow-sdk';
import { ContractCfg } from '@MelosFlow/config/config';

const ERROR_SLEEP = 5000;
const SLEEP_DURATION = 30000;
const SCAN_STEP = 249;

export async function sleep(duration: number) {
  await new Promise((resolve: any) => setTimeout(() => resolve(), duration));
}

export async function getBlockHeight(accessNode: string) {
  const { block } = await sdk.send(await sdk.build([sdk.getLatestBlock()]), {
    node: accessNode,
  });
  return block.height;
}

export function mongoId() {
  return new Types.ObjectId();
}

export type EventQuery = {
  eventType: string;
  contractName: string;
  address: string;
  eventName: string;
};

export function eventQuery(
  contractAddress: string,
  contractName: string,
  eventName: string,
): EventQuery {
  const address = fcl.sansPrefix(contractAddress);
  return {
    eventType: `A.${address}.${contractName}.${eventName}`,
    contractName,
    address,
    eventName,
  };
}

export class ScanWorker {
  private readonly blockRecord: ReturnModelType<typeof BlockScanRecord>;
  network: FlowNetwork;
  eventQueries: EventQuery[];
  contract: ContractCfg;

  errorSleep: number;
  sleepDuration: number;
  scanStep: number;

  scanedHeight: number;
  targetHeight: number;
  latestHeight: number;

  running: boolean;

  cfg: {
    accessNodes: string[];
  };
  cfgIndexes: Record<keyof ScanWorker['cfg'], number>;

  constructor(
    blockRecodModel: ReturnModelType<typeof BlockScanRecord>,
    accessNodes: string[],
    contract: ContractCfg,
    options?: {
      errorSleep?: number;
      sleepDuration?: number;
      scanStep?: number;
    },
  ) {
    this.blockRecord = blockRecodModel;

    this.cfg = { accessNodes };
    this.cfgIndexes = { accessNodes: 0 };

    this.contract = contract;

    this.errorSleep = this.errorSleep = options?.errorSleep || ERROR_SLEEP;
    this.sleepDuration = options?.sleepDuration || SLEEP_DURATION;
    this.scanStep = options?.scanStep || SCAN_STEP;
  }

  get accessNode() {
    return this.cfg.accessNodes[this.cfgIndexes.accessNodes];
  }

  increaseIndex(indexKey: keyof ScanWorker['cfgIndexes']) {
    if (this.cfgIndexes[indexKey] === this.cfg[indexKey].length - 1) {
      this.cfgIndexes[indexKey] = 0;
    } else {
      this.cfgIndexes[indexKey]++;
    }
  }

  async scanEvents(query: EventQuery) {
    try {
      return (
        await sdk.send(
          await sdk.build([
            sdk.getEvents(
              query.eventType,
              this.scanedHeight,
              this.targetHeight,
            ),
          ]),
          { node: this.accessNode },
        )
      ).events.map((ev: any) => new FlowEvent(ev));
    } catch (err) {
      this.increaseIndex('accessNodes');
      throw new Error(err);
    }
  }

  async scan() {
    try {
      await this.updateLatestHeight();
      if (!this.latestHeight) {
        throw new Error(
          `Cannot get latest block height, network: ${this.network}; accessNode: ${this.accessNode}`,
        );
      }

      if (this.scanedHeight >= this.latestHeight) {
        console.log(
          `> !== ScanedHeight exceed blockHeight (#${
            this.latestHeight
          }); sleeping for ${this.sleepDuration / 1000} s ...`,
        );
        await sleep(this.sleepDuration);
        return;
      }

      this.targetHeight = this.scanedHeight + this.scanStep;
      if (this.targetHeight >= this.latestHeight) {
        this.targetHeight = this.latestHeight;
      }

      console.log(
        `\n===> scanning: from ${this.scanedHeight} to ${this.targetHeight} (latest: ${this.latestHeight})`,
      );
      for (const query of this.eventQueries) {
        const events = await this.scanEvents(query);

        console.log(
          `  | ==> ${query.eventType}: Found ${events.length} events.`,
        );
        if (events.length) {
          await this.handleEvents(query, events);
          console.log(`    | ----> ${events.length} events handle done.`);
        }
      }

      await this.recordScannedHeight();

      return true;
    } catch (err) {
      console.error(`\n\n!!!!! ====> SCAN ERROR:`, '\n', err);
      return false;
    }
  }

  async recordScannedHeight() {
    this.scanedHeight = this.targetHeight;
    await this.blockRecord.updateOne({
      network: this.network,
      eventType: 'todo',
      height: this.scanedHeight,
    });
  }

  async start() {
    if (this.running === true) {
      console.warn('Worker are already started');
      return;
    }

    this.running = true;
    await this.updateScannedHeight();

    while (this.running) {
      const success = await this.scan();
      if (!success) {
        console.log(
          `!!! --> Worker: sleeping ${this.errorSleep / 1000}s due to errors.`,
        );
        await sleep(this.errorSleep);
      }
    }

    this.running = false;
    console.warn('Worker stopped');
  }

  stop() {
    this.running = false;
  }

  async updateScannedHeight() {
    this.scanedHeight = await this.getScanedHeight();
  }

  async updateLatestHeight() {
    this.latestHeight = await getBlockHeight(this.accessNode);
  }

  async getScanedHeight() {
    const block = await this.blockRecord
      .findOne({ network: this.network, eventType: 'todo' })
      .sort({ height: -1 });

    if (block) {
      return block.height;
    }

    await this.blockRecord.create({
      network: this.network,
      eventType: 'todo',
      height: this.contract.createdBlockHeight || 0,
    });

    return this.contract.createdBlockHeight || 0;
  }

  async handleEvents(query: EventQuery, events: FlowEvent[]) {
    console.log(events);
  }
}

@Injectable()
export class ScannerService {
  network: FlowNetwork;
  accessNodes: string[];
  contracts: ContractCfg[];

  constructor(
    @InjectModel(BlockScanRecord)
    private readonly blockRecord: ReturnModelType<typeof BlockScanRecord>,
    private readonly configService: ConfigService,
  ) {
    this.loadConfig();
  }

  loadConfig() {
    this.network = this.configService
      .get<string>('network')
      .toLowerCase() as FlowNetwork;

    if (!['testnet', 'mainnet', 'emulator'].includes(this.network)) {
      throw new Error(`Invalid network: ${this.network}`);
    }

    this.accessNodes = this.cfg<string[]>('accessNodes');
    if (this.accessNodes?.length === 0) {
      throw new Error('AccessNode not exists');
    }

    this.contracts = this.cfg<ContractCfg[]>('contracts');
    if (this.contracts?.length === 0) {
      throw new Error('Contract not exists');
    }
  }

  cfg<T>(path: string): T {
    return this.configService.get<T>(`${this.network}.${path}`);
  }

  async start() {
    const workers = this.contracts.map(
      (c) => new ScanWorker(this.blockRecord, this.accessNodes, c),
    );
    console.log(workers);
  }
}
