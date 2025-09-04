import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0x66c0565754d53f40dfcf7fa4ff866cb145a2add2d26344f57cbb3a94820826e7',
    pairs_id: '0x8e9611b1c706b3ce469e2fd7b1a948e221bdeeb0d71c8aa92919da39916f9beb',
    reward_vault: '0x2fcb79f79c9935a47667aa1902b29ad3427ff22390c34e5729f2fb4816bca957',
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
    package_id: '0xebe03715ba65ce959d183f64f907ca831d2084789072a5a4e4a01dc3f1c8a5b0',
    published_at: '0xebe03715ba65ce959d183f64f907ca831d2084789072a5a4e4a01dc3f1c8a5b0',
    config: SDKConfig.dlmmConfig,
  },
  integrate: {
    package_id: '',
    published_at: '',
  },
  dlmmApiUrl: "https://api-beta.ferra.xyz/dlmm/pair/"
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
