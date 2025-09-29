import FerraClmmSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  clmmConfig: {
    pools_id: '0x73d72382b41b5c50442722ecab7962fc3ef2bad7e91e59ea26bcba897bcd1826',
    global_config_id: '0x2cd8382c19e6994f16df204e9b8cddd04bdc486c251de75ac66ac4e48e3e7081',
    global_rewarder_vault_id: '0xccb4f7b00aecc72634ca720893020c620fe4c0a4d7a7b0c59ec1329fd8fe3d1a'
  }
}

// mainnet
export const clmmMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  clmm_pool: {
    package_id: '0xc895342d87127c9c67b76c8ad7f9a22b8bfe1dcdc2c5af82bd85266783115e31',
    published_at: '0xc895342d87127c9c67b76c8ad7f9a22b8bfe1dcdc2c5af82bd85266783115e31',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x1dd5538aeb1066315969d87ae9a920ce2692824385342f49854b764ac730a64b',
    published_at: '0x1dd5538aeb1066315969d87ae9a920ce2692824385342f49854b764ac730a64b',
  },
  swapCountUrl: 'https://api.ferra.ag/clmm/swap/pools'
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
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraClmmSDK {
  if (fullNodeUrl) {
    clmmMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraClmmSDK(clmmMainnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
