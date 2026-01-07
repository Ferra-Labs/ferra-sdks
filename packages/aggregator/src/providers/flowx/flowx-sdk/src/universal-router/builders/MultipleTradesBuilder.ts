import { BN } from 'bn.js';
import { isValidSuiAddress } from '@mysten/sui/utils';

import { Coin, NETWORK, ZERO, sumBn } from '../../core';
import { Commission } from '../entities/Commission';
import { Route } from '../entities/Route';
import invariant from 'tiny-invariant';
import { Trade } from '../entities/Trade';
import { BPS } from '../constants';
import { MultipleTrades } from '../entities/MultipleTrades';

export class MultiTradesBuilder<CInput extends Coin, COutput extends Coin> {
  private _network!: NETWORK;
  private _sender: string | undefined;
  private _recipient: string | undefined;
  private _slippage: number;
  private _deadline: number = Number.MAX_SAFE_INTEGER;
  private _commissions: Commission[] = [];
  private _routeGroups: Route<CInput, COutput>[][] = [];

  public static fromRoutesGroups<CInput extends Coin, COutput extends Coin>(
    routeGroups: Route<CInput, COutput>[][]
  ): MultiTradesBuilder<CInput, COutput> {
    return new MultiTradesBuilder(routeGroups[0][0]?.network, routeGroups);
  }

  constructor(network: NETWORK, routeGroups: Route<CInput, COutput>[][]) {
    invariant(routeGroups.length > 0, 'ROUTES_REQUIRED');
    this._network = network;
    this._routeGroups = routeGroups;

    for (const routes of routeGroups) {
      invariant(
        routes.length > 0 &&
          routes
            .slice(1)
            .every(
              (route) =>
                route.input.equals(routes[0].input) &&
                route.output.equals(routes[0].output)
            ),
        'INVALID_ROUTE_GROUP'
      );
    }
  }

  public sender(sender: string): MultiTradesBuilder<CInput, COutput> {
    this._sender = sender;
    return this;
  }

  public recipient(recipient: string): MultiTradesBuilder<CInput, COutput> {
    this._recipient = recipient;
    return this;
  }

  public slippage(slippage: number): MultiTradesBuilder<CInput, COutput> {
    this._slippage = slippage;
    return this;
  }

  public deadline(deadline: number): MultiTradesBuilder<CInput, COutput> {
    this._deadline = deadline;
    return this;
  }

  public commissions(
    commissions: Commission[]
  ): MultiTradesBuilder<CInput, COutput> {
    this._commissions = commissions;
    return this;
  }

  public build(): MultipleTrades<CInput, COutput> {
    invariant(
      (!this._sender || isValidSuiAddress(this._sender)) &&
        (!this._recipient || isValidSuiAddress(this._recipient)),
      'ADDRESSEES'
    );

    const trades: Trade<CInput, COutput>[] = [];

    this._routeGroups.map((routes, index) => {
      const amountIn = sumBn(routes.map((r) => new BN(r.amountIn)));
      const amountOut = sumBn(routes.map((r) => new BN(r.amountOut)));

      const commission = this._commissions?.[index];

      invariant(new BN(amountIn).gt(ZERO), 'AMOUNT_IN');
      invariant(new BN(amountOut).gt(ZERO), 'AMOUNT_OUT');
      invariant(new BN(this._slippage).lte(BPS), 'SLIPPAGE');

      if (commission) {
        invariant(
          routes[0].input.equals(commission.coin) ||
            routes[0].output.equals(commission.coin),
          'INVALID_COMMISSION'
        );
      }

      const totalAmountIn = new BN(amountIn).add(
        commission?.coin.equals(routes[0].input)
          ? commission.computeCommissionAmount(amountIn, {
              coinIn: routes[0].input,
              coinOut: routes[0].output,
            })
          : ZERO
      );

      trades.push(
        new Trade({
          network: this._network,
          sender: this._sender,
          recipient: this._recipient,
          amountIn: totalAmountIn,
          amountOut,
          slippage: this._slippage,
          deadline: this._deadline,
          routes,
          commission,
        })
      );
    });

    return new MultipleTrades(trades);
  }
}
