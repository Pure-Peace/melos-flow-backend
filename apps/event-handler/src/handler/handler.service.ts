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

  constructor(private readonly configService: ConfigService) {
    this.running = false;
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
    } catch (err) {
      console.error('Failed to delete message: ', err);
      this.unDeletedMessages.push(ReceiptHandle);
    }
  }

  async handleFlowEvent(event: FlowEvent) {
    console.log('EVENT HANDLE: ', event);

    return true;
  }

  async handleMessage(message: Message) {
    try {
      if (this.unDeletedMessages.includes(message.ReceiptHandle)) {
        console.log('FOUND A UNDELETED MESSAGE, SKIP.');
        return true;
      }

      const event = parseFlowEventFromSQSMessage(message);
      if (!event) {
        await this.deleteMessage(message.ReceiptHandle);
        return false;
      }

      const result = await this.handleFlowEvent(event);
      if (result) {
        await this.deleteMessage(message.ReceiptHandle);
        return true;
      }
    } catch (err) {
      console.error('Failed to handle message: ', err);
      return false;
    }
  }

  async start() {
    this.running = true;

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
        console.log(`Resolving events, total: ${data.Messages.length}...`);
        for (const message of data.Messages) {
          const result = await this.handleMessage(message);
          if (result) success++;
        }

        console.log(
          `Handle complete, total: ${data.Messages.length}, success: ${success}`,
        );
      }
    } catch (err) {
      console.error('Receive Error', err);
    }
  }
}
