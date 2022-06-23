import { prop, DocumentType } from '@typegoose/typegoose';
import { BaseModel } from './model';

export type IBlockScan = DocumentType<BlockScanRecord>;

export class BlockScanRecord extends BaseModel {
  @prop({ type: String, required: true })
  public network!: string;

  @prop({ type: String, required: true, unique: true })
  public eventType!: string;

  @prop({ type: Number, required: true })
  public height!: number;
}
