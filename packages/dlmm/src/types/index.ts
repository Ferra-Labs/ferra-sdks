import { Decimal } from 'decimal.js'

export type BigNumber = Decimal.Value | number | string

export * from './basic-type.js'
export * from './sui.js'
export * from './token-type.js'
export * from './dlmm-type.js'
