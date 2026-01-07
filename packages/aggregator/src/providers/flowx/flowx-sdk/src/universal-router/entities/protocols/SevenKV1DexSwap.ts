import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import {
  normalizeStructTag,
  parseStructTag,
  SUI_CLOCK_OBJECT_ID,
} from '@mysten/sui/utils';

import { Coin, Percent } from '../../../core';
import { Swap, SwapConstructorOptions, WrappedRouterConfig } from '../Swap';
import { Protocol } from '../../constants';
import { OracleInfo } from '../../types';
import invariant from 'tiny-invariant';

export interface SevenKV1DexProtocolConfig extends WrappedRouterConfig {
  oraclePackageId: string;
}

export interface SevenKV1DexSwapOptions<
  CInput extends Coin,
  COutput extends Coin
> extends SwapConstructorOptions<CInput, COutput, SevenKV1DexProtocolConfig> {
  xForY: boolean;
  oracles: OracleInfo[];
  poolStructTag: string;
}

export class SevenKV1DexSwap<
  CInput extends Coin,
  COutput extends Coin
> extends Swap<
  CInput,
  COutput,
  SevenKV1DexProtocolConfig,
  SevenKV1DexSwapOptions<CInput, COutput>
> {
  public readonly xForY!: boolean;
  public readonly poolStructTag!: string;

  constructor(options: SevenKV1DexSwapOptions<CInput, COutput>) {
    super(options);
    this.xForY = options.xForY;
    this.poolStructTag = options.poolStructTag;
  }

  public protocol(): Protocol {
    return Protocol.SEVENK_V1;
  }
  public swap =
    (
      routeObject: TransactionResult,
      _: Percent,
      pythMap: Record<string, string>
    ) =>
    (tx: Transaction): void => {
      const { wrappedRouterPackageId, oraclePackageId } = this.protocolConfig;

      const oracleHolder = tx.moveCall({
        target: `${oraclePackageId}::oracle::new_holder`,
      });

      const [oracleInfoX, oracleInfoY] = this.oracles || [];
      invariant(
        oracleInfoX && oracleInfoX.oracleId && oracleInfoX.priceId,
        'Oracle info for X is required'
      );
      invariant(
        oracleInfoY && oracleInfoY.oracleId && oracleInfoY.priceId,
        'Oracle info for Y is required'
      );

      const [priceObjectIdX, priceObjectIdY] = [
        pythMap[oracleInfoX?.priceId],
        pythMap[oracleInfoY?.priceId],
      ];
      invariant(
        priceObjectIdX,
        `Price object for ${oracleInfoX.priceId} is required`
      );
      invariant(
        priceObjectIdY,
        `Price object for ${oracleInfoY.priceId} is required`
      );

      tx.moveCall({
        target: `${oraclePackageId}::pyth::get_price`,
        arguments: [
          tx.object(oracleInfoX.oracleId),
          oracleHolder,
          tx.object(priceObjectIdX),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
      tx.moveCall({
        target: `${oraclePackageId}::pyth::get_price`,
        arguments: [
          tx.object(oracleInfoY.oracleId),
          oracleHolder,
          tx.object(priceObjectIdY),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });

      const poolTypeArgs = parseStructTag(this.poolStructTag).typeParams.map(
        normalizeStructTag
      );
      tx.moveCall({
        target: `${wrappedRouterPackageId}::swap_router::${
          this.xForY ? 'swap_exact_x_to_y' : 'swap_exact_y_to_x'
        }`,
        typeArguments: poolTypeArgs,
        arguments: [routeObject, tx.object(this.pool.id), oracleHolder],
      });
    };
}
