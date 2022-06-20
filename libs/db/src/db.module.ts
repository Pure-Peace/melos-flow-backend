import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypegooseModule } from 'nestjs-typegoose';

import { ConfigModule } from '@MelosFlow/config';

import { DbService } from './db.service';
import { BlockScanRecord } from './models/block-scan.record';
import { ListingRecord } from './models/listing.record'
import { ProposalRecord } from './models/proposal.record';

const Models = [BlockScanRecord, ListingRecord, ProposalRecord];

const models = TypegooseModule.forFeature(Models, 'melos-flow');

@Global()
@Module({
  imports: [
    TypegooseModule.forRootAsync({
      connectionName: 'melos-flow',
      imports: [ConfigModule],
      useFactory: async (service) => ({
        uri: await service.get('mongodb'),
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }),
      inject: [ConfigService],
    }),
    models,
  ],
  providers: [DbService],
  exports: [DbService, models],
})
export class DbModule {}

export { DbService, BlockScanRecord, ListingRecord, ProposalRecord };
