import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0xdb7afb30c1b7a5652f3cccee1eecb2cfdb2a2d91bdc3d72598b3ad852304d9bc',
    pairs_id: '0x37dc7c1adb91d76a1a108adeef6e17938e3555216a5c2d65db336b5218882399',
    reward_vault: '0x63cff969e8d8a6cc1f51e7d3a8d27ecd60b45521c85f25187f0a475aba97f83f',
  }
}

// mainnet
export const dlmmMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dlmm_pool: {
    package_id: '0x0808f9627fe1e4e839875c91b2c484e12f5d674281d25c94546a79480255106c',
    published_at: '0x0808f9627fe1e4e839875c91b2c484e12f5d674281d25c94546a79480255106c',
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
