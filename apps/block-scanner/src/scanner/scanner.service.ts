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
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';

const ERROR_SLEEP = 5000;
const SLEEP_DURATION = 30000;
const SCAN_STEP = 249;

const ERROR_RETRY_RECYCLE_INTERVAL = 5000;

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

export type EventsHandler = (worker: ScanWorker, events: FlowEvent[]) => any;

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

  eventsHandler: EventsHandler;

  constructor(
    eventsHandler: EventsHandler,
    db: ScannerService['dbHandles'],
    network: FlowNetwork,
    accessNodes: string[],
    contract: ContractCfg,
    eventQuery: EventQuery,
    options?: {
      errorSleep?: number;
      sleepDuration?: number;
      scanStep?: number;
    },
  ) {
    this.eventsHandler = eventsHandler;
    this.db = db;
    this.network = network;

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

  async scanEvents() {
    try {
      return (
        await sdk.send(
          await sdk.build([
            sdk.getEvents(
              this.eventQuery.eventType,
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

      const events = await this.scanEvents();

      const title = `\n===> <${this.network}> Scan from ${this.scanedHeight} to ${this.targetHeight} (latest: ${this.latestHeight})`;
      console.log(
        title +
          `\n  |  <Query> ${this.eventQuery.eventType}: Found ${events.length} events.`,
      );

      if (events.length) {
        const success = await this.eventsHandler(this, events);
        console.log(`    | ----> ${success} events handle done.`);
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
}

@Injectable()
export class ScannerService {
  network: FlowNetwork;
  accessNodes: string[];
  contracts: ContractCfg[];
  workers: ScanWorker[] = [];
  sqsClient: SQSClient;
  queueURL: string;
  unSendMessages: any[] = [];

  errorRetry: {
    intervalId?: NodeJS.Timer;
    isRunning: boolean;
  };

  dbHandles = {
    findLatestBlock: (eventType: string) => {
      return this.blockRecord
        .findOne({ network: this.network, eventType })
        .sort({ height: -1 });
    },
    updateScannedHeight: (eventType: string, scanedHeight: number) => {
      return this.blockRecord
        .updateOne({
          height: scanedHeight,
        })
        .where({
          network: this.network,
          eventType,
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
    this.errorRetry = {
      intervalId: undefined,
      isRunning: false,
    };
  }

  loadConfig() {
    this.sqsClient = this.configService.get<SQSClient>('sqsClient');
    if (!this.sqsClient) {
      throw new Error('AWS SQSClient not exists');
    }

    this.queueURL = process.env.AWS_SQS_QUEUE_URL;
    if (!this.queueURL) {
      throw new Error('queueURL not define');
    }

    this.network = this.configService
      .get<string>('network')
      .toLowerCase() as FlowNetwork;

    if (!['testnet', 'mainnet', 'emulator'].includes(this.network)) {
      throw new Error(`Invalid network: ${this.network}`);
    }

    this.accessNodes = this.flowNetworkCfg<string[]>('accessNodes');
    if (this.accessNodes?.length === 0) {
      throw new Error('AccessNode not exists');
    }

    this.contracts = this.flowNetworkCfg<ContractCfg[]>('contracts');
    if (this.contracts?.length === 0) {
      throw new Error('Contract not exists');
    }
  }

  flowNetworkCfg<T>(path: string): T {
    return this.configService.get<T>(`${this.network}.${path}`);
  }

  startErrorRetry(interval?: number) {
    if (this.errorRetry.intervalId) {
      console.warn('ErrorRetry already started');
      return;
    }

    this.errorRetry.intervalId = setInterval(async () => {
      if (this.errorRetry.isRunning || this.unSendMessages.length === 0) {
        return;
      }
      console.log(
        `====> Sending unSendMessages... total: ${this.unSendMessages}`,
      );
      this.errorRetry.isRunning = true;

      let success = 0;
      while (this.unSendMessages.length > 0) {
        const params = this.unSendMessages.pop();
        const result = await this.sqsClient.send(
          new SendMessageBatchCommand(params),
        );
        if (result) success++;
      }

      console.log(`  --> Success sended ${success} unSendMessages `);

      this.errorRetry.isRunning = false;
    }, interval || ERROR_RETRY_RECYCLE_INTERVAL);
    console.log('==> ErrorRetry loop started');
  }

  stopErrorRetry() {
    if (!this.errorRetry.intervalId) {
      console.warn('ErrorRetry is not started');
      return;
    }
    clearInterval(this.errorRetry.intervalId);
    console.log('ErrorRetry is stopped');
  }

  async eventsHandler(worker: ScanWorker, events: FlowEvent[]) {
    const RESOLVE_COUNT = 5;

    const total = events.length;
    let success = 0;
    while (events.length > 0) {
      const batch = events.splice(0, RESOLVE_COUNT);
      const params = {
        Entries: [],
        QueueUrl: this.queueURL,
      };
      for (const [i, ev] of Object.entries(batch)) {
        const [, contractAddress, contractName, eventName] = ev.type.split('.');
        params.Entries.push({
          Id: `${eventName}-${i}`,
          DelaySeconds: 0,
          MessageAttributes: {
            BlockHeight: {
              DataType: 'Number',
              StringValue: ev.blockHeight,
            },
            TransactionId: {
              DataType: 'String',
              StringValue: ev.transactionId,
            },
            EventType: {
              DataType: 'String',
              StringValue: ev.type,
            },
          },
          MessageBody: JSON.stringify(ev),
        });
      }
      try {
        await this.sqsClient.send(new SendMessageBatchCommand(params));
        success += params.Entries.length;
      } catch (err) {
        console.error(
          `!!! ---> Failed to send ${batch.length} messages to SQS, err: \n  | ==>`,
          err,
        );
        this.unSendMessages.push(params);
      }
    }
    console.log(
      `  |  ${success} messages are sended to SQS. total events: ${total}`,
    );
    return success;
  }

  loadWorkers() {
    console.log('loading workers...');
    for (const contract of this.contracts) {
      for (const eventName of contract.includeEvents) {
        this.workers.push(
          new ScanWorker(
            (worker, events) => this.eventsHandler(worker, events),
            this.dbHandles,
            this.network,
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
    this.startErrorRetry();
    return Promise.allSettled(this.workers.map((wk) => wk.start()));
  }
}
