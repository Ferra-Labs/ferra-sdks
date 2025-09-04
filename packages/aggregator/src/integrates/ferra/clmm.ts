import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions"
import { TransactionUtil } from "../../utils/transaction-util"
import { SwapClmmFerraParams } from "../../interfaces/IAggSwap"
import { AggPairsError, ConfigErrorCode } from "../../errors/errors"
import { SdkOptions } from "../../sdk"


export class FerraClmmAgg {

    /**
       * Swap from CoinA to CoinB
       * @param params - Swap parameters
       * @returns Transaction object
       */
    public static swap(tx: Transaction, sdk: SdkOptions, params: SwapClmmFerraParams): [Transaction, TransactionObjectArgument] {
        const { atob, poolId, coinTypeA, coinTypeB, amountIn } = params

        const ferraClmmGlobalConfig = sdk.agg_pkg?.config?.Ferra?.clmm_global_config
        if (!ferraClmmGlobalConfig) {
            throw new AggPairsError("Ferra CLMM Global config is not set", ConfigErrorCode.InvalidConfig)
        }

        // Build swap transaction
        return TransactionUtil.buildSwapClmmFerraTransaction(tx, {
            packageId: sdk.agg_pkg.package_id,
            globalConfig: ferraClmmGlobalConfig,
            poolId,
            coinTypeA,
            coinTypeB,
            amountIn,
            atob
        })
    }

}