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
  db: ScannerService['dbHandles'];
  network: FlowNetwork;
  eventQuery: EventQuery;
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
    db: any,
    accessNodes: string[],
    contract: ContractCfg,
    eventQuery: EventQuery,
    options?: {
      errorSleep?: number;
      sleepDuration?: number;
      scanStep?: number;
    },
  ) {
    this.db = db;

    this.cfg = { accessNodes };
    this.cfgIndexes = { accessNodes: 0 };

    this.contract = contract;
    this.eventQuery = eventQuery;

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
      throw new Error(
        `!!! Request error, next accessNode: ${this.accessNode}; err: ${err}`,
      );
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
      const events = await this.scanEvents(this.eventQuery);

      console.log(
        `  | ==> <Query> ${this.eventQuery.eventType}: Found ${events.length} events.`,
      );
      if (events.length) {
        await this.handleEvents(this.eventQuery, events);
        console.log(`    | ----> ${events.length} events handle done.`);
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
    await this.db.updateScannedHeight(
      this.eventQuery.eventType,
      this.scanedHeight,
    );
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
    const block = await this.db.findLatestBlock(this.eventQuery.eventType);

    if (block) {
      return block.height;
    }

    const height = this.contract.createdBlockHeight || 0;
    await this.db.createNewBlockRecord(this.eventQuery.eventType, height);

    return height;
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
  workers: ScanWorker[] = [];

  dbHandles = {
    findLatestBlock: (eventType: string) => {
      return this.blockRecord
        .findOne({ network: this.network, eventType })
        .sort({ height: -1 });
    },
    updateScannedHeight: (eventType: string, scanedHeight: number) => {
      return this.blockRecord.updateOne({
        network: this.network,
        eventType,
        height: scanedHeight,
      });
    },
    createNewBlockRecord: (eventType: string, height: number) => {
      return this.blockRecord.create({
        network: this.network,
        eventType,
        height,
      });
    },
  };

  constructor(
    @InjectModel(BlockScanRecord)
    private readonly blockRecord: ReturnModelType<typeof BlockScanRecord>,
    private readonly configService: ConfigService,
  ) {
    this.loadConfig();
    this.loadWorkers();
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

  loadWorkers() {
    console.log('loading workers...');
    for (const contract of this.contracts) {
      for (const eventName of contract.includeEvents) {
        this.workers.push(
          new ScanWorker(
            this.dbHandles,
            this.accessNodes,
            contract,
            eventQuery(contract.address, contract.name, eventName),
          ),
        );
      }
    }
    console.log(`${this.workers.length} workers loaded.`);
  }

  async startAll() {
    return Promise.allSettled(this.workers.map((wk) => wk.start()));
  }
}
