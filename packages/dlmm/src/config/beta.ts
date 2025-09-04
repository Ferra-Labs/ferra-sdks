import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0x975926b55ef6818b85a31811f3bc012f66e8d02218b57625a6d333a0c10dc26c',
    pairs_id: '0xa71885b3cfdf98253af25c495394fa30e08ed63ee2f059901f878d7513387fb6',
    reward_vault: '0xdb2ea4b741b189a6cf930a32b0f8ad1d6cae6c7c4efed3484df560b435bf6de2',
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
    package_id: '0x73310073608c7d93f1d76b35d9ccd455a359c9380895ef234e20aed216c45ed3',
    published_at: '0x73310073608c7d93f1d76b35d9ccd455a359c9380895ef234e20aed216c45ed3',
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
