import type { SdkOptions } from '../sdk'
import { FerraDcaSDK } from '../sdk'
import { checkValidSuiAddress } from '../utils/tx-block'
import { DcaError, DcaErrorCode } from '../errors/errors'
// mainnet
export const dcaMainnet: SdkOptions = {
  fullRpcUrl: 'https://mainnet.suiet.app:443',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  dca: {
    package_id: '0xf72cf9820c5e8cc2e5f796eab8d61693a043ffaf4bf1549cb66626cf4a4be223',
    published_at: '0xf72cf9820c5e8cc2e5f796eab8d61693a043ffaf4bf1549cb66626cf4a4be223',
    version: 1,
    config: {
      dca_config_id: '0xdb4bd8f2359f87c1d80caa530718ef1c6e71f00aefcb87c9c11ceddb1deede48',
      admin_cap_id: '0xe26e32d064f73e6b3e3f81df126ec5145f6515d97b13bf364174631267b565ff',
      base_config_id: '0x467038b878da264085c919e53a99f7675947b3a60dbd41d92aa8d49f5b967b2d',
      indexer_id: '0x2a155d8be4e7bdb5293f6344f9ea7e07befeb93d5604663c144a0c94ec9d3d6a',
      user_indexer_id: '0x49f3975dce16f765dc422b47ae839cc52a87e3c15f9210eee7ac367a5d130ff2',
      in_coin_whitelist_id: '0x845643253afdfef9c4202e7af5e2de374b7f4766f78694903e8b2c0f83dab3ce',
      out_coin_whitelist_id: '0xe398b24a2b28f1ffd18394eaa78538d6ec8111dcb5fd919424bd3d42764c19f7',
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
      throw new DcaError('Invalid Address', DcaErrorCode.InvalidType)
    }
  }
  return sdk
}
