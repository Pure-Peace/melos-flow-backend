import { prop, DocumentType } from '@typegoose/typegoose';

import { ListingType } from '@melosstudio/flow-sdk';
import { BaseModel } from './model';

export type IListingRecord = DocumentType<ListingRecord>;

export class ListingRecord extends BaseModel {
  @prop({ type: Number, required: true, unique: true })
  listingId!: number;

  @prop({ type: Number, enum: ListingType, required: true })
  listingType!: ListingType;

  @prop({ type: String, required: true, index: true })
  transactionId!: string;

  @prop({ type: Number, required: true, index: true })
  blockHeight!: number;

  @prop({ type: Number, required: true })
  eventIndex!: number;

  @prop({ type: String, required: true, index: true })
  seller!: string;

  @prop({ type: Number, required: true })
  nftId!: number;

  @prop({ type: String, required: true, index: true })
  nftType!: string;

  @prop({ type: String, required: true })
  nftResourceUUID!: string;

  @prop({ type: String, required: true })
  paymentToken!: string;

  @prop({ type: Number, required: true })
  listingStartTime!: number;

  @prop({ type: Number })
  listingEndTime!: number;
}
