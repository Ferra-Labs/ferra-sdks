import FerraDammSDK, { SdkOptions } from '../main'
import { checkValidSuiAddress } from '../utils'


const SDKConfig = {
  dammConfig: {
    pools_id: '0xb043187ee46183afa5736d88a5882cb7da3c805aa76b7021065bcd3d7cf36b9b',
    global_config_id: '0x0127b12b47d46c80e988efb47dd26ee93d549999293bb96e5de99443883f3d60',
    global_rewarder_vault_id: '0x02f83bca10e586ef9acd01209dbeb7d013ff3453760e7c0e6dea2e00ac93434a'
  }
}

// test on mainnet
export const dammTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  damm_pool: {
    package_id: '0xf9df0f7fab7c453818f33f04c6dbb7518c369fd879b7535d39e683a45bafae19',
    published_at: '0xf9df0f7fab7c453818f33f04c6dbb7518c369fd879b7535d39e683a45bafae19',
    config: SDKConfig.dammConfig,
  },
  integrate: {
    package_id: '0x93835d11de5bba7bd1dc4d180a48d82ee718d32024070247d5549aea4ddd26b9',
    published_at: '0x93835d11de5bba7bd1dc4d180a48d82ee718d32024070247d5549aea4ddd26b9',
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
