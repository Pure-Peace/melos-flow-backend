import { prop, DocumentType } from '@typegoose/typegoose';

import { ProposalType } from '@MelosFlow/type';
import { BaseModel } from './model';

export type IProposalRecord = DocumentType<ProposalRecord>;

export class ProposalRecord extends BaseModel {
  @prop({ type: String, required: true, unique: true })
  index!: string;

  @prop({ type: String, required: true, unique: true })
  proposalId!: string;

  @prop({ type: Number, enum: ProposalType, required: true })
  type!: string;

  @prop({ type: String, required: true, index: true })
  proposer!: string;

  @prop({ type: Number, required: true })
  startBlock!: number;

  @prop({ type: Number, required: true })
  endBlock!: number;

  @prop({ type: String })
  title: string;

  @prop({ type: String })
  data: string;
}
