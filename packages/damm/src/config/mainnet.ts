import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dammConfig: {
    pools_id: '0xf7774e82131b6c581987000046826d1b902c7acba2887d26cc2bccfeff1ace01',
    global_config_id: '0x872637215dbee83854692ac83237a34eaae8ef784d43548fc80ac6c7b5c8fdd1',
    global_rewarder_vault_id: '0xafe43ac8ba302f77f9d9ba46ec1a1d43e748a474b7616a99242ee49ca31adfd5'
  }
}

// mainnet
export const dammMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  damm_pool: {
    package_id: '0x9c81b37498c1a49e18993b358fdf715154e36663f99147ef98b7a0c8bfbc9d4e',
    published_at: '0x9c81b37498c1a49e18993b358fdf715154e36663f99147ef98b7a0c8bfbc9d4e',
    config: SDKConfig.dammConfig,
  },
  integrate: {
    package_id: '0x37e8a1abf987431fa2c732808a45d3f4d307cd5ced734b920244540fd8be3a3e',
    published_at: '0x37e8a1abf987431fa2c732808a45d3f4d307cd5ced734b920244540fd8be3a3e',
  },
  swapCountUrl: 'https://api.ferra.xyz/damm/swap/pools'
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
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraDammSDK {
  if (fullNodeUrl) {
    dammMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDammSDK(dammMainnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
