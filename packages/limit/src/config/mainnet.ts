import type { SdkOptions } from '../sdk'
import { FerraDcaSDK } from '../sdk'
import { checkValidSuiAddress } from '../utils/tx-block'
import { LimitError, LimitErrorCode } from '../errors/errors'
// mainnet
export const dcaMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  limit_order: {
    /**
     * https://www.moveregistry.com/package/@cetuspackages/limit-order
     */
    package_id: '0xf72cf9820c5e8cc2e5f796eab8d61693a043ffaf4bf1549cb66626cf4a4be223',
    published_at: '0xf72cf9820c5e8cc2e5f796eab8d61693a043ffaf4bf1549cb66626cf4a4be223',
    version: 1,
    config: {
      limit_order_config: '0x87cc714d5ec1838297bc2380fcbb3b198169f58a3b8962031de70705c1c4815f',
      rate_orders_indexer_id: '0x961c76ebc2f5da7c49ef1e88259077fb72949e0172b6efad4d95dcb6807184c9',
      rate_orders_indexer_handle: '0x1838d60f4e9201264712f562b3b17a150500c990df464fe59ea981c6b6e0e17a',
      global_config_id: '0x467038b878da264085c919e53a99f7675947b3a60dbd41d92aa8d49f5b967b2d',
      token_list_handle: '0x6e4da6e4926f502900ab89de9fc7899c3bbd4c20f6e55f01e1a27567288249d9',
      user_orders_indexer_id: '0x49f3975dce16f765dc422b47ae839cc52a87e3c15f9210eee7ac367a5d130ff2',
      user_orders_indexer_handle: '0xb5f6b44f3287a690e9942780e0123d76fbdd230f8a555d6e7184a4e4c038d090',
    },
  },
}

/**
 * Initialize the mainnet SDK
 * @param fullNodeUrl. If provided, it will be used as the full node URL.
 * @param simulationAccount. If provided, it will be used as the simulation account address.
 *                           when you use the `preswap` method or other methods that require payment assistance,
 *                           you must configure a simulation account with sufficient balance of input tokens.
 *                           If you connect the wallet, you can set the current wallet address to simulationAccount.
 * @returns
 */
export function initMainnetSDK(fullNodeUrl?: string, wallet?: string): FerraDcaSDK {
  if (fullNodeUrl) {
    dcaMainnet.fullRpcUrl = fullNodeUrl
  }
  const sdk = new FerraDcaSDK(dcaMainnet)
  if (wallet) {
    if (checkValidSuiAddress(wallet)) {
      sdk.senderAddress = wallet
    } else {
      throw new LimitError('Invalid Address', LimitErrorCode.BuildError)
    }
  }
  return sdk
}
