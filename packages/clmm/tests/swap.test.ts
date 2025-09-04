import BN from 'bn.js'
import {
  buildSdk,
  buildTestAccount as buildTestAccountNew,
  buildTestPool,
  SdkEnv,
  USDT_USDC_POOL_10,
  MainnetCoin,
} from './data/init_test_data'
import 'isomorphic-fetch'
import { printTransaction } from '../src/utils/transaction-util'
import { adjustForSlippage, d, initFerraSDK, Percentage, TransactionUtil } from '../src'
import { assert } from 'console'

describe('Swap calculate Module', () => {
  // const network = 'mainnet'
  let fullNodeUrl // optional
  let simulationAccount // optional

  const sdk = initFerraSDK({ network: 'mainnet' })

  test('fetchTicksByContract', async () => {
    const tickdatas = await sdk.Pool.fetchTicks({
      pool_id: "0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630",
      coinTypeA: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
      coinTypeB: '0x2::sui::SUI',
    })
    console.log('fetchTicks: ', tickdatas)
  })

  test('fetchTicksByRpc', async () => {
    const tickdatas = await sdk.Pool.fetchTicksByRpc('0x0a46b7e6de173f9e48b56ec7bd3300c6a55c6fd4cabd3e2fbe7181014a796e40')
    console.log('fetchTicks length: ', tickdatas.length)
  })

  test('getTickDataByIndex', async () => {
    const tickdata = await sdk.Pool.getTickDataByIndex('0x79696ca8bcdc45b9e15ef7da074a9c9a6f94739021590d7f57a3ed4055b93532', -443636)
    console.log('tickdata: ', tickdata)
  })

  test('preSwapWithMultiPool', async () => {
    const a2b = true
    const poolAddresses = [
      '0x53d70570db4f4d8ebc20aa1b67dc6f5d061d318d371e5de50ff64525d7dd5bca',
      '0x4038aea2341070550e9c1f723315624c539788d0ca9212dca7eb4b36147c0fcb',
      '0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416',
    ]
    const pool0 = await buildTestPool(sdk, poolAddresses[0])
    const pool1 = await buildTestPool(sdk, poolAddresses[1])
    const pool2 = await buildTestPool(sdk, poolAddresses[2])
    const byAmountIn = true
    const amount = '10000000'

    const resWithMultiPool: any = await sdk.Swap.preSwapWithMultiPool({
      poolAddresses: poolAddresses,
      coinTypeA: pool0.coinTypeA,
      coinTypeB: pool0.coinTypeB,
      a2b,
      byAmountIn,
      amount,
    })

    for (const pool of [pool0, pool1, pool2]) {
      const res: any = await sdk.Swap.preswap({
        pool: pool,
        currentSqrtPrice: pool.current_sqrt_price,
        coinTypeA: pool.coinTypeA,
        coinTypeB: pool.coinTypeB,
        decimalsA: 6,
        decimalsB: 6,
        a2b,
        byAmountIn: byAmountIn,
        amount,
      })
      console.log('preswap###res###', res)
    }

    console.log('preswap###res###', resWithMultiPool)
  })

  test('preswap', async () => {
    const a2b = false
    const pool = await sdk.Pool.getPool('0x0fea99ed9c65068638963a81587c3b8cafb71dc38c545319f008f7e9feb2b5f8')
    const byAmountIn = false
    const amount = '800000'

    const res: any = await sdk.Swap.preswap({
      pool: pool,
      currentSqrtPrice: pool.current_sqrt_price,
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      decimalsA: 6,
      decimalsB: 6,
      a2b,
      byAmountIn: byAmountIn,
      amount,
    })

    console.log('preswap###res###', res)
  })

  test('calculateRates', async () => {
    const a2b = false
    const pool = await sdk.Pool.getPool('0xc8d7a1503dc2f9f5b05449a87d8733593e2f0f3e7bffd90541252782e4d2ca20')
    const byAmountIn = false
    const amount = '80000000000000'

    const swapTicks = await sdk.Pool.fetchTicks({
      pool_id: pool.poolAddress,
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
    })
    // const swapTicks =  await  sdk.Pool.fetchTicksByRpc(pool.ticks_handle)
    console.log('swapTicks: ', swapTicks.length)

    const res = sdk.Swap.calculateRates({
      decimalsA: 6,
      decimalsB: 6,
      a2b,
      byAmountIn,
      amount: new BN(amount),
      swapTicks: swapTicks,
      currentPool: pool,
    })

    console.log('preswap###res###', {
      estimatedAmountIn: res.estimatedAmountIn.toString(),
      estimatedAmountOut: res.estimatedAmountOut.toString(),
      estimatedEndSqrtPrice: res.estimatedEndSqrtPrice.toString(),
      estimatedFeeAmount: res.estimatedFeeAmount.toString(),
      isExceed: res.isExceed,
      extraComputeLimit: res.extraComputeLimit,
      amount: res.amount.toString(),
      aToB: res.aToB,
      byAmountIn: res.byAmountIn,
    })
  })
})

