import {
  plugin,
  modelOptions,
  Severity,
  DocumentType,
} from '@typegoose/typegoose';
import * as pagination from 'mongoose-paginate-v2';

export type IBaseModel = DocumentType<BaseModel>;

@plugin(pagination)
@modelOptions({
  options: {
    allowMixed: Severity.ALLOW,
  },
  schemaOptions: {
    timestamps: true,
  },
})
export class BaseModel {}
