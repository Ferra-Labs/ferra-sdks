export enum MathErrorCode {
  IntegerDowncastOverflow = `IntegerDowncastOverflow`,
  MulOverflow = `MultiplicationOverflow`,
  MulDivOverflow = `MulDivOverflow`,
  MulShiftRightOverflow = `MulShiftRightOverflow`,
  MulShiftLeftOverflow = `MulShiftLeftOverflow`,
  DivideByZero = `DivideByZero`,
  UnsignedIntegerOverflow = `UnsignedIntegerOverflow`,
  InvalidCoinAmount = `InvalidCoinAmount`,
  InvalidLiquidityAmount = `InvalidLiquidityAmount`,
  InvalidReserveAmount = `InvalidReserveAmount`,
  InvalidSqrtPrice = `InvalidSqrtPrice`,
  NotSupportedThisCoin = `NotSupportedThisCoin`,
  InvalidTwoTickIndex = `InvalidTwoTickIndex`,
}

export enum CoinErrorCode {
  CoinAmountMaxExceeded = `CoinAmountMaxExceeded`,
  CoinAmountMinSubceeded = `CoinAmountMinSubceeded `,
  SqrtPriceOutOfBounds = `SqrtPriceOutOfBounds`,
}

export enum SwapErrorCode {
  InvalidSqrtPriceLimitDirection = `InvalidSqrtPriceLimitDirection`,
  ZeroTradableAmount = `ZeroTradableAmount`,
  AmountOutBelowMinimum = `AmountOutBelowMinimum`,
  AmountInAboveMaximum = `AmountInAboveMaximum`,
  NextTickNotFound = `NextTickNoutFound`,
  TickArraySequenceInvalid = `TickArraySequenceInvalid`,
  TickArrayCrossingAboveMax = `TickArrayCrossingAboveMax`,
  TickArrayIndexNotInitialized = `TickArrayIndexNotInitialized`,
  ParamsLengthNotEqual = `ParamsLengthNotEqual`,
}

export enum PositionErrorCode {
  InvalidTickEvent = `InvalidTickEvent`,
  InvalidPositionObject = `InvalidPositionObject`,
  InvalidPositionRewardObject = `InvalidPositionRewardObject`,
}


export enum PartnerErrorCode {
  NotFoundPartnerObject = `NotFoundPartnerObject`,
  InvalidParnterRefFeeFields = `InvalidParnterRefFeeFields`,
}

export enum ConfigErrorCode {
  InvalidConfig = `InvalidConfig`,
  InvalidConfigHandle = `InvalidConfigHandle`,
  InvalidSimulateAccount = `InvalidSimulateAccount`,
}

export enum UtilsErrorCode {
  InvalidSendAddress = `InvalidSendAddress`,
  InvalidRecipientAddress = `InvalidRecipientAddress`,
  InvalidRecipientAndAmountLength = `InvalidRecipientAndAmountLength`,
  InsufficientBalance = `InsufficientBalance`,
  InvalidTarget = `InvalidTarget`,
  InvalidTransactionBuilder = `InvalidTransactionBuilder`,
}

export enum RouterErrorCode {
  InvalidCoin = `InvalidCoin`,
  NotFoundPath = `NotFoundPath`,
  NoDowngradeNeedParams = `NoDowngradeNeedParams`,
  InvalidQuoteUrl = `InvalidQuoteUrl`,
  InvalidTransactionBuilder = `InvalidTransactionBuilder`,
  InvalidServerResponse = `InvalidServerResponse`,
}

export enum TypesErrorCode {
  InvalidType = `InvalidType`,
}

export type AggPairsErrorCode =
  | MathErrorCode
  | SwapErrorCode
  | CoinErrorCode
  | PositionErrorCode
  | PartnerErrorCode
  | ConfigErrorCode
  | UtilsErrorCode
  | RouterErrorCode
  | TypesErrorCode

export class AggPairsError extends Error {
  override message: string

  errorCode?: AggPairsErrorCode

  constructor(message: string, errorCode?: AggPairsErrorCode) {
    super(message)
    this.message = message
    this.errorCode = errorCode
  }

  static isClmmpoolsErrorCode(e: any, code: AggPairsErrorCode): boolean {
    return e instanceof AggPairsError && e.errorCode === code
  }
}
