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
    package_id: '0x587614620d0d30aed66d86ffd3ba385a661a86aa573a4d579017068f561c6d8f',
    published_at: '0xcf80e234b4b19afedf71817bb2325b34624b8aeebfd50e635f94181cffc08504',
    version: 3,
    config: {
      dca_config_id: '',
      admin_cap_id: '0xbcdd7391245dd8d6118a39bc83e6d9a7cfca899d06cc283c1a4cae41b2508574',
      base_config_id: '0x5db218756f8486fa2ac26fab590c4be4e439be54e6d932c9a30b20573a5b706a',
      indexer_id: '0x713f0968d042b48f4ec57e4e21bd7e346d06355f59776faedc9497ca990a9f77',
      user_indexer_id: '0x0ae365f60f2fa692831f9496c9e49b2440c74f14e8eab6f88dbb418c443b5020',
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
