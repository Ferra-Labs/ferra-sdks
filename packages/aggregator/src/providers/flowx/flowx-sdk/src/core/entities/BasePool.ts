import invariant from 'tiny-invariant';
import { BigintIsh } from '../constants';
import { Coin } from './Coin';
import { ObjectId } from './ObjectId';

export abstract class BasePool extends ObjectId {
  public readonly coins!: Coin[];
  public readonly reserves!: BigintIsh[];

  constructor(objectId: string, coins: Coin[], reserves: BigintIsh[]) {
    invariant(coins.length > 0 && coins.length === reserves.length, 'LENGTH');

    super(objectId);
    this.coins = coins;
    this.reserves = reserves;
  }

  public involvesCoin(coin: Coin): boolean {
    return this.coins.some((it) => it.coinType === coin.coinType);
  }
}
