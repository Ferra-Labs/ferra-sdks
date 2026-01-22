import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'


const SDKConfig = {
  dammConfig: {
    pools_id: '0x16f7a687e4ff828d4f9d3d05998801b1f6eea458fc94e6fb4ce670ba8a76249b',
    global_config_id: '0xa1299b1ba73c67ca458e78d75f275ad8f20ae165f1088e78b497b4be5cf92400',
    global_rewarder_vault_id: '0x82ffbc93f7e69037868c2f30174aca86721e330d324efe99bbaffacc9893cafd',
  }
}

// test on mainnet
export const dammTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  damm_pool: {
    package_id: '0x7e0191d719b02efff319ddbda47766dc38ccd59b1363d54b11210c318f20012c',
    published_at: '0x7e0191d719b02efff319ddbda47766dc38ccd59b1363d54b11210c318f20012c',
    config: SDKConfig.dammConfig,
  },
  integrate: {
    package_id: '0x368ad49e1886e899df4909ff0964ce4709b1d6009e481488cbb18a0f6c7435e9',
    published_at: '0x368ad49e1886e899df4909ff0964ce4709b1d6009e481488cbb18a0f6c7435e9',
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
