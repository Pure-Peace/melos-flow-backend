import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HandlerService } from './handler/handler.service';

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    private readonly handlerService: HandlerService,
  ) {}

  async init() {
    await this.handlerService.start();
  }
}
