import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import Decimal from 'decimal.js'
import d from 'decimal.js'
import 'isomorphic-fetch'
import test, { describe, before } from 'node:test'
import { initFerraSDK, initMainnetSDK } from '../src/config'
import { inspect } from 'util'
import { buildTestAccount } from '.'

let send_key_pair: Ed25519Keypair

describe('DCA Module', () => {
  const sdk = initFerraSDK({ network: 'mainnet' })

  before(async () => {
    send_key_pair = buildTestAccount()
    sdk.senderAddress = send_key_pair.getPublicKey().toSuiAddress()
  })

  test('openDcaOrder', async () => {
    const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const out_coin_type = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    const cycle_count = 4
    const in_coin_amount = '40000000000'
    const cycle_count_amount = new Decimal(in_coin_amount).div(Math.pow(10, 9)).div(cycle_count)
    const min_price = 0.83854
    const max_price = 2.172898
    const per_cycle_max_out_amount = d(cycle_count_amount).div(d(min_price)).mul(Math.pow(10, 6)).toFixed(0).toString()
    const per_cycle_min_out_amount = d(cycle_count_amount).div(d(max_price)).mul(Math.pow(10, 6)).toFixed(0).toString()
    console.log('🚀🚀🚀 ~ file: dca.test.ts:36 ~ test ~ per_cycle_max_out_amount:', per_cycle_min_out_amount, per_cycle_max_out_amount)

    const payload = await sdk.Dca.dcaOpenOrderPayload({
      inCoinType: in_coin_type,
      outCoinType: out_coin_type,
      inCoinAmount: in_coin_amount,
      cycleFrequency: 600,
      cycleCount: cycle_count,
      perCycleMinOutAmount: per_cycle_min_out_amount,
      perCycleMaxOutAmount: per_cycle_max_out_amount,
      perCycleInAmountLimit: '9744545921',
      feeRate: 0,
      timestamp: 1723719298,
      signature:
        '004f1929446176bc982043113c7be68d3bf2b060de1876ca3d472df9bb7f19bcf8cbc4e9d3db8172902a4a60a08405b0acbc5d367b54714f3912aba5e92b7ae1009d14900643e10df9eb3b0fac154df75f1d38650b4a741f4fc6b70a3cf2a9f6be',
    })
    //   const res = await sdk.ClmmSDK.fullClient.devInspectTransactionBlock({ transactionBlock: payload, sender: send_key_pair.toSuiAddress() })
    console.log(inspect(payload, { depth: null, colors: true }));
    const result = await sdk.fullClient.sendTransaction(send_key_pair, payload)
    console.log('redeemDividendPayload: ', result)
  })

  test('getDcaOrders', async () => {
    const dcaOrderList = await sdk.Dca.getDcaOrders(sdk.senderAddress)
    console.log('🚀🚀🚀 ~ file: dca.test.ts:61 ~ test ~ dcaOrderList:', dcaOrderList)
  })

  test('withdraw', async () => {
    const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const out_coin_type = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    const order_id = '0xa60c763185a84b87380a0a1e7e677df7d102cbe43b8ae428c3b1572c21909ff4'
    const withdrawPayload = await sdk.Dca.withdrawPayload({
      inCoinType: in_coin_type,
      outCoinType: out_coin_type,
      orderId: order_id,
    })
    console.log(inspect(withdrawPayload, { depth: null, colors: true }));
    const result = await sdk.fullClient.sendTransaction(send_key_pair, withdrawPayload)
    console.log('redeemDividendPayload: ', result)
  })

  test('getDcaOrdersMakeDeal', async () => {
    const order_id = '0x45b567654b09d291f3c99566922b7d63a0bce2bfe4660040c32531e269553eee'
    const dcaOrderList = await sdk.Dca.getDcaOrdersMakeDeal(order_id)
    console.log('🚀🚀🚀 ~ file: dca.test.ts:81 ~ test ~ dcaOrderList:', dcaOrderList)
  })

  test('getDcaGlobalConfig', async () => {
    const globalConfig = await sdk.Dca.getDcaGlobalConfig()
    console.log('🚀🚀🚀 ~ file: dca.test.ts:86 ~ test ~ globalConfig:', globalConfig)
  })

  test('getDcaConfigs', async () => {
    const config = await sdk.Dca.getDcaConfigs()
    console.log('🚀🚀🚀 ~ file: dca.test.ts:91 ~ test ~ config:', config)
  })

  test('dcaCloseOrderPayload', async () => {
    const order_id = '0xfc519e9cccf90f4dfdf3008e5294f9d1107e7177545f79c28f305dbd2e1bc07d'
    const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
    const out_coin_type = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    const dcaCloseOrderPayload = await sdk.Dca.dcaCloseOrderPayload([
      {
        orderId: order_id,
        inCoinType: in_coin_type,
        outCoinType: out_coin_type,
      },
    ])
    console.log(inspect(dcaCloseOrderPayload, { depth: null, colors: true }));
    const result = await sdk.fullClient.sendTransaction(send_key_pair, dcaCloseOrderPayload)
    console.log('redeemDividendPayload: ', result)
  })

  test('getDcaCoinWhiteList', async () => {
    const data = await sdk.Dca.getDcaCoinWhiteList(3)
    console.log('🚀🚀🚀 ~ file: dca.test.ts:109 ~ test ~ inCoinList,outCoinList:', data)
  })
})
