import { ContractCfg } from '@MelosFlow/config/config';
import {
  AuthFlowAccount,
  FlowAccount,
  FlowNetwork,
  getMaps,
  MelosMarketplaceSDK,
} from '@melosstudio/flow-sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as fcl from '@onflow/fcl';

export async function sleep(duration: number) {
  await new Promise((resolve: any) => setTimeout(() => resolve(), duration));
}

@Injectable()
export class HandlerService {
  network: FlowNetwork;
  accessNodes: string[];
  contracts: ContractCfg[];
  accounts: AuthFlowAccount[];
  accountsIndex = 0;
  melosMarketplaceSdk: MelosMarketplaceSDK;

  constructor(private readonly configService: ConfigService) {
    this.loadConfig();
  }

  get auth() {
    return this.accounts[this.accountsIndex].auth;
  }

  increaseIndex() {
    if (this.accountsIndex === this.accounts.length - 1) {
      this.accountsIndex = 0;
    } else {
      this.accountsIndex++;
    }
  }

  loadConfig() {
    this.network = this.configService
      .get<string>('network')
      .toLowerCase() as FlowNetwork;

    if (!['testnet', 'mainnet', 'emulator'].includes(this.network)) {
      throw new Error(`Invalid network: ${this.network}`);
    }

    this.accessNodes = this.flowNetworkCfg<string[]>('accessNodes');
    if (this.accessNodes?.length === 0) {
      throw new Error('AccessNode not exists');
    }

    this.accounts = this.flowNetworkCfg<any[]>('accounts').map((acc) =>
      FlowAccount.parseObj(acc).upgrade(fcl, this.network),
    );
    if (this.accounts?.length === 0) {
      throw new Error('Accounts not exists');
    }

    this.contracts = this.flowNetworkCfg<ContractCfg[]>('contracts');
    if (this.contracts?.length === 0) {
      throw new Error('Contract not exists');
    }

    const marketplace = this.contracts.find(
      (c) => c.name === 'MelosMarketplace',
    );
    if (!marketplace) {
      throw new Error('MelosMarketplace not founded');
    }

    this.melosMarketplaceSdk = new MelosMarketplaceSDK({
      MelosMarketplace: marketplace.address,
    });
  }

  flowNetworkCfg<T>(path: string): T {
    return this.configService.get<T>(`${this.network}.${path}`);
  }

  async handle() {
    try {
      console.log('Getting removable listings...');
      const removableListings = (
        await this.melosMarketplaceSdk.getRemovableListings()
      ).unwrap();
      console.log(
        `${removableListings.length} removable listings founded: `,
        removableListings,
      );

      if (removableListings.length > 0) {
        (
          await this.melosMarketplaceSdk.publicRemoveEndedListing(
            this.auth,
            removableListings,
          )
        ).assertOk('seal');
      }

      console.log('Getting removable offers...');
      const removeableOffers = (
        await this.melosMarketplaceSdk.getRemovableOffers()
      ).unwrap();
      console.log(
        `${removeableOffers.length} removable offers founded: `,
        removeableOffers,
      );

      if (removeableOffers.length > 0) {
        (
          await this.melosMarketplaceSdk.publicRemoveEndedOffer(
            this.auth,
            removeableOffers,
          )
        ).assertOk('seal');
      }

      console.log('Handle done.');
    } catch (err) {
      this.increaseIndex();
      console.error(err);
    }
  }

  async start() {
    while (true) {
      await this.handle();
      await sleep(30000);
    }
  }
}
