export enum DcaErrorCode {
  InvalidWalletAddress = `InvalidWalletAddress`,
  InvalidOrderId = `InvalidOrderId`,
  InvalidMode = `InvalidMode`,
  BuildError = 'BuildError',
  FetchError = 'FetchError',
  InvalidType = 'InvalidType',
  InvalidRecipientAndAmountLength = 'InvalidRecipientAndAmountLength',
  InvalidRecipientAddress = 'InvalidRecipientAddress',
}

export const DETAILS_KEYS = {
  REQUEST_PARAMS: 'requestParams',
  METHOD_NAME: 'methodName',
}

export class DcaError extends Error {
  override message: string

  errorCode?: DcaErrorCode

  constructor(message: string, errorCode?: DcaErrorCode, private details?: Record<string, any>) {
    super(message)
    this.message = message
    this.errorCode = errorCode
  }

  static isDcaErrorCode(e: any, code: DcaErrorCode): boolean {
    return e instanceof DcaError && e.errorCode === code
  }
}

export const handleError = (code: DcaErrorCode, error: Error | string, details?: Record<string, any>) => {
  if (error instanceof Error) {
    throw new DcaError(error.message, code, details)
  } else {
    throw new DcaError(error, code, details)
  }
}
