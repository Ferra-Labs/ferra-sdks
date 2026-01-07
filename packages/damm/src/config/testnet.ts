import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dammConfig: {
    global_config: '0x51ea54b4257f8d187cd79e9c874fbbac9d0489cb6b391a54dcc29bbd864b3438',
    pairs_id: '0x2909eb51cba8bd35618875d7a4a388a9d33e6a4d87bfa0a72b2808d5af5c192a',
    reward_vault: '0xe02e84bf822aeff1bcb076796df797d74c8caf3e29612d3d8056ac71f7ed9264',
  }
}

// https://suivision.xyz/txblock/5tdiGxMn6LbxQdXSvc61LDWcT1ZLw5bpYtZMkisqqhTm?tab=Changes
// beta
export const dammTestnet: SdkOptions = {
  fullRpcUrl: 'https://wallet-rpc.mainnet.sui.io',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  damm_pool: {
    package_id: '0xd3a348222bbded76737cbefd2416ad151688c7bf9a3425e7f746b519585ab9e8',
    published_at: '0xd3a348222bbded76737cbefd2416ad151688c7bf9a3425e7f746b519585ab9e8',
    config: SDKConfig.dammConfig,
  },
  integrate: {
    package_id: '',
    published_at: '',
  },
  dammApiUrl: "https://api-dev.ferra.xyz/damm/pair/"
}

/**
 * Initialize the testnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initTestnetSDK(fullNodeUrl?: string, wallet?: string): FerraDammSDK {
  if (fullNodeUrl) {
    dammTestnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDammSDK(dammTestnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
