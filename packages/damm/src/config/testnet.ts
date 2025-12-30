import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'

const SDKConfig = {
  dammConfig: {
    global_config: '0x56bc4d06d963efe7699aa2eea8e47751ed3649a050144eb1c8ed4cbbbc58b0fa',
    pairs_id: '0x0b5f773f3de20460f2861c9785b3f4aeebde5c1feae68651f288f51c660b70d8',
    reward_vault: '0x1ca1f2d079504fa71955d58d2bea89b0c9c58b7c97eaf3d422198d952a723e4c',
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
    package_id: '0x809df5840765842809af5fdca85db642e0de615de8899884a022b2f8608f84d5',
    published_at: '0x809df5840765842809af5fdca85db642e0de615de8899884a022b2f8608f84d5',
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
