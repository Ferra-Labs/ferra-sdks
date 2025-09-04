import FerraDlmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'

const SDKConfig = {
  dlmmConfig: {
    global_config: '0xac9bea324ad32a5606ab13e4af8a7dc37ecb5401099ed074fba08eff19122a2a',
    pairs_id: '0xccdffd10f2a68eafd8d7ab1189fe2f20e36d5c88ae0b54c5acf1aa74fb47510d',
    reward_vault: '0xd83982739262b16c3c9b56c08374a58cd949d62605a4512b5d1e20e492f3f81a',
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
    package_id: '0xff650a5324b803e653eabd48fa60648bfbcb77ed52f2ad719118dfaf08733682',
    published_at: '0xff650a5324b803e653eabd48fa60648bfbcb77ed52f2ad719118dfaf08733682',
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
