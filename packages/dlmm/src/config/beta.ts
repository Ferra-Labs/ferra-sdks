import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0x81840b602be475fabb192c9c6e2a56d38cf79b9bcb6f2f4f88a3421cad8dfe25',
    pairs_id: '0xeb4e62303fe217e469bba5b07c71374316c2169d16e4f7824b5fe6409c11694a',
    reward_vault: '0xd5d5906687702e8eae6c9aff915a3485eaddc24203abd7648e73cca89ef62b00',
  }
}
// https://suivision.xyz/txblock/5tdiGxMn6LbxQdXSvc61LDWcT1ZLw5bpYtZMkisqqhTm?tab=Changes
// beta
export const dlmmBeta: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dlmm_pool: {
    package_id: '0x8c85cc6e2cecad2e0fad9e2d973889cf245aab35e5de0bfc8c4f3388be3d0acd',
    published_at: '0x8c85cc6e2cecad2e0fad9e2d973889cf245aab35e5de0bfc8c4f3388be3d0acd',
    config: SDKConfig.dlmmConfig,
  },
  integrate: {
    package_id: '',
    published_at: '',
  },
  dlmmApiUrl: "https://api-beta.ferra.ag/dlmm/pair/"
}

/**
 * Initialize the beta SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initBetaSDK(fullNodeUrl?: string, wallet?: string): FerraDlmmSDK {
  if (fullNodeUrl) {
    dlmmBeta.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDlmmSDK(dlmmBeta)
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
