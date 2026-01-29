import { DcaError, DcaErrorCode } from '../errors/errors'
import type { SdkOptions } from '../sdk'
import { FerraDcaSDK } from '../sdk'
import { checkValidSuiAddress } from '../utils/tx-block'

export const dcaTestnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dca: {
    package_id: '0x3b4723bf450f544cd50c95fee92495c9d2b0655f5d0f28f3a35b0cfbdf6cda31',
    published_at: '0x27ab57ee7c0f8303f5a87e97f9fb54ebe96e7913aa3f79932e96593bf346d4c7',
    config: {
      admin_cap_id: '0x936c513c0f99f8b636ce48e5666771dc742489f70546c1d8f4b0e338fd595764',
      dca_config_id: '0xadb19098a8e5fa38e0d12878fab12fd299b600dbc363345aa12bb00cb4be62fc',
      base_config_id: '0x12232c825d4d5f96a7efbeccf50c054cc89397baa41c00e996bfc518209ee7a0',
      indexer_id: '0xc8af7c76162ff4e91221d707058710f5f25d1e4046f7c95bab952d2a06c67a14',
      user_indexer_id: '0x98dc75e9b4711fc6e91e568f5d6683489041e7465c32464c1bf681318bb880d2',
      in_coin_whitelist_id: '',
      out_coin_whitelist_id: '',
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
      throw new DcaError('Invalid Address', DcaErrorCode.InvalidType)
    }
  }
  return sdk
}
