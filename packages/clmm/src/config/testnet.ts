import FerraClmmSDK, { SdkOptions } from '../main'
import { checkInvalidSuiAddress } from '../utils'


const SDKConfig = {
  clmmConfig: {
    pools_id: '0x73facdbdd41871db56a06fd4a1df5e2f9c0521b9fea70d4c70ed67a45a74bc2b',
    global_config_id: '0x931f22436c8f1dc81dfe40f3a98a967ff8acc2abc600a58c8c323bc7ca2c33bc',
    global_rewarder_vault_id: '0x2da2d307345c689c1f319ff65212e28dccbc2edb461e79bb7da38d04b84c063d',
    admin_cap_id: '0x5518b9d241d6004dfde3f09848bf241dec1617e49c788075073bc509e433cfc2',
  }
}

// test on mainnet
export const clmmTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  clmm_pool: {
    package_id: '0x88833f79df96d4465298650785e121766727ee926a3916b4fd6c7a2b12e5b4ff',
    published_at: '0x88833f79df96d4465298650785e121766727ee926a3916b4fd6c7a2b12e5b4ff',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x52a47d40182bf7c39c61a90bce250b8e39a6ca68fb2acaf1d5698f22e0accf7a',
    published_at: '0x52a47d40182bf7c39c61a90bce250b8e39a6ca68fb2acaf1d5698f22e0accf7a',
  },
  swapCountUrl: 'https://api-dev.ferra.xyz/clmm/swap/pools'
}

/**
 * Initialize the testnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initTestnetSDK(fullNodeUrl?: string, wallet?: string): FerraClmmSDK {
  if (fullNodeUrl) {
    clmmTestnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraClmmSDK(clmmTestnet)
  if (wallet && checkInvalidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
