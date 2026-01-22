import 'isomorphic-fetch'
import BN from 'bn.js'
import { TestnetCoin, buildTestAccount } from './data/init_test_data'
import { TickMath } from '../src/math/tick'
import { d } from '../src/utils/numbers'
import { DammPoolUtil } from '../src/math/damm'
import { printTransaction } from '../src/utils/transaction-util'
import { asIntN, asUintN, initFerraSDK, isSortedSymbols, TransactionUtil } from '../src'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromB64 } from '@mysten/bcs'

import dotenv from 'dotenv'
dotenv.config()

describe('Pool Module', () => {
  const secret = process.env.SUI_WALLET_SECRET || ''
  const mnemonic = process.env.SUI_WALLET_MNEMONICS || ''
  let keypair: Ed25519Keypair

  if (secret && secret.length > 0) {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(secret).slice(1, 33))
  } else {
    keypair = Ed25519Keypair.deriveKeypair(mnemonic)
  }

  const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'mainnet', wallet })
  console.log('sdk.senderAddress', sdk.senderAddress)

  test('getAllPools', async () => {
    const pools = await sdk.Pool.getPoolsWithPage([])
    console.log(pools.length)
  })

  test('getPoolImmutables', async () => {
    const poolImmutables = await sdk.Pool.getPoolImmutables()
    console.log('getPoolImmutables', poolImmutables)
  })

  test('getPoolTransactionList', async () => {
    const res = await sdk.Pool.getPoolTransactionList({
      poolId: '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105',
      paginationArgs: {
        limit: 10,
      },
    })
    console.log('res', res)
  })

  test('getAllPool', async () => {
    const allPool = await sdk.Pool.getPools([])
    console.log('getAllPool', allPool, '###length###', allPool.length)
  })

  test('getSiginlePool', async () => {
    const pool = await sdk.Pool.getPool('0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630')
    console.log('pool', pool)
  })


  test('get partner ref fee', async () => {
    const refFee = await sdk.Pool.getPartnerRefFeeAmount('0x0c1e5401e40129da6a65a973b12a034e6c78b7b0b27c3a07213bc5ce3fa3d881')
    console.log('ref fee:', refFee)
  })

  test('claim partner ref fee', async () => {
    const partnerCap = 'xxx'
    const partner = 'xxx'
    const claimRefFeePayload = await sdk.Pool.claimPartnerRefFeePayload(partnerCap, partner, TestnetCoin.SUI)
    const transferTxn = await sdk.fullClient.sendTransaction(buildTestAccount(), claimRefFeePayload)
    console.log('doCreatPool: ', JSON.stringify(transferTxn))
  })

  test('DammPoolUtil.estLiquidityAndcoinAmountFromOneAmounts: ', () => {
    const lowerTick = -74078
    const upperTick = -58716
    const currentSqrtPrice = '979448777168348479'
    const coinAmountA = new BN(100000000)
    const { coinAmountB } = DammPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
      lowerTick,
      upperTick,
      coinAmountA,
      true,
      true,
      0,
      new BN(currentSqrtPrice)
    )
  })

  test('isSortedSymbols', () => {
    const p = isSortedSymbols(
      '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    )
    console.log('🚀🚀🚀 ~ file: pool.test.ts:145 ~ test ~ p:', p)
  })

  test('creatPoolTransactionPayload', async () => {
    const payload = await sdk.Pool.createPoolTransactionPayload({
      tick_spacing: 220,
      initialize_sqrt_price: '18446744073709551616',
      uri: '',
      fix_amount_a: true,
      amount_a: '100000000',
      amount_b: '100000000',
      coinTypeA: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
      coinTypeB: '0x2::sui::SUI',
      slippage: 0.05,
      metadata_a: '0x2c5f33af93f6511df699aaaa5822d823aac6ed99d4a0de2a4a50b3afa0172e24',
      metadata_b: '0x9258181f5ceac8dbffb7030890243caed69a9599d2886d957a9cb7656af3bdb3',
      tick_lower: -443520,
      tick_upper: 443520,
    })
    const cPrice = TickMath.sqrtPriceX64ToPrice(new BN('184467440737095516'), 9, 6)
    console.log('🚀🚀🚀 ~ file: pool.test.ts:168 ~ test ~ cPrice:', cPrice.toString())
    printTransaction(payload)
    const transferTxn = await sdk.fullClient.dryRunTransactionBlock({
      transactionBlock: await payload.build({ client: sdk.fullClient }),
    })
    // const transferTxn = await sdk.fullClient.sendTransaction(buildTestAccount(), payload)
    // console.log('doCreatPool: ', transferTxn)
    console.log('🚀🚀🚀 ~ file: pool.test.ts:168 ~ test ~ transferTxn:', transferTxn)
  })

  test('converte tick index between i32 and u32', () => {
    const tickIndex = -1800
    const tickIndexUint32 = asUintN(BigInt(tickIndex))
    console.log('tickIndexUint32', tickIndexUint32)

    const tickIndexI32 = asIntN(BigInt(tickIndexUint32))
    console.log('tickIndexI32', tickIndexI32)
  })

  
})
