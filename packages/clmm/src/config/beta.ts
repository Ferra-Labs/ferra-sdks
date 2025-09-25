import FerraClmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'


const SDKConfig = {
  clmmConfig: {
    pools_id: '0xadae2faa029b3b0be430e3b1b787ac0d528f3b3be9d32c61530fabaa6f171431',
    global_config_id: '0x2d1269e1ade81a5189b625ee87c9425bc29249d21d273245269eb07e67dc6965',
    global_rewarder_vault_id: '0xbe8d4702ed1f4bf2ad8101ee68d785538fb6d50e2f187bbafd134d1e2c67aa89'
  }
}
//https://suivision.xyz/txblock/B4WbFgHnh8j5VYJstjQog87hsK5ya7sbXmjsBSF87ogj?tab=Changes
// https://suivision.xyz/txblock/8LQqVty6723xznbMVeasAxbAtqyBwsTbcYTZvpjmkGuQ?tab=Changes
// test on mainnet
export const clmmBeta: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  clmm_pool: {
    package_id: '0x8e1144ad9fbc388c61ac30d74ebef4eb741d213e3a086da48124256290233723',
    published_at: '0x8e1144ad9fbc388c61ac30d74ebef4eb741d213e3a086da48124256290233723',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x46f0964200ea12c1bd3f7280cb49f55c11e4c0df8ae2a40f71253a3a19859a17',
    published_at: '0x46f0964200ea12c1bd3f7280cb49f55c11e4c0df8ae2a40f71253a3a19859a17',
  },
  swapCountUrl: 'https://api-beta.ferra.ag/clmm/swap/pools'
}

/**
 * Initialize the beta SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initBetaSDK(fullNodeUrl?: string, wallet?: string): FerraClmmSDK {
  if (fullNodeUrl) {
    clmmBeta.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraClmmSDK(clmmBeta)
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
