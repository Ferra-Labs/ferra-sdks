import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dammConfig: {
    pools_id: '0x707ca2bee32fa27a27541831144f330dce20969258c92ac8c39f48c6682bd6eb',
    global_config_id: '0x9e13acd1ba33e83a5097ecb1a43c9d267af7bc4d281614f4fafd2a973bbc993a',
    global_rewarder_vault_id: '0x98118e92f85aecb83e36f738ee5cb906b2b6f2fb201c03fb7d898640247634c4'
  }
}

// mainnet
export const dammMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  damm_pool: {
    package_id: '0x6615ce71ab4f4a9119cc612c04a9daf77206e23201ec5efedd6bf873b2a16fd2',
    published_at: '0x6615ce71ab4f4a9119cc612c04a9daf77206e23201ec5efedd6bf873b2a16fd2',
    config: SDKConfig.dammConfig,
  },
  integrate: {
    package_id: '0x1b6fe2c87cde17447fb09ea9af03f52f367118f3e3c17a108ff2d3c699b806bd',
    published_at: '0x1b6fe2c87cde17447fb09ea9af03f52f367118f3e3c17a108ff2d3c699b806bd',
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
