import invariant from 'tiny-invariant';
import { BN } from 'bn.js';

import { Fraction } from './Fraction';
import { Coin } from './Coin';
import { BigintIsh, Rounding } from '../constants';

export class Price<CBase extends Coin, CQuote extends Coin> extends Fraction {
  public readonly baseCoin: CBase; // input i.e. denominator
  public readonly quoteCoin: CQuote; // output i.e. numerator
  public readonly scalar: Fraction; // used to adjust the raw fraction w/r/t the decimals of the {base,quote}Token

  /**
   * Construct a price, either with the base and quote currency amount, or the
   * @param args
   */
  public constructor(...args: [CBase, CQuote, BigintIsh, BigintIsh]) {
    const [baseCoin, quoteCoin, denominator, numerator] = args;
    super(numerator, denominator);

    this.baseCoin = baseCoin;
    this.quoteCoin = quoteCoin;
    this.scalar = new Fraction(
      new BN(10).pow(new BN(baseCoin.decimals)),
      new BN(10).pow(new BN(quoteCoin.decimals))
    );
  }

  /**
   * Flip the price, switching the base and quote currency
   */
  public override invert(): Price<CQuote, CBase> {
    return new Price(
      this.quoteCoin,
      this.baseCoin,
      this.numerator,
      this.denominator
    );
  }

  /**
   * Multiply the price by another price, returning a new price. The other price must have the same base currency as this price's quote currency
   * @param other the other price
   */
  public override multiply(other: Price<CBase, CQuote>): Price<CBase, CQuote> {
    invariant(this.quoteCoin.equals(other.baseCoin), 'COIN');
    const fraction = super.multiply(other);
    return new Price(
      this.baseCoin,
      other.quoteCoin,
      fraction.denominator,
      fraction.numerator
    );
  }

  /**
   * Return the amount of quote currency corresponding to a given amount of the base currency
   * @param coinAmount the amount of base currency to quote against the price
   */
  public quote(coinAmount: BigintIsh): Fraction {
    const result = super.multiply(coinAmount);
    return new Fraction(result.numerator, result.denominator);
  }

  /**
   * Get the value scaled by decimals for formatting
   * @private
   */
  private get adjustedForDecimals(): Fraction {
    return super.multiply(this.scalar);
  }

  public override toFixed(
    decimalPlaces = 4,
    format?: object,
    rounding?: Rounding
  ): string {
    return this.adjustedForDecimals.toFixed(decimalPlaces, format, rounding);
  }
}
