import FerraAggregatorSDK, { SdkOptions } from '../main'
import { FerraAggregatorV2SDK, SdkV2Options } from '../sdk'
import { AggProvider } from '../types'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x2d1269e1ade81a5189b625ee87c9425bc29249d21d273245269eb07e67dc6965",
      dlmm_global_config: "0x81840b602be475fabb192c9c6e2a56d38cf79b9bcb6f2f4f88a3421cad8dfe25"
    },
  }
}

// beta
export const aggBeta: SdkOptions = {
  fullRpcUrl: 'https://wallet-rpc.mainnet.sui.io',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  agg_pkg: {
    package_id: '0xaf5bf815babb462f6bdfd006edb00f3f53d382cf72901e8b11c1cae426c88cdd',
    published_at: '0xaf5bf815babb462f6bdfd006edb00f3f53d382cf72901e8b11c1cae426c88cdd',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://agg-beta.ferra.ag/agg/quote',
}

const SDKV2Config = {
  aggConfig: {
    config: "0x8097eeefaf73fc96d7f745fe840ac82ee6d3b7e86eb4a8574434b2d9524e027e",
  }
}

export const aggBetaV2: SdkV2Options = {
  providers: {
    cetus: {
      disabled: false
    },
    bluefin7k: {
      disabled: true
    },
    flowx: {
      disabled: true
    },
    bluefin7k_legacy: {
      disabled: true
    }
  },
  slippageBps: 50, // 0.5% slippage
  fullNodeUrl: "https://wallet-rpc.mainnet.sui.io/",
  agg_pkg: {
    package_id: "0x7e4ff5e418c3cc3341caa0844300fcc884c4cf01dd6a3b8b950aa81e35c24365",
    published_at: "0x7e4ff5e418c3cc3341caa0844300fcc884c4cf01dd6a3b8b950aa81e35c24365",
    config: SDKV2Config.aggConfig,
  },
  sender: ""
}

/**
 * Initialize the beta SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 *                           when you use the `preswap` method or other methods that require payment assistance,
 *                           you must configure a simulation account with sufficient balance of input tokens.
 *                           If you connect the wallet, you can set the current wallet address to simulationAccount.
 * @returns
 */
export function initBetaSDK(fullNodeUrl?: string, wallet?: string): FerraAggregatorSDK {
  if (fullNodeUrl) {
    aggBeta.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraAggregatorSDK(aggBeta)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}


export function initBetaAggV2SDK(
  provider: AggProvider = AggProvider.CETUS,
  sender: string,
  sdkOptions?: Partial<SdkV2Options>
): FerraAggregatorV2SDK {

  const _sdkOptions: SdkV2Options = {
    ...aggBetaV2,
    ...sdkOptions && {
      ...(sdkOptions.fullNodeUrl && { fullNodeUrl: sdkOptions.fullNodeUrl }),
      ...(sdkOptions.hermesApi && { hermesApi: sdkOptions.hermesApi }),
      ...(sdkOptions.slippageBps !== undefined && { slippageBps: sdkOptions.slippageBps }),
      ...(sdkOptions.agg_pkg && {
        agg_pkg: {
          ...aggBetaV2.agg_pkg,
          ...sdkOptions.agg_pkg
        }
      }),
    },
    providers: {
      cetus: {
        ...aggBetaV2.providers?.cetus,
        ...sdkOptions?.providers?.cetus,
        disabled: provider !== AggProvider.CETUS
      },
      bluefin7k: {
        ...aggBetaV2.providers?.bluefin7k,
        ...sdkOptions?.providers?.bluefin7k,
        disabled: provider !== AggProvider.BLUEFIN
      },
      flowx: {
        ...aggBetaV2.providers?.flowx,
        ...sdkOptions?.providers?.flowx,
        disabled: provider !== AggProvider.FLOWX
      },
      bluefin7k_legacy: {
        disabled: true
      }
    },
    sender
  }

  return new FerraAggregatorV2SDK(_sdkOptions)
}