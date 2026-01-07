import { BigintIsh, Rounding } from '../constants';
import { Fraction } from './Fraction';

const ONE_HUNDRED = new Fraction(100);

export class Percent extends Fraction {
  /**
   * Converts a fraction to a percent
   * @param fraction the fraction to convert
   */
  public static toPercent(fraction: Fraction): Percent {
    return new Percent(fraction.numerator, fraction.denominator);
  }
  /**
   * This boolean prevents a fraction from being interpreted as a Percent
   */
  public readonly isPercent = true;

  public override add(other: Fraction | BigintIsh): Percent {
    return Percent.toPercent(super.add(other));
  }

  public override subtract(other: Fraction | BigintIsh): Percent {
    return Percent.toPercent(super.subtract(other));
  }

  public override multiply(other: Fraction | BigintIsh): Percent {
    return Percent.toPercent(super.multiply(other));
  }

  public override divide(other: Fraction | BigintIsh): Percent {
    return Percent.toPercent(super.divide(other));
  }

  public override toFixed(
    decimalPlaces = 2,
    format?: object,
    rounding?: Rounding
  ): string {
    return super.multiply(ONE_HUNDRED).toFixed(decimalPlaces, format, rounding);
  }
}
