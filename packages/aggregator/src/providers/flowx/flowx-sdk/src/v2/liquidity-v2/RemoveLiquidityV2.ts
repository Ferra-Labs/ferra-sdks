import { SuiClient } from '@mysten/sui/dist/cjs/client';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { BN } from 'bn.js';
import { Coin, getDeadlineAtTimestampMs } from '../../core';
import { IBothCoins } from '../../core/interfaces';
import { Base } from '../Base';
import { NETWORK, REMOVE_LIQUIDITY, ROUTER } from '../constants';

export class RemoveLiquidityV2 extends Base {
  constructor(network: NETWORK, suiClient: SuiClient) {
    super(network, suiClient);
  }

  public async buildTransaction(
    pairLpType: string,
    pairLpAmount: string,
    coinType: IBothCoins<string>,
    amount: IBothCoins<string>,
    senderAddress: string,
    slippage: number
  ): Promise<Transaction> {
    const tx = new Transaction();

    const pairLpCoin = new Coin(pairLpType);

    const amountMin = {
      x: this.caculateSlippage(amount.x, slippage),
      y: this.caculateSlippage(amount.y, slippage),
    };

    const coinToTransfer = await pairLpCoin.take({
      owner: senderAddress,
      amount: new BN(pairLpAmount),
      tx,
      client: this.suiClient,
    });

    const deadline = getDeadlineAtTimestampMs();

    tx.moveCall({
      target: `${this.configs.flowx.packageId}::${ROUTER}::${REMOVE_LIQUIDITY}`,
      arguments: [
        tx.object(SUI_CLOCK_OBJECT_ID),
        tx.object(this.configs.containerObjectId),
        coinToTransfer,
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
