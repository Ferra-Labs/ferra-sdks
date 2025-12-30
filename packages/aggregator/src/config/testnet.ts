import FerraAggregatorSDK, { SdkOptions } from '../main'
import { FerraAggregatorV2SDK, SdkV2Options } from '../sdk'
import { AggProvider } from '../types'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  aggConfig: {
    Ferra: {
      clmm_global_config: "0x0f21705a8a674ce564b8e320c7bfccae236b763370786d504f7631af6425ff62",
      dlmm_global_config: "0x3ae130485253c7cefc9e328275f03b5ee516bc5a6246b6ef4f9dcff126144fb1"
    },
  }
}

// testnet
export const aggTestnet: SdkOptions = {
  fullRpcUrl: 'https://wallet-rpc.mainnet.sui.io',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  agg_pkg: {
    package_id: '0xaa71601f6306104290d75002dc3da41e0daf972cc18f66557a8a5bba7e89a261',
    published_at: '0xaa71601f6306104290d75002dc3da41e0daf972cc18f66557a8a5bba7e89a261',
    config: SDKConfig.aggConfig,
  },
  quoterUrl: 'https://api-dev.ferra.ag/agg/quote',
}

const SDKV2Config = {
  aggConfig: {
    config: "0x8097eeefaf73fc96d7f745fe840ac82ee6d3b7e86eb4a8574434b2d9524e027e",
  }
}

export const aggTestnetV2: SdkV2Options = {
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
 * Initialize the testnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 *                           when you use the `preswap` method or other methods that require payment assistance,
 *                           you must configure a simulation account with sufficient balance of input tokens.
 *                           If you connect the wallet, you can set the current wallet address to simulationAccount.
 * @returns
 */
export function initTestnetSDK(fullNodeUrl?: string, wallet?: string): FerraAggregatorSDK {
  if (fullNodeUrl) {
    aggTestnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraAggregatorSDK(aggTestnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}


export function initTestnetAggV2SDK(
  provider: AggProvider = AggProvider.CETUS,
  sender: string,
  sdkOptions?: Partial<SdkV2Options>
): FerraAggregatorV2SDK {

  const _sdkOptions: SdkV2Options = {
    ...aggTestnetV2,
    ...sdkOptions && {
      ...(sdkOptions.fullNodeUrl && { fullNodeUrl: sdkOptions.fullNodeUrl }),
      ...(sdkOptions.hermesApi && { hermesApi: sdkOptions.hermesApi }),
      ...(sdkOptions.slippageBps !== undefined && { slippageBps: sdkOptions.slippageBps }),
      ...(sdkOptions.agg_pkg && {
        agg_pkg: {
          ...aggTestnetV2.agg_pkg,
          ...sdkOptions.agg_pkg
        }
      }),
    },
    providers: {
      cetus: {
        ...aggTestnetV2.providers?.cetus,
        ...sdkOptions?.providers?.cetus,
        disabled: provider !== AggProvider.CETUS
      },
      bluefin7k: {
        ...aggTestnetV2.providers?.bluefin7k,
        ...sdkOptions?.providers?.bluefin7k,
        disabled: provider !== AggProvider.BLUEFIN
      },
      flowx: {
        ...aggTestnetV2.providers?.flowx,
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