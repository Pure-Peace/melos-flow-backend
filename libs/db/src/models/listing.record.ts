import { prop, DocumentType } from '@typegoose/typegoose';

import { VoteType } from '@MelosFlow/type';
import { BaseModel } from './model';

export type IListingRecord = DocumentType<ListingRecord>;

export class ListingRecord extends BaseModel {
  @prop({ type: String, required: true, unique: true })
  txHash!: string;

  @prop({ type: String, required: true, index: true })
  voter!: string;

  @prop({ type: String, required: true, index: true })
  proposalId!: string;

  @prop({ type: Number, enum: VoteType, required: true })
  support!: VoteType;

  @prop({ type: String, required: true })
  weight!: string;

  @prop({ type: String })
  reason: string | null | undefined;
}
