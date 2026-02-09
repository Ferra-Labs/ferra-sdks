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
    package_id: '0xc4490f9701709caa8f25e69aee0901c776d0307123d229b0de81aba7ebb18fba',
    published_at: '0xff01faaed94ce6fc957afd3b58e905a8a85c78ad0e86582286d99afed79d2910',
    config: {
      admin_cap_id: '0x46729b477889d3f8dc2d5cfba06b9cbcddc535c16fcc833a6cc935567f4c949a',
      dca_config_id: '0x34870483b92f4fae83fcb97e32049e253428dc1a2df0dc6f74d254daf8d6d0a8',
      base_config_id: '0xfc27adfed862f70ffb6ca432a0ff5f560acceec5e0726ecf9c9828dd4c12d0e4',
      indexer_id: '0x13307f54f66455134743acb1d5d8845896eef988e66a4dfe130f9c1967cb3f7a',
      user_indexer_id: '0x8afef9ccf0754e13dd2c38017da10b92c47642ea177c1981bb45513b9c8cd0ba',
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
