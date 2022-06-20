import { Module } from '@nestjs/common';

import { DbModule } from '@MelosFlow/db';
import { ConfigModule } from '@MelosFlow/config';

import { AppService } from './app.service';
import { ScannerModule } from './scanner/scanner.module';

@Module({
  imports: [ConfigModule, DbModule, ScannerModule],
  providers: [AppService],
})
export class AppModule {}
