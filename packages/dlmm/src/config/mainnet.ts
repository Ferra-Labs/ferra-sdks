import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0xab4744f35407db7b75b97d75396e655f48e6164a18fc6b4de5bf11de38146efc',
    pairs_id: '0x52150371309fb9eacff75029179c1fc945a29e7ac01ec6475ba858bd9a343abe',
    reward_vault: '0xfd6582cc1d9d49272bf1293a36139199e83d5ffea9a15eef64af01752b5254e9',
  }
}

// mainnet
export const dlmmMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dlmm_pool: {
    package_id: '0xff921c4fcf7abd1bff1b2e5fdb1f463e88cb4863a4261948a3cc8bb227ca697e',
    published_at: '0xf65de4e249441c16afe1448b42ff4064e6cb22fe85c9f44223c0bcdc7e9db66f',
    config: SDKConfig.dlmmConfig,
  },
  integrate: {
    package_id: '',
    published_at: '',
  },
  dlmmApiUrl: "https://api.ferra.ag/dlmm/pair/"
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
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraDlmmSDK {
  if (fullNodeUrl) {
    dlmmMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDlmmSDK(dlmmMainnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
