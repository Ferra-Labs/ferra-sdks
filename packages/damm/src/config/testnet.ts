import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'


const SDKConfig = {
  dammConfig: {
    pools_id: '0xf73faa33534220c7f78dc2bde2c02f42d62b9ed32c72565b93fec4265e570dbd',
    global_config_id: '0x983fb884fc75f31f9f3528290a8d608b2aae0703704be3b44589ddbc6d108b35',
    global_rewarder_vault_id: '0x4597e44c78fd1fa747d66033fa9c456a00b3c530067d68c5503db01a5052fe5c',
  }
}

// test on mainnet
export const dammTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  damm_pool: {
    package_id: '0x55c5787f414c53450e2721c79eb9af4a4cc939b29ad789e628eb6829018f0dee',
    published_at: '0x55c5787f414c53450e2721c79eb9af4a4cc939b29ad789e628eb6829018f0dee',
    config: SDKConfig.dammConfig,
  },
  integrate: {
    package_id: '0xa4fdb5b8e85ed0594452d42e11905c3e3acd87af1a7b67a5cbb9b513c404cf09',
    published_at: '0xa4fdb5b8e85ed0594452d42e11905c3e3acd87af1a7b67a5cbb9b513c404cf09',
  },
  swapCountUrl: 'https://api-dev.ferra.xyz/damm/swap/pools'
}

/**
 * Initialize the testnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 * @returns
 */
export function initTestnetSDK(fullNodeUrl?: string, wallet?: string): FerraDammSDK {
  if (fullNodeUrl) {
    dammTestnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDammSDK(dammTestnet)
  if (wallet && checkValidSuiAddress(wallet)) {
    sdk.senderAddress = wallet
  }
  return sdk
}
