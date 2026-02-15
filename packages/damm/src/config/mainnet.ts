import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dammConfig: {
    pools_id: '0x16b4ec2ead4377b11fe56479b19809885198d0cb3422d2e1048a160c8f9ba1e5',
    global_config_id: '0x3bf945ddf84971e57497ee5e733d77984f540db6b07b6fdb00568ce2d4b0f517',
    global_rewarder_vault_id: '0x8c4946886cd31a6d213b235e245ba2a8e39d2877993ee493f6a4ede060f68d12'
  }
}

// mainnet
export const dammMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  damm_pool: {
    package_id: '0x66fb6a132c415278c32ab52ecdc2bd73b08b649e396841f48f6f9cccd01b6bbb',
    published_at: '0x5810a6545d6046d98eee8867ed1106ab5fc472f36feda8acdd3f0a331968cef8',
    config: SDKConfig.dammConfig,
  },
  integrate: {
    package_id: '0x8df3a90c236e6555bc5edc9c11165dbddf456814f8c670d03e729f92367ce473',
    published_at: '0x8df3a90c236e6555bc5edc9c11165dbddf456814f8c670d03e729f92367ce473',
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
