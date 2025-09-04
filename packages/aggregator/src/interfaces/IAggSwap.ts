import { TransactionObjectArgument } from "@mysten/sui/transactions"
import { DexOrigins, DexTypes } from "./IQuoter"


export type AggSwapParams = {
    poolId: string
    coinTypeA: string
    coinTypeB: string
    amountIn: TransactionObjectArgument
    atob: boolean
    dexOrigin: DexOrigins
    dexType: DexTypes
    minAmountOut?: bigint
}

export type SwapClmmFerraParams = {
    poolId: string
    coinTypeA: string
    coinTypeB: string
    amountIn: TransactionObjectArgument,
    atob: boolean
}

export type SwapClmmFerraTransParams = {
    packageId: string
    globalConfig: string
    poolId: string
    coinTypeA: string
    coinTypeB: string
    amountIn: TransactionObjectArgument
    atob: boolean
}


export type SwapDlmmFerraParams = SwapClmmFerraParams & {
    pairId: string
    minAmountOut?: bigint
}

export type SwapDlmmFerraTransParams = {
    packageId: string
    globalConfig: string
    pairId: string
    coinTypeA: string
    coinTypeB: string
    amountIn: TransactionObjectArgument
    atob: boolean,
    minAmountOut?: bigint
}