describe('Swap Module', () => {
  const sdk = buildSdk(SdkEnv.testnet)
  let sendKeypair = buildTestAccountNew()

  beforeEach(async () => {
    sdk.senderAddress = sendKeypair.getPublicKey().toSuiAddress()
  })

  test('swap', async () => {
    const a2b = true
    const byAmountIn = true
    const amount = '10000000'
    const slippage = Percentage.fromDecimal(d(0.1))

    const currentPool = await buildTestPool(sdk, "")
    console.log('currentPool: ', currentPool)

    const decimalsA = 6
    const decimalsB = 6
    const res: any = await sdk.Swap.preswap({
      pool: currentPool,
      currentSqrtPrice: currentPool.current_sqrt_price,
      coinTypeA: currentPool.coinTypeA,
      coinTypeB: currentPool.coinTypeB,
      decimalsA,
      decimalsB,
      a2b,
      byAmountIn: byAmountIn,
      amount,
    })

    console.log('res', {
      estimatedAmountIn: res.estimatedAmountIn.toString(),
      estimatedAmountOut: res.estimatedAmountOut.toString(),
      estimatedEndSqrtprice: res.estimatedEndSqrtPrice.toString(),
      estimatedFeeAmount: res.estimatedFeeAmount.toString(),
      isExceed: res.isExceed,
      a2b,
      byAmountIn,
    })

    const toAmount = byAmountIn ? new BN(res.estimatedAmountOut) : new BN(res.estimatedAmountIn)

    const amountLimit = adjustForSlippage(toAmount, slippage, !byAmountIn)

    let swapPayload = await sdk.Swap.createSwapTransactionWithoutTransferCoinsPayload({
      pool_id: currentPool.poolAddress,
      a2b,
      by_amount_in: byAmountIn,
      amount: amount.toString(),
      amount_limit: amountLimit.toString(),
      coinTypeA: currentPool.coinTypeA,
      coinTypeB: currentPool.coinTypeB,
    })

    TransactionUtil.buildTransferCoinToSender(sdk, swapPayload.tx, swapPayload.coinABs[0], currentPool.coinTypeA)
    TransactionUtil.buildTransferCoinToSender(sdk, swapPayload.tx, swapPayload.coinABs[1], currentPool.coinTypeB)

    printTransaction(swapPayload.tx)
    const transferTxn = await sdk.fullClient.sendTransaction(sendKeypair, swapPayload.tx)
    console.log('swap: ', transferTxn)
  })
})

describe('Swap Module: assert preswap and calcualteRates', () => {
  const sdk = buildSdk()
  const sendKeypair = buildTestAccountNew()

  beforeEach(async () => {
    sdk.senderAddress = sendKeypair.getPublicKey().toSuiAddress()
  })

  test('swap', async () => {
    const a2b = true
    const byAmountIn = true
    const amount = '120000000000000000'

    const currentPool = await sdk.Pool.getPool('0x6fd4915e6d8d3e2ba6d81787046eb948ae36fdfc75dad2e24f0d4aaa2417a416')

    const decimalsA = 6
    const decimalsB = 6
    const preSwapRes: any = await sdk.Swap.preswap({
      pool: currentPool,
      currentSqrtPrice: currentPool.current_sqrt_price,
      coinTypeA: currentPool.coinTypeA,
      coinTypeB: currentPool.coinTypeB,
      decimalsA,
      decimalsB,
      a2b,
      byAmountIn,
      amount,
    })

    console.log('preswap###res###', preSwapRes)

    const swapTicks = await sdk.Pool.fetchTicks({
      pool_id: currentPool.poolAddress,
      coinTypeA: currentPool.coinTypeA,
      coinTypeB: currentPool.coinTypeB,
    })
    // const swapTicks =  await  sdk.Pool.fetchTicksByRpc(pool.ticks_handle)
    console.log('swapTicks: ', swapTicks.length)

    const calculateRatesRes = sdk.Swap.calculateRates({
      decimalsA,
      decimalsB,
      a2b,
      byAmountIn,
      amount: new BN(amount),
      swapTicks,
      currentPool,
    })

    console.log('preswap###res###', {
      estimatedAmountIn: calculateRatesRes.estimatedAmountIn.toString(),
      estimatedAmountOut: calculateRatesRes.estimatedAmountOut.toString(),
      estimatedEndSqrtPrice: calculateRatesRes.estimatedEndSqrtPrice.toString(),
      estimatedFeeAmount: calculateRatesRes.estimatedFeeAmount.toString(),
      isExceed: calculateRatesRes.isExceed,
      extraComputeLimit: calculateRatesRes.extraComputeLimit,
      amount: calculateRatesRes.amount.toString(),
      aToB: calculateRatesRes.aToB,
      byAmountIn: calculateRatesRes.byAmountIn,
    })

    assert(preSwapRes.estimatedAmountIn.toString() == calculateRatesRes.estimatedAmountIn.toString())
    assert(preSwapRes.estimatedAmountOut.toString() == calculateRatesRes.estimatedAmountOut.toString())
  })
})
