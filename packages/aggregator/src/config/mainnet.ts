import FerraAggregatorSDK, { SdkOptions } from '../main'
import { FerraAggregatorV2SDK, SdkV2Options } from '../sdk'
import { AggProvider } from '../types'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x2cd8382c19e6994f16df204e9b8cddd04bdc486c251de75ac66ac4e48e3e7081",
      dlmm_global_config: "0x5c9dacf5a678ea15b8569d65960330307e23d429289ca380e665b1aa175ebeca"
    },
  }
}


// mainnet
export const aggMainnet: SdkOptions = {
  fullRpcUrl: 'https://wallet-rpc.mainnet.sui.io',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  agg_pkg: {
    package_id: '0x09c6c8b7ebf4c46d8bc9189168d944da5fcb6823bcfd739af71e128550c57292',
    published_at: '0x09c6c8b7ebf4c46d8bc9189168d944da5fcb6823bcfd739af71e128550c57292',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://api.ferra.ag/agg/quote',
}

const SDKV2Config = {
  aggConfig: {
    config: "0x856305e41f85e28e6745778cf40e4f5b8cfb3ca635a28b8cf71cb3c054c8a07d",
  }
}

export const aggMainnetV2: SdkV2Options = {
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
    package_id: "0xf5b13fa4687e6a60c24fed34d0f5e74d2af16ec8daf0a005eac23117a143d56c",
    published_at: "0xf5b13fa4687e6a60c24fed34d0f5e74d2af16ec8daf0a005eac23117a143d56c",
    config: SDKV2Config.aggConfig,
  },
  sender: ""
}


/**
 * Initialize the mainnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 *                           when you use the `preswap` method or other methods that require payment assistance,
 *                           you must configure a simulation account with sufficient balance of input tokens.
 *                           If you connect the wallet, you can set the current wallet address to simulationAccount.
 * @returns
 */
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraAggregatorSDK {
  if (fullNodeUrl) {
    aggMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraAggregatorSDK(aggMainnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}


export function initMainnetAggV2SDK(
  provider: AggProvider = AggProvider.CETUS,
  sender: string,
  sdkOptions?: Partial<SdkV2Options>
): FerraAggregatorV2SDK {

  const _sdkOptions: SdkV2Options = {
    ...aggMainnetV2,
    ...sdkOptions && {
      ...(sdkOptions.fullNodeUrl && { fullNodeUrl: sdkOptions.fullNodeUrl }),
      ...(sdkOptions.hermesApi && { hermesApi: sdkOptions.hermesApi }),
      ...(sdkOptions.slippageBps !== undefined && { slippageBps: sdkOptions.slippageBps }),
      ...(sdkOptions.agg_pkg && {
        agg_pkg: {
          ...aggMainnetV2.agg_pkg,
          ...sdkOptions.agg_pkg
        }
      }),
    },
    providers: {
      cetus: {
        ...aggMainnetV2.providers?.cetus,
        ...sdkOptions?.providers?.cetus,
        disabled: provider !== AggProvider.CETUS
      },
      bluefin7k: {
        ...aggMainnetV2.providers?.bluefin7k,
        ...sdkOptions?.providers?.bluefin7k,
        disabled: provider !== AggProvider.BLUEFIN
      },
      flowx: {
        ...aggMainnetV2.providers?.flowx,
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