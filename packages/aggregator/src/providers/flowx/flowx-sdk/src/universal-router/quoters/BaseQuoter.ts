import { BigintIsh, Coin, NETWORK } from '../../core';
import { Route } from '../entities/Route';

export interface BaseQuoterQueryParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}

export interface GetRoutesResult<CInput extends Coin, COutput extends Coin> {
  coinIn: CInput;
  coinOut: COutput;
  amountIn: BigintIsh;
  amountOut: BigintIsh;
  routes: Route<CInput, COutput>[];
}

export abstract class BaseQuoter<
  CInput extends Coin,
  COutput extends Coin,
  QuoterQueryParams
> {
  public readonly network!: NETWORK;

  constructor(network: NETWORK) {
    this.network = network;
  }

  abstract getRoutes(
    params: QuoterQueryParams
  ): Promise<GetRoutesResult<CInput, COutput>>;
}
