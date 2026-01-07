import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import invariant from 'tiny-invariant';
import { Coin, Percent } from '../../../core';
import { Protocol } from '../../constants';
import { Swap, SwapConstructorOptions, WrappedRouterConfig } from '../Swap';

export interface IpxTideSwapOptions<CInput extends Coin, COutput extends Coin>
  extends SwapConstructorOptions<CInput, COutput, WrappedRouterConfig> {}

export class IpxTideSwap<
  CInput extends Coin,
  COutput extends Coin
> extends Swap<
  CInput,
  COutput,
  WrappedRouterConfig,
  IpxTideSwapOptions<CInput, COutput>
> {
  constructor(options: IpxTideSwapOptions<CInput, COutput>) {
    super(options);
  }

  public protocol(): Protocol {
    return Protocol.IPX_TIDE;
  }

  public swap =
    (
      routeObject: TransactionResult,
      slippage: Percent,
      pythMap: Record<string, string>
    ) =>
    (tx: Transaction): void => {
      const { wrappedRouterPackageId } = this.protocolConfig;

      const [priceFeedObjectIdX, priceFeedObjectIdY] = [
        this.oracles?.[0]?.priceId
          ? pythMap[this.oracles[0].priceId]
          : undefined,
        this.oracles?.[1]?.priceId
          ? pythMap[this.oracles[1].priceId]
          : undefined,
      ];

      invariant(
        priceFeedObjectIdX && priceFeedObjectIdY,
        'Price feed object IDs must be defined for both coins'
      );

      tx.moveCall({
        target: `${wrappedRouterPackageId}::swap_router::swap_exact`,
        typeArguments: [this.input.coinType, this.output.coinType],
        arguments: [
          routeObject,
          tx.object(this.pool.id),
          tx.object(priceFeedObjectIdX),
          tx.object(priceFeedObjectIdY),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
    };
}
