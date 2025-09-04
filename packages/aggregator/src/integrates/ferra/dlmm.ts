import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions"
import { TransactionUtil } from "../../utils/transaction-util"
import { SwapDlmmFerraParams } from "../../interfaces/IAggSwap"
import { AggPairsError, ConfigErrorCode } from "../../errors/errors"
import { SdkOptions } from "../../sdk"


export class FerraDlmmAgg {

    /**
       * Swap from CoinA to CoinB
       * @param params - Swap parameters
       * @returns Transaction object
       */
    public static swap(tx: Transaction, sdk: SdkOptions, params: SwapDlmmFerraParams): [Transaction, TransactionObjectArgument] {
        const { minAmountOut, atob, pairId, coinTypeA, coinTypeB, amountIn } = params

        const ferraDlmmGlobalConfig = sdk.agg_pkg?.config?.Ferra?.dlmm_global_config
        if (!ferraDlmmGlobalConfig) {
            throw new AggPairsError("Ferra DLMM Global config is not set", ConfigErrorCode.InvalidConfig)
        }

        // Build swap transaction
        return TransactionUtil.buildSwapDlmmFerraTransaction(tx, {
            packageId: sdk.agg_pkg.package_id,
            globalConfig: ferraDlmmGlobalConfig,
            pairId,
            coinTypeA,
            coinTypeB,
            amountIn,
            atob,
            minAmountOut
        })
    }

}