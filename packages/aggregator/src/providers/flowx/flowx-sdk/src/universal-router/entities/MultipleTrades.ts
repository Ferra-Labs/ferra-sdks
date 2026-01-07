import { Transaction } from '@mysten/sui/transactions';
import { Coin } from '../../core';
import { BuildTransactionOptions, Trade } from './Trade';

export class MultipleTrades<CInput extends Coin, COutput extends Coin> {
  private readonly trades: Trade<CInput, COutput>[];

  constructor(trades: Trade<CInput, COutput>[]) {
    this.trades = trades;
  }

  public async buildTransaction(
    sender: string,
    params: BuildTransactionOptions
  ): Promise<Transaction> {
    const tx = new Transaction();
    tx.setSender(sender);
    for (const trade of this.trades) {
      const coinOut: any = await trade.swap({ client: params.client, tx });
      tx.transferObjects([coinOut], sender);
    }
    return tx;
  }
}
