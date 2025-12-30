import { MetaQuote } from "@7kprotocol/sdk-ts";
import { RouterDataV3 } from "@cetusprotocol/aggregator-sdk";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/dist/cjs/transactions";


export type SwapV2Params = {
    quote: MetaQuote;
    fromType: string;
    targetType: string;
    amountIn: string;
    amountOut: string;
}

export type SwapCetusInput = {
    fromType: string,
    targetType: string,
    coinIn: TransactionObjectArgument,
    amountOut: string,
    quote: RouterDataV3,
    slippageBps: number,
    tx: Transaction,
    sender: string
}
