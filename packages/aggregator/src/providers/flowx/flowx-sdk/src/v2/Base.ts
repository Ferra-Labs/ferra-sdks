import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { bigNumberUtils } from '../core/utils';
import { IConfigs, getConfigs } from './configs';
import { NETWORK } from './constants';
const { mulBn } = bigNumberUtils;

export abstract class Base {
  protected configs: IConfigs;

  constructor(protected network: NETWORK, protected suiClient: SuiClient) {
    this.network = network;
    this.configs = getConfigs(this.network);
  }

  abstract buildTransaction(...args: any[]): Promise<Transaction> | Transaction;

  protected caculateSlippage(amount: string, slippage: number): string {
    return mulBn(amount, 1 - slippage).toFixed(0);
  }
}
