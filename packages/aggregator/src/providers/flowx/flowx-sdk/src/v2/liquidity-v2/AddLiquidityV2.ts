import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { BN } from 'bn.js';
import { Coin } from '../../core';
import { IBothCoins } from '../../core/interfaces';
import { getDeadlineAtTimestampMs } from '../../core/utils';
import { Base } from '../Base';
import { ADD_LIQUIDITY, NETWORK, ROUTER } from '../constants';

export class AddLiquidityV2 extends Base {
  constructor(network: NETWORK, suiClient: SuiClient) {
    super(network, suiClient);
  }

  public async buildTransaction(
    coinType: IBothCoins<string>,
    amount: IBothCoins<string>,
    senderAddress: string,
    slippage: number
  ): Promise<Transaction> {
    const tx = new Transaction();

    const coins: IBothCoins<Coin> = {
      x: new Coin(coinType.x),
      y: new Coin(coinType.y),
    };

    const amountMin = {
      x: this.caculateSlippage(amount.x, slippage),
      y: this.caculateSlippage(amount.y, slippage),
    };

    const coinToTransfer = {
      x: await coins.x.take({
        owner: senderAddress,
        amount: new BN(amount.x),
        tx,
        client: this.suiClient,
      }),
      y: await coins.y.take({
        owner: senderAddress,
        amount: new BN(amount.y),
        tx,
        client: this.suiClient,
      }),
    };

    const deadline = getDeadlineAtTimestampMs();

    tx.moveCall({
      target: `${this.configs.flowx.packageId}::${ROUTER}::${ADD_LIQUIDITY}`,
      arguments: [
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.configs.containerObjectId),
        coinToTransfer.x,
        coinToTransfer.y,
        tx.pure.u64(amountMin.x),
        tx.pure.u64(amountMin.y),
        tx.pure.address(senderAddress),
        tx.pure.u64(deadline),
      ],
      typeArguments: [coinType.x, coinType.y],
    });

    return tx;
  }
}
