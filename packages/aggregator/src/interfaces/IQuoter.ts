export enum DexOrigins {
    Ferra = "Ferra",
    Cetus = "Cetus",
    Turbos = "Turbos",
    Navi = "Navi",
    SuiSwap = "SuiSwap",
}

export enum DexTypes {
    AMM = "AMM",
    DAMM = "DAMM",
    DAMM2 = "DAMM2",
    CLMM = "CLMM",
    DLMM = "DLMM"
}

export type InputFindBestQuotesParams = {
    from: string,
    to: string,
    amount: string,
    slippageTolerance?: number
}

export type SwapStep = {
    direction: boolean  //a to b or b to a
    type: DexTypes
    origin: DexOrigins
    poolAddress: string
    coinIn: string
    coinOut: string
    feeRate: number
    amountIn: string
    amountOut: string
    currentSqrtPrice: string
    decimalsIn: number
    decimalsOut: number
    currentPrice: string
}

// Split path configuration for multi-path routing
export type TradingRoute = {
    percent: string
    inputAmount: string
    outputAmount: string
    outputAmountMin?: string
    pathIndex: number
    lastQuoteOutput: string
    swapStep: SwapStep[]
}