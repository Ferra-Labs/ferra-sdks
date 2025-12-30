import { Transaction, TransactionObjectArgument } from "@mysten/sui/dist/cjs/transactions";
import { SwapCetusInput } from "../interfaces/IAggSwapV2";
import { CetusSwapBuilder } from "../providers/cetus/swap-builder.cetus";
import { FerraAggregatorV2SDK } from "../sdk";

export class TxBuilder {
    private _cetusBuilder: CetusSwapBuilder;

    constructor(sdk: FerraAggregatorV2SDK) {
        this._cetusBuilder = new CetusSwapBuilder({
            suiClient: sdk.fullClient,
            signer: sdk.senderAddress,
            ferraPackageId: sdk?.sdkOptions?.agg_pkg?.published_at ?? "",
            ferraConfigId: sdk?.sdkOptions?.agg_pkg?.config?.config ?? "",
        });
    }

    async swapOnCetus(params: SwapCetusInput): Promise<Transaction> {
        const { fromType, targetType, coinIn, quote, slippageBps, tx, sender } = params;

        return await this._cetusBuilder.buildSwapWithRoute({
            tx,
            sender,
            fromType,
            targetType,
            coinIn,
            routerData: quote,
            slippageBps,
        })
    }
}