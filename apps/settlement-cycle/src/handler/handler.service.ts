import { ContractCfg } from '@MelosFlow/config/config';
import {
  AuthFlowAccount,
  FlowAccount,
  FlowNetwork,
  MelosMarketplaceSDK,
  setAccessNode,
} from '@melosstudio/flow-sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as fcl from '@onflow/fcl';

const SLEEP = 15000;
const REQUEST_TIMEOUT = 40000;

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
  accessNodesIndex = 0;
  melosMarketplaceSdk: MelosMarketplaceSDK;

  constructor(private readonly configService: ConfigService) {
    this.loadConfig();
  }

  get account() {
    return this.accounts[this.accountsIndex];
  }

  get accessNode() {
    return this.accessNodes[this.accessNodesIndex];
  }

  switchAccessNode() {
    if (this.accountsIndex === this.accessNodes.length - 1) {
      this.accountsIndex = 0;
    } else {
      this.accountsIndex++;
    }
    fcl.config().put('accessNode.api', this.accessNode);
  }

  switchAccount() {
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

    fcl.config().put('accessNode.api', this.accessNode);

    this.accounts = this.flowNetworkCfg<any[]>('accounts').map((acc) =>
      FlowAccount.parseObj(acc).upgrade(fcl),
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

  async removeListings() {
    console.log('Getting removable listings...');
    const remove = (
      await this.melosMarketplaceSdk.getRemovableListings()
    ).unwrap();
    console.log(`====> ${remove.length} removable listings founded: `, remove);

    if (remove.length > 0) {
      console.log(
        `  ==> Removing ${remove.length} listings with account "${this.account.address}" keyId: ${this.account.keyId}`,
      );

      await new Promise(async (resolve, reject) => {
        try {
          setTimeout(() => {
            reject('TIMEOUT');
          }, REQUEST_TIMEOUT);
          resolve(
            await (
              await this.melosMarketplaceSdk.publicRemoveEndedListing(
                this.account.auth,
                remove,
              )
            ).assertOk('seal'),
          );
        } catch (err) {
          reject(err);
        }
      });
    }

    return remove;
  }

  async removeOffers() {
    console.log('Getting removable offers...');
    const remove = (
      await this.melosMarketplaceSdk.getRemovableOffers()
    ).unwrap();
    console.log(`====> ${remove.length} removable offers founded: `, remove);

    if (remove.length > 0) {
      console.log(
        `  ==> Removing ${remove.length} offers with account "${this.account.address}" keyId: ${this.account.keyId}`,
      );

      await new Promise(async (resolve, reject) => {
        try {
          setTimeout(() => {
            reject('TIMEOUT');
          }, REQUEST_TIMEOUT);
          resolve(
            await (
              await this.melosMarketplaceSdk.publicRemoveEndedOffer(
                this.account.auth,
                remove,
              )
            ).assertOk('seal'),
          );
        } catch (err) {
          reject(err);
        }
      });
    }

    return remove;
  }

  async handle() {
    try {
      const removedListings = await this.removeListings();
      const removedOffers = await this.removeOffers();
      console.log(
        `---> Done. Removed: \n---> removedListings: ${removedListings}; \n---> removedOffers: ${removedOffers};\n ---> sleeping for ${
          SLEEP / 1000
        }s.`,
      );
      await sleep(SLEEP);
    } catch (err) {
      this.switchAccount();
      console.error(err);
    }
  }

  async start() {
    while (true) {
      await this.handle();
    }
  }
}
