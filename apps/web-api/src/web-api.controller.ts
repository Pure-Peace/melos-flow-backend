import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

import { DappWebService } from './web-api.service';

@Controller('/getProposalVoteList')
@ApiTags('GetProposalVoteList')
export class GerProposalVoteListController {
  constructor(private readonly dappWebService: DappWebService) {}

  @Get()
  @ApiQuery({
    type: String,
    name: 'proposalId',
  })
  @ApiQuery({
    type: Number,
    name: 'page',
  })
  @ApiQuery({
    type: Number,
    name: 'limit',
  })
  async getProposalCastVoteList(
    @Query('proposalId') proposalId: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    return this.dappWebService.getProposalCastVoteList(proposalId, page, limit);
  }
}

@Controller('/getProposalList')
@ApiTags('GetProposalList')
export class GetProposalListController {
  constructor(private readonly dappWebService: DappWebService) {}

  @Get()
  @ApiQuery({
    type: Number,
    name: 'page',
  })
  @ApiQuery({
    type: Number,
    name: 'limit',
  })
  async getProposalList(
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    return this.dappWebService.getProposalList(page, limit);
  }
}

@Controller('/getProposal')
@ApiTags('GetProposal')
export class GetProposalController {
  constructor(private readonly dappWebService: DappWebService) {}

  @Get()
  @ApiQuery({
    type: String,
    name: 'proposalId',
  })
  async getProposal(@Query('proposalId') proposalId: string) {
    return this.dappWebService.getProposal(proposalId);
  }
}
