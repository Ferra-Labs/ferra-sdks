import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0xd07fcd72e29e799468d6ea4498980df6f1e6bfba2a1640f81ae2a4d90323e9b7',
    pairs_id: '0x926a08958712d4728d1b7697dc52c219e4c23499cbed769de382a1a335e4e17a',
    reward_vault: '0x54e4ff0ada41a1b3a1f685dbd03f25b99e6dae1b76c35a0e3d60b83749bdb0ca',
  }
}

// mainnet
export const dlmmMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dlmm_pool: {
    package_id: '0x69b4880637bd4483f983209d58643927ee87e07f51c7a1d6a3ac37eff627d4a3',
    published_at: '0x69b4880637bd4483f983209d58643927ee87e07f51c7a1d6a3ac37eff627d4a3',
    config: SDKConfig.dlmmConfig,
  },
  integrate: {
    package_id: '',
    published_at: '',
  },
  dlmmApiUrl: "https://api-beta.ferra.xyz/dlmm/pair/"
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
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraDlmmSDK {
  if (fullNodeUrl) {
    dlmmMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDlmmSDK(dlmmMainnet)
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
