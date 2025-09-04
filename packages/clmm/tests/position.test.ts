import { TickMath } from '../src/math/tick'
import BN from 'bn.js'
import {
  SdkEnv,
  USDT_USDC_POOL_10,
  buildSdk,
  buildTestAccount,
  buildTestPool,
  buildTestPosition,
  PoolObjectID,
  PositionObjectID,
} from './data/init_test_data'
import { ClmmPoolUtil } from '../src/math/clmm'
import { Percentage } from '../src/math/percentage'
import { adjustForCoinSlippage } from '../src/math/position'
import 'isomorphic-fetch'
import { printTransaction } from '../src/utils/transaction-util'
import { fixCoinType, Position } from '../src'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

let sendKeypair: Ed25519Keypair

describe('Position add Liquidity Module', () => {
  const sdk = buildSdk(SdkEnv.mainnet)

  beforeEach(async () => {
    sendKeypair = buildTestAccount()
    sdk.senderAddress = sendKeypair.getPublicKey().toSuiAddress()
  })

  test('get ower position list', async () => {
    const res = await sdk.Position.getPositionList('0xa40aead2dd007e5d16ce7282f2826c259c8fe5a0a5b163585787981f9edd2a72', [])
    console.log('getPositionList####', res)
  })

  test('get position event list', async () => {
    const res = await sdk.Position.getPositionTransactionList({
      posId: '0x568e0062a77626312e18fde331750cd8743245877ec75562b1c5165ab87f4a8f',
      originPosId: '0x0d5942433c0aecfe07e04772bbde765ed85b6e1c66e6156877c7382e23176906',
    })
    console.log('getPositionList####', res.data)
  })

  test('get pool position list', async () => {
    const pool = await sdk.Pool.getPool('0xd4573bdd25c629127d54c5671d72a0754ef47767e6c01758d6dc651f57951e7d')
    console.log('pool', pool)
    const res = await sdk.Pool.getPositionList(pool.position_manager.positions_handle)
    console.log('getPositionList####', res)
  })

  test('getPositionById', async () => {
    const res = await sdk.Position.getPositionById('0x7cea8359f50318d88026d702462df7ce9d96a5b12f3efe9dce6d6450fba779a0')
    console.log('getPositionById###', res)
  })

  test('getSipmlePosition', async () => {
    const res = await sdk.Position.getSimplePosition(PositionObjectID)
    console.log('getSipmlePosition####', res)
  })

  test('getPositionInfo', async () => {
    const pool = await sdk.Pool.getPool(PoolObjectID)
    const res = await sdk.Position.getPosition(pool.position_manager.positions_handle, PositionObjectID)
    console.log('getPositionInfo####', res)
  })

  test('calculateFee', async () => {
    const res = await sdk.Position.calculateFee({
      pool_id: '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105',
      pos_id: '0x66acd113c567a986bf2203a19c9771130d0f7206f641354614ef7ac2ea5ff1b1',
      coinTypeA: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      coinTypeB: '0x2::sui::SUI',
    })
    console.log('calculateFee####', res)
  })

  test('fetchPositionRewardList', async () => {
    const pool = await sdk.Pool.getPool('0xd40feebfcf7935d40c9e82c9cb437442fee6b70a4be84d94764d0d89bb28ab07')
    const res = await sdk.Pool.fetchPositionRewardList({
      pool_id: '0xd40feebfcf7935d40c9e82c9cb437442fee6b70a4be84d94764d0d89bb28ab07',
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
    })

    console.log('getPosition####', res)
  })

  test('open position', async () => {
    const pool = await buildTestPool(sdk, USDT_USDC_POOL_10)
    const lowerTick = TickMath.getPrevInitializableTickIndex(
      new BN(pool.current_tick_index).toNumber(),
      new BN(pool.tickSpacing).toNumber()
    )
    const upperTick = TickMath.getNextInitializableTickIndex(
      new BN(pool.current_tick_index).toNumber(),
      new BN(pool.tickSpacing).toNumber()
    )

    const openPositionTransactionPayload = sdk.Position.openPositionTransactionPayload({
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      tick_lower: lowerTick.toString(),
      tick_upper: upperTick.toString(),
      pool_id: pool.poolAddress,
    })

    printTransaction(openPositionTransactionPayload)

    const transferTxn = await sdk.fullClient.sendTransaction(sendKeypair, openPositionTransactionPayload)
    console.log('open position: ', JSON.stringify(transferTxn, null, 2))
  })

  test('close position', async () => {
    const pool = await buildTestPool(sdk, USDT_USDC_POOL_10)
    const positionObjectId = '0x44fec2821d23b30dd4b90850d25f049ed9b8f3b95df9f944b680bbde05557094'
    const position = (await buildTestPosition(sdk, positionObjectId)) as Position

    const lowerTick = Number(position.tick_lower_index)
    const upperTick = Number(position.tick_upper_index)

    const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(lowerTick)
    const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(upperTick)

    const liquidity = new BN(position.liquidity)
    const slippageTolerance = new Percentage(new BN(5), new BN(100))
    const curSqrtPrice = new BN(pool.current_sqrt_price)

    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(liquidity, curSqrtPrice, lowerSqrtPrice, upperSqrtPrice, false)
    const { tokenMaxA, tokenMaxB } = adjustForCoinSlippage(coinAmounts, slippageTolerance, false)

    const rewards = await sdk.Rewarder.fetchPositionRewarders(pool, positionObjectId)
    console.log('rewards: ', rewards)

    const rewardCoinTypes = rewards.map((item) => item.coin_address)

    const closePositionTransactionPayload = await sdk.Position.closePositionTransactionPayload({
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      min_amount_a: tokenMaxA.toString(),
      min_amount_b: tokenMaxB.toString(),
      rewarder_coin_types: [...rewardCoinTypes],
      pool_id: pool.poolAddress,
      pos_id: positionObjectId,
      collect_fee: true,
    })

    printTransaction(closePositionTransactionPayload)

    const transferTxn = await sdk.fullClient.sendTransaction(sendKeypair, closePositionTransactionPayload)
    console.log('close position: ', transferTxn)
  })

  test('collect_fee', async () => {
    const pool = await buildTestPool(sdk, PoolObjectID)
    const collectFeeTransactionPayload = await sdk.Position.collectFeeTransactionPayload({
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      pool_id: pool.poolAddress,
      pos_id: PositionObjectID,
    })

    const transferTxn = await sdk.fullClient.sendTransaction(sendKeypair, collectFeeTransactionPayload)
    console.log('collect_fee: ', transferTxn)
  })
})
