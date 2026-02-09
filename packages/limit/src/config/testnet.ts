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
    package_id: '0xc4490f9701709caa8f25e69aee0901c776d0307123d229b0de81aba7ebb18fba',
    published_at: '0xff01faaed94ce6fc957afd3b58e905a8a85c78ad0e86582286d99afed79d2910',
    config: {
      rate_orders_indexer_id: '0x038930bdeab0de9dc5c0373c4d96257b31ebad40f8acd840cb8a157dd4dee4c0',
      rate_orders_indexer_handle: '0x60d915d7309d0f8afb12623f62d3facabacb89fbe9222ed40184422bb4a26965',
      global_config_id: '0xfc27adfed862f70ffb6ca432a0ff5f560acceec5e0726ecf9c9828dd4c12d0e4',
      limit_order_config: '0xe30dbfd2ee5df896e90f8004951c82868b079a8a950b0395d13ec316d0198a7f',
      token_list_handle: '0x298843d0a1576f03f5b6c63fb1a0b73a8c569b0accaecac0d31175fb82d33afa',
      user_orders_indexer_id: '0x8afef9ccf0754e13dd2c38017da10b92c47642ea177c1981bb45513b9c8cd0ba',
      user_orders_indexer_handle: '0xd6ccc981c73e8f055eb1564144b88eab0aeed93536cf5c04d47c0762a5789899',
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
