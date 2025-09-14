import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0xd9e379604b7f46a84bd6bcf39fb3819851a864fd6a6ad0474c854c451adfaebb',
    pairs_id: '0xabf2db0d8af1777c6081a0614c68db016b70175b57d09c549319f5723b667f05',
    reward_vault: '0xea185c8fed41052dbb2e48caf7edd7ea924221552eb0a15e041ad1027abc948d',
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
    package_id: '0xe6cb7c7a4ed30221e1d264d6dd5f47f3be7238d07fa4be02cc641ceda99d8022',
    published_at: '0xba2df63eab02ea89b1359347f6ba098ee3924bd781dd270774ee04a9212365af',
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
