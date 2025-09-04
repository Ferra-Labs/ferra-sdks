import FerraClmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'


const SDKConfig = {
  clmmConfig: {
    pools_id: '0xcf1b1f1f035623d1288fedbf6b188cd4b90382235bfcd646cd2a9b0a8f9c4212',
    global_config_id: '0x742954bcd338245136baab63a2caea8c604a3deb1799a6f8b1652362c55ee1f3',
    global_rewarder_vault_id: '0x699fb87c6b489645076ddb94025d58c026c250fa6ebaa9a7b8599e7e53945621',
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
    package_id: '0x14accb5e43c552958eaf1128556dfe3650235c835eb220d4a09bafd2972002b0',
    published_at: '0x14accb5e43c552958eaf1128556dfe3650235c835eb220d4a09bafd2972002b0',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x0fd5ebabe006c738bbe5e9a2593b8406ceccdf4d83f9f6243e2e9064d478cc89',
    published_at: '0x0fd5ebabe006c738bbe5e9a2593b8406ceccdf4d83f9f6243e2e9064d478cc89',
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
