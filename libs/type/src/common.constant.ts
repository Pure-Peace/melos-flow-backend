export enum ListingType {
  Common = 0,
  OpenBid = 1,
  DutchAuction = 2,
  EnglishAuction = 3,
}

export type Network = 'testnet' | 'mainnet' | 'emulator';

export function extractOptional(field: any) {
  if (field?.type === 'Optional' && !!field.value) {
    return extractOptional(field.value);
  }
  return field;
}

export type FlowValue = {
  type: string;
  value: string | number | null | FlowValue;
};

export type Scanresult = {
  blockId: Uint8Array;
  blockHeight: number;
  type: string;
  transactionId: string;
  transactionIndex: number;
  eventIndex: number;
  payload: {
    type: string;
    value: {
      id: string;
      fields: { name: string; value: FlowValue }[];
    };
  };
};

export class FlowEvent {
  blockHeight: number;
  type: string;
  transactionId: string;
  transactionIndex: any;
  eventIndex: number;
  data: Record<string, FlowValue>;

  constructor(res: Scanresult) {
    this.blockHeight = res.blockHeight;
    this.type = res.type;
    this.transactionId = res.transactionId;
    this.transactionIndex = res.transactionIndex;
    this.eventIndex = res.eventIndex;
    this.data = {};

    for (const field of res?.payload?.value?.fields) {
      const f = extractOptional(field.value);

      if (f.type?.startsWith('UInt') || f.type?.startsWith('Int')) {
        f.value = Number(f.value);
      } else if (f.type === 'Type') {
        f.value = f.value.staticType.typeID;
      } else if (field.name.toLowerCase().endsWith('time') && !!f.value) {
        f.value = Number(f.value);
      }
      this.data[field.name] = f;
    }
  }
}
