import { buildOracleAccount, buildTestAccount } from '.'
import { initFerraSDK } from '../src/config'
import { inspect } from 'util'
import { bcs } from '@mysten/sui/bcs'
import { PublicKey } from '@mysten/sui/cryptography'
import { normalizeSuiAddress, toHex } from '@mysten/sui/utils'

const DcaMessage = bcs.struct('DcaMessage', {
  inCoin: bcs.String,
  sender: bcs.Address,
  cycle_frequency: bcs.U64,
  cycle_count: bcs.U64,
  in_amount_limit_per_cycle: bcs.U64,
  in_amount_per_cycle: bcs.U64,
  fee_rate: bcs.U64,
  oracle_timestamp: bcs.U64,
})

async function normalizedAddress(address: string) {
  const parts = address.split('::')
  const normalizedAddress = normalizeSuiAddress(parts[0])
  const normalizedTokenType = `${normalizedAddress.replace('0x', '')}::${parts[1]}::${parts[2]}`
  return normalizedTokenType
}

const pool = {
  pay_coin_type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  target_coin_type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
}

async function main() {
  const sdk = initFerraSDK({ network: 'testnet' })
  const wallet = buildTestAccount()

  const pay_coin_amount = 2000000
  const price = 1.35
  const expired_ts = Date.parse(new Date().toString()) + 7 * 24 * 60 * 60 * 1000 //7 day
  const orders = await sdk.LimitOrder.getOwnerLimitOrderList('0xe802f70133f9da29298de788b2229107d57f2f80867da2695c57ab60072c0da1')
  console.log('orders', orders);

  const payload = await sdk.LimitOrder.placeLimitOrder({
    pay_coin_amount,
    price,
    expired_ts,
    pay_coin_type: pool.pay_coin_type,
    target_coin_type: pool.target_coin_type,
    target_decimal: 6,
    pay_decimal: 6,
  })

  const payload2 = await sdk.LimitOrder.placeLimitOrder({
    pay_coin_amount,
    price,
    expired_ts,
    pay_coin_type: pool.pay_coin_type,
    target_coin_type: pool.target_coin_type,
    target_decimal: 6,
    pay_decimal: 6,
  })

  // const txResult = await sdk.fullClient.sendTransaction(wallet, payload)
  // console.log('txResult: ', txResult)
}

main()
