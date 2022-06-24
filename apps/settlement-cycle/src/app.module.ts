import { Module } from '@nestjs/common';

import { DbModule } from '@MelosFlow/db';
import { ConfigModule } from '@MelosFlow/config';

import { AppService } from './app.service';
import { HandlerModule } from './handler/handler.module';

@Module({
  imports: [ConfigModule, DbModule, HandlerModule],
  providers: [AppService],
})
export class AppModule {}
