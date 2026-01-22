import { Transaction, TransactionObjectArgument } from "@mysten/sui/dist/cjs/transactions";
import { SwapBluefin7kInput, SwapCetusInput, SwapFlowXInput } from "../interfaces/IAggSwapV2";
import { CetusSwapBuilder } from "../providers/cetus/swap-builder.cetus";
import { FlowXSwapBuilder } from "../providers/flowx/swap-builder.flowx";
import { FerraAggregatorV2SDK } from "../sdk";
import { Bluefin7kSwapBuilder } from "../providers/bluefin/swap-builder.bluefin";

export class TxBuilder {
    private _cetusBuilder: CetusSwapBuilder;
    private _flowxBuilder: FlowXSwapBuilder;
    private _bluefin7kBuilder: Bluefin7kSwapBuilder;

    constructor(sdk: FerraAggregatorV2SDK) {
        const ferraPackageId = sdk?.sdkOptions?.agg_pkg?.published_at ?? "";
        const ferraConfigId = sdk?.sdkOptions?.agg_pkg?.config?.config ?? "";

        this._cetusBuilder = new CetusSwapBuilder({
            suiClient: sdk.fullClient,
            signer: sdk.senderAddress,
            ferraPackageId,
            ferraConfigId,
        });

        this._flowxBuilder = new FlowXSwapBuilder({
            suiClient: sdk.fullClient,
            signer: sdk.senderAddress,
            ferraPackageId,
            ferraConfigId,
        });

        this._bluefin7kBuilder = new Bluefin7kSwapBuilder({
            suiClient: sdk.fullClient,
            ferraPackageId,
            ferraConfigId,
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
        });
    }

    async swapOnFlowX(params: SwapFlowXInput): Promise<Transaction> {
        const { fromType, targetType, coinIn, quote, slippageBps, tx, sender } = params;

        return await this._flowxBuilder.buildSwapWithRoute({
            tx,
            sender,
            fromType,
            targetType,
            coinIn,
            routeData: quote,
            slippageBps,
        });
    }

    async swapOnBluefin7k(params: SwapBluefin7kInput): Promise<Transaction> {
        const { fromType, targetType, coinIn, quote, slippageBps, tx, sender } = params;

        return await this._bluefin7kBuilder.buildSwapWithRoute({
            tx,
            sender,
            fromType,
            targetType,
            coinIn,
            routeData: quote,
            slippageBps,
        });
    }
}