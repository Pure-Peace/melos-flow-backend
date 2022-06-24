import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export async function sleep(duration: number) {
  await new Promise((resolve: any) => setTimeout(() => resolve(), duration));
}

@Injectable()
export class HandlerService {
  constructor(private readonly configService: ConfigService) {}

  async start() {}
}
