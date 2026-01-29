export enum LimitErrorCode {
  DynamicFieldNotFound = 'DynamicFieldNotFound',
  LimitOrderListNotFound = 'LimitOrderListNotFound',
  LimitOrderNotFound = 'LimitOrderNotFound',
  LimitOrderIdInValid = 'LimitOrderIdInValid',
  BuildError = 'BuildError',
  FetchError = 'FetchError',
  InvalidType = 'InvalidType',
}

export const DETAILS_KEYS = {
  REQUEST_PARAMS: 'requestParams',
  METHOD_NAME: 'methodName',
}

export class LimitError extends Error {
  override message: string

  errorCode?: LimitErrorCode

  constructor(message: string, errorCode?: LimitErrorCode, private details?: Record<string, any>) {
    super(message)
    this.message = message
    this.errorCode = errorCode
  }

  static isDcaErrorCode(e: any, code: LimitErrorCode): boolean {
    return e instanceof LimitError && e.errorCode === code
  }
}

export const handleError = (code: LimitErrorCode, error: Error | string, details?: Record<string, any>) => {
  if (error instanceof Error) {
    throw new LimitError(error.message, code, details)
  } else {
    throw new LimitError(error, code, details)
  }
}
