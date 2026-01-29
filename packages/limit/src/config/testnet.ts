import { LimitError, LimitErrorCode } from '../errors/errors'
import type { SdkOptions } from '../sdk'
import { FerraDcaSDK } from '../sdk'
import { checkValidSuiAddress } from '../utils/tx-block'

export const dcaTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  limit_order: {
    package_id: '0x3b4723bf450f544cd50c95fee92495c9d2b0655f5d0f28f3a35b0cfbdf6cda31',
    published_at: '0x27ab57ee7c0f8303f5a87e97f9fb54ebe96e7913aa3f79932e96593bf346d4c7',
    config: {
      rate_orders_indexer_id: '0xd0c4fdb041248b13897705567da2dddb6ec30785c9700c589f1ea921608ca037',
      rate_orders_indexer_handle: '0xa8c573afcaf7b8a5e1a09a2709795856a6c121a83ce9e2e22cd1c228893f0980',
      global_config_id: '0x12232c825d4d5f96a7efbeccf50c054cc89397baa41c00e996bfc518209ee7a0',
      limit_order_config: '0x0d2c358b33e2c379c9d1f39a74259ed7aa55d350118e7c8359ddbf42eec068c1',
      token_list_handle: '0x32b33663bd55c15b27178bdd1581680780d418c83d5f7b292f972bf9aeed4075',
      user_orders_indexer_id: '0x98dc75e9b4711fc6e91e568f5d6683489041e7465c32464c1bf681318bb880d2',
      user_orders_indexer_handle: '0x58524bb0fa2c982a5af91ad79eb08d6233586ae6b950820962ef7e9e06911e5f',
    },
  },
}


export function initTestnetSDK(fullNodeUrl?: string, wallet?: string): FerraDcaSDK {
  if (fullNodeUrl) {
    dcaTestnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDcaSDK(dcaTestnet)
  if (wallet) {
    if (checkValidSuiAddress(wallet)) {
      sdk.senderAddress = wallet
    } else {
      throw new LimitError('Invalid Address', LimitErrorCode.BuildError)
    }
  }
  return sdk
}
