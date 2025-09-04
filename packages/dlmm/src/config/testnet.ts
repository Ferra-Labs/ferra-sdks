import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0x5c2fffd7fc54e28e2a36e93cddc4d59c24b3f1cccad703b3242d2d146715c860',
    pairs_id: '0x17b0cb829738205e25250ce1e7eb12cce30d02d5404b0e614763a4811ae81c60',
    reward_vault: '0x7d6302958ab12833748ffeb71f6bd0f4248aafde948fc4803a0633857c3163f2',
  }
}

// https://suivision.xyz/txblock/5tdiGxMn6LbxQdXSvc61LDWcT1ZLw5bpYtZMkisqqhTm?tab=Changes
// beta
export const dlmmTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dlmm_pool: {
    package_id: '0xe8cfaef4533ec6272122858c66d7c796b0da5ea596eeb10b30cbd9b30e6b8305',
    published_at: '0xe8cfaef4533ec6272122858c66d7c796b0da5ea596eeb10b30cbd9b30e6b8305',
    config: SDKConfig.dlmmConfig,
  },
  integrate: {
    package_id: '',
    published_at: '',
  },
  dlmmApiUrl: "https://api-dev.ferra.xyz/dlmm/pair/"
}

/**
 * Initialize the testnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initTestnetSDK(fullNodeUrl?: string, wallet?: string): FerraDlmmSDK {
  if (fullNodeUrl) {
    dlmmTestnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDlmmSDK(dlmmTestnet)
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
