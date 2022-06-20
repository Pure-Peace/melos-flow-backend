import { Injectable } from '@nestjs/common';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';

import { CastVoteRecord, ProposalRecord } from '@MelosFlow/db';

@Injectable()
export class DappWebService {
  constructor(
    @InjectModel(CastVoteRecord)
    private readonly castVoteRecord: ReturnModelType<typeof CastVoteRecord>,
    @InjectModel(ProposalRecord)
    private readonly proposalRecord: ReturnModelType<typeof ProposalRecord>,
  ) {}

  async getProposalCastVoteList(
    proposalId: string,
    page: number,
    limit: number,
  ) {
    const options: any = {};
    if (proposalId) {
      options.proposalId = proposalId;
    }
    const list = await this.castVoteRecord['paginate'](options, {
      page,
      limit,
      sort: { weight: -1 },
    });
    return list;
  }

  async getProposalList(page: number, limit: number) {
    const list = await this.proposalRecord['paginate'](
      {},
      {
        page,
        limit,
        sort: { index: -1 },
      },
    );
    return list;
  }

  async getProposal(proposalId: string) {
    return await this.proposalRecord.findOne({ proposalId });
  }
}
