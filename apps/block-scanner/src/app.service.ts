import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ScannerService } from './scanner/scanner.service';

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    private readonly scannerService: ScannerService,
  ) {}

  async init() {
    await this.scannerService.loadWorkers();
    await this.scannerService.startAll();
  }
}
