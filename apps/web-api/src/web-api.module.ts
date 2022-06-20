import { Module } from '@nestjs/common';

import { DbModule } from '@MelosFlow/db';

import {
  GerProposalVoteListController,
  GetProposalListController,
  GetProposalController,
} from './web-api.controller';
import { DappWebService } from './web-api.service';

@Module({
  imports: [DbModule],
  controllers: [
    GerProposalVoteListController,
    GetProposalListController,
    GetProposalController,
  ],
  providers: [DappWebService],
})
export class DappWebModule {}
