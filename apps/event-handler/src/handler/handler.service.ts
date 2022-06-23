import { Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { ConfigService } from '@nestjs/config';
import { ReturnModelType } from '@typegoose/typegoose';
import { Types } from 'mongoose';

import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { FlowEvent } from '@melosstudio/flow-sdk';

const GARBAGE_RECYCLE_INTERVAL = 5000;

export enum MessageHandleResult {
  Success,
  Fail,
  Skip,
}

export function mongoId() {
  return new Types.ObjectId();
}

export function parseFlowEventFromSQSMessage(
  message: Message,
): FlowEvent | null {
  try {
    return JSON.parse(message.Body) as FlowEvent;
  } catch (err) {
    console.error('Failed to parsing FlowEvent from message, err: ', err);
    return null;
  }
}

@Injectable()
export class HandlerService {
  sqsClient: SQSClient;
  queueURL: string;
  running: boolean;

  unDeletedMessages: string[];
  garbageRecycle: {
    intervalId?: NodeJS.Timer;
    isRunning: boolean;
  };

  constructor(private readonly configService: ConfigService) {
    this.running = false;
    this.unDeletedMessages = [];
    this.garbageRecycle = {
      intervalId: undefined,
      isRunning: false,
    };

    this.loadConfig();
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
  }

  async deleteMessage(ReceiptHandle: string) {
    try {
      const data = await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueURL,
          ReceiptHandle,
        }),
      );
      console.log('Message deleted', data);
      return true;
    } catch (err) {
      console.error('Failed to delete message: ', err);
      this.unDeletedMessages.push(ReceiptHandle);
      return false;
    }
  }

  async handleFlowEvent(event: FlowEvent) {
    console.log('EVENT HANDLE: ', event);

    return true;
  }

  async handleMessage(message: Message): Promise<MessageHandleResult> {
    try {
      if (this.unDeletedMessages.includes(message.ReceiptHandle)) {
        console.log('FOUND A UNDELETED MESSAGE, SKIP.');
        return MessageHandleResult.Skip;
      }

      const event = parseFlowEventFromSQSMessage(message);
      if (!event) {
        await this.deleteMessage(message.ReceiptHandle);
        return MessageHandleResult.Fail;
      }

      const result = await this.handleFlowEvent(event);
      if (result) {
        await this.deleteMessage(message.ReceiptHandle);
        return MessageHandleResult.Success;
      }
    } catch (err) {
      console.error('Failed to handle message: ', err);
      return MessageHandleResult.Fail;
    }
  }

  startGarbageRecycle(interval: number) {
    if (this.garbageRecycle.intervalId) {
      console.warn('GarbageRecycle already started');
      return;
    }

    this.garbageRecycle.intervalId = setInterval(async () => {
      if (
        this.garbageRecycle.isRunning ||
        this.unDeletedMessages.length === 0
      ) {
        return;
      }
      console.log(
        `Deleting unDeletedMessages... total: ${this.unDeletedMessages}`,
      );
      this.garbageRecycle.isRunning = true;

      let success = 0;
      for (const receiptHandle of this.unDeletedMessages) {
        const result = await this.deleteMessage(receiptHandle);
        if (result) success++;
      }

      console.log(`Success delete ${success} unDeletedMessages `);

      this.garbageRecycle.isRunning = false;
    }, interval || GARBAGE_RECYCLE_INTERVAL);
    console.log('GarbageRecycle started');
  }

  stopGarbageRecycle() {
    if (!this.garbageRecycle.intervalId) {
      console.warn('GarbageRecycle is not started');
      return;
    }
    clearInterval(this.garbageRecycle.intervalId);
    console.log('GarbageRecycle is stopped');
  }

  async start() {
    if (this.running) {
      console.warn('HandlerService already running');
      return;
    }

    this.running = true;

    this.startGarbageRecycle(GARBAGE_RECYCLE_INTERVAL);

    const params = {
      AttributeNames: ['SentTimestamp'],
      MaxNumberOfMessages: 10,
      MessageAttributeNames: ['All'],
      QueueUrl: this.queueURL,
      VisibilityTimeout: 20,
      WaitTimeSeconds: 0,
    };

    try {
      const data = await this.sqsClient.send(new ReceiveMessageCommand(params));
      if (data.Messages) {
        let success = 0;
        let failed = 0;
        let skip = 0;
        console.log(`Resolving events, total: ${data.Messages.length}...`);
        for (const message of data.Messages) {
          const handleResult = await this.handleMessage(message);
          switch (handleResult) {
            case MessageHandleResult.Success:
              success++;
              break;
            case MessageHandleResult.Fail:
              failed++;
              break;
            case MessageHandleResult.Skip:
              skip++;
              break;
          }
        }

        console.log(
          `Handle complete, total: ${data.Messages.length}, success: ${success}, failed: ${failed}, skip: ${skip}`,
        );
      }
    } catch (err) {
      console.error('Receive Error', err);
    }
  }
}