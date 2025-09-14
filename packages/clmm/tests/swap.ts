import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { asIntN, d, initFerraSDK, Percentage, Pool, TickData, TickMath, TransactionUtil } from '../src'
import { buildTestAccount } from './data/init_test_data'
import { fromB64 } from '@mysten/bcs'
import BN from 'bn.js'
import { Transaction } from '@mysten/sui/transactions'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'

const TICKS = [
  {
    index: 55520,
    sqrt_price: '296115354986006496385',
    liquidity_net: '361741458',
    liquidity_gross: '361741458',
    fee_growth_outside_a: '0',
    fee_growth_outside_b: '0',
    rewarders_growth_outside: [],
  },
  {
    index: 55790,
    sqrt_price: '300139815045826265570',
    liquidity_net: '109898216',
    liquidity_gross: '109898216',
    fee_growth_outside_a: '27383926692698',
    fee_growth_outside_b: '4450780487409241',
    rewarders_growth_outside: [],
  },
  {
    index: 56030,
    sqrt_price: '303763007347561160921',
    liquidity_net: '22891916158',
    liquidity_gross: '22891916158',
    fee_growth_outside_a: '41143420919915',
    fee_growth_outside_b: '9773885113263619',
    rewarders_growth_outside: [],
  },
  {
    index: 56410,
    sqrt_price: '309589388527016280145',
    liquidity_net: '-109898216',
    liquidity_gross: '109898216',
    fee_growth_outside_a: '38491718521367',
    fee_growth_outside_b: '9363132182533181',
    rewarders_growth_outside: [],
  },
  {
    index: 56650,
    sqrt_price: '313326653071670690763',
    liquidity_net: '-22891916158',
    liquidity_gross: '22891916158',
    fee_growth_outside_a: '0',
    fee_growth_outside_b: '0',
    rewarders_growth_outside: [],
  },
  {
    index: 57570,
    sqrt_price: '328075566177759495153',
    liquidity_net: '-361741458',
    liquidity_gross: '361741458',
    fee_growth_outside_a: '0',
    fee_growth_outside_b: '0',
    rewarders_growth_outside: [],
  },
]

const POOL = {
  pool_address: '0x4e13b5ed11fac6105995b49fc6493d9a783fe6f07472686e622a82ee31b5de12',
  fee_rate: 500,
  liquidity: 361741458,
  tick_spacing: '10',
  current_sqrt_price: '311889845121090580838',
  current_tick_index: 56558,
  coin_type_a: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  coin_type_b: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  coin_amount_a: 7265294,
  coin_amount_b: 10453069937,
  tick_manager: '0x89b5f9e0689b01a36b613d2c4f1fdddc218240a27b26fe69add1feb8fae9ff0a',
  rewarders: [],
  stats: {
    vol: 13.32957889,
    apr: 5.790460912198376,
    fee: 0.0066647928,
    liquidity: 42.01132533120638,
  },
}

async function main() {
  const privateKey = process.env.SUI_WALLET_PRIVATEKEY || ''
  
  const secret = process.env.SUI_WALLET_SECRET || ''
  const mnemonic = process.env.SUI_WALLET_MNEMONICS || ''
  let keypair: Ed25519Keypair
  if (privateKey) {
    keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(privateKey).secretKey)
  } else if (secret && secret.length > 0) {
    keypair = Ed25519Keypair.fromSecretKey(fromB64(secret).slice(1, 33))
  } else {
    console.log("???");
    
    keypair = Ed25519Keypair.deriveKeypair(mnemonic)
  }

  const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'beta', wallet })

  sdk.senderAddress = wallet
  const tick_spacing = 2
  const initialize_price = 1
  const coin_a_decimals = 9
  const coin_b_decimals = 9
  const coin_type_a = `0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::ferra::FERRA`
  const coin_type_b = `0x2::sui::SUI`

  const pool = await sdk.Pool.getPool("0x893582e44c693996161497a779ac0258e9f13d9a11f9fac32f5dcc4c4c2af6d2");

  // const ticks = TICKS.map(
  //   (v) =>
  //     ({
  //       sqrtPrice: new BN(v.sqrt_price),
  //       feeGrowthOutsideA: new BN(v.fee_growth_outside_a),
  //       feeGrowthOutsideB: new BN(v.fee_growth_outside_b),
  //       index: v.index,
  //       liquidityGross: new BN(v.liquidity_gross),
  //       liquidityNet: new BN(v.liquidity_net),
  //       rewardersGrowthOutside: [] as BN[],
  //     }) as TickData
  // )

  // const swapResults = sdk.Swap.calculateRates({
  //   byAmountIn: true,
  //   a2b: false,
  //   amount: new BN(3_000_000_000n),
  //   currentPool: pool!,
  //   decimalsA: 6,
  //   decimalsB: 9,
  //   swapTicks: ticks,
  // })

  // if (swapResults) {
  //   // swapResults.estimatedAmountOut = swapResults.estimatedAmountOut.toNumber()
  //   console.log('swapResults', swapResults)
  //   return
  // }

  const tx = new Transaction()
  tx.setSender(wallet)
  const [coinA, coinB] = TransactionUtil.createRemoveLiquidityPayload({
    pool_id: pool.poolAddress,
    coinTypeA: pool.coinTypeA,
    coinTypeB: pool.coinTypeB,
    min_amount_a: 0n,
    min_amount_b: 0n,
    pos_id: "0x17db0ce03147643d89afe1e52c375aafff86bee27013f9f33b5060857516422c",
    delta_liquidity: "1838001239"
  }, sdk.sdkOptions, tx)

  tx.transferObjects([coinA, coinB], wallet)

  const transferTxn = await sdk.fullClient.dryRunTransactionBlock({
    transactionBlock: await tx.build({ client: sdk.fullClient })
  })
  console.log('doCreatPool: ', transferTxn)
}

main()
