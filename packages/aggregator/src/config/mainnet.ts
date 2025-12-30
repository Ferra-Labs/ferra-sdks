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
    config: "0x8097eeefaf73fc96d7f745fe840ac82ee6d3b7e86eb4a8574434b2d9524e027e",
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
    package_id: "0x7e4ff5e418c3cc3341caa0844300fcc884c4cf01dd6a3b8b950aa81e35c24365",
    published_at: "0x7e4ff5e418c3cc3341caa0844300fcc884c4cf01dd6a3b8b950aa81e35c24365",
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