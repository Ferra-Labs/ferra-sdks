import FerraClmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'


const SDKConfig = {
  clmmConfig: {
    pools_id: '0x10137e02719ec3a4979da862b1eb20a8e0c552323adcbe166606e84a9cf4d7b6',
    global_config_id: '0xf95e1634845d71c56dcfcea3c96cef4c81ee2451b2e058a85ed763d81f06abf4',
    global_rewarder_vault_id: '0x7cf968d5ee8ee6c3bda3768839b4a65876c44bda06174e7476b926ad07dddec0',
    admin_cap_id: '0x7079548ef164ebd71ad0e24f517d8a18eba8353682065da48c96887c1c5ee948',
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
    package_id: '0xf9bd23323871f0f3f300b8704a107b0475d3a203880d02ec7d22a7c003091919',
    published_at: '0xf9bd23323871f0f3f300b8704a107b0475d3a203880d02ec7d22a7c003091919',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x7192515dcffbd115662edad5b41e808b3d926a098c963ad53e0196f32365e0e5',
    published_at: '0x7192515dcffbd115662edad5b41e808b3d926a098c963ad53e0196f32365e0e5',
  },
  swapCountUrl: 'https://api-beta.ferra.xyz/clmm/swap/pools'
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
