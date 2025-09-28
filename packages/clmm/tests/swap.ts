import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { asIntN, d, initFerraSDK, Percentage, Pool, TickData, TickMath, TransactionUtil } from '../src'
import { buildTestAccount } from './data/init_test_data'
import { fromB64 } from '@mysten/bcs'
import BN from 'bn.js'
import { Transaction } from '@mysten/sui/transactions'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'

const TICKS = [
  {
      "index": -443620,
      "sqrt_price": "4298485257",
      "liquidity_net": "76997091",
      "liquidity_gross": "76997091",
      "fee_growth_outside_a": "21235955800934414",
      "fee_growth_outside_b": "424794219427463",
      "rewarders_growth_outside": [
          225471669413192400
      ]
  },
  {
      "index": -37940,
      "sqrt_price": "2767606108039881620",
      "liquidity_net": "60155568285",
      "liquidity_gross": "60155568285",
      "fee_growth_outside_a": "21235955800934414",
      "fee_growth_outside_b": "424794219427463",
      "rewarders_growth_outside": [
          225489888127862050
      ]
  },
  {
      "index": -37740,
      "sqrt_price": "2795419614231863672",
      "liquidity_net": "9742196966",
      "liquidity_gross": "9742196966",
      "fee_growth_outside_a": "21235955800934414",
      "fee_growth_outside_b": "424794219427463",
      "rewarders_growth_outside": [
          225425239826209820
      ]
  },
  {
      "index": -37100,
      "sqrt_price": "2886315068567727202",
      "liquidity_net": "-9742196966",
      "liquidity_gross": "9742196966",
      "fee_growth_outside_a": "0",
      "fee_growth_outside_b": "0",
      "rewarders_growth_outside": [
          0
      ]
  },
  {
      "index": -36900,
      "sqrt_price": "2915321559700410725",
      "liquidity_net": "-60155568285",
      "liquidity_gross": "60155568285",
      "fee_growth_outside_a": "0",
      "fee_growth_outside_b": "0",
      "rewarders_growth_outside": [
          0
      ]
  },
  {
      "index": -36880,
      "sqrt_price": "2918238193504712818",
      "liquidity_net": "974649592",
      "liquidity_gross": "974649592",
      "fee_growth_outside_a": "5433310106311695",
      "fee_growth_outside_b": "102794382090217",
      "rewarders_growth_outside": [
          41621905147691010
      ]
  },
  {
      "index": -36240,
      "sqrt_price": "3013127198757603338",
      "liquidity_net": "-974649592",
      "liquidity_gross": "974649592",
      "fee_growth_outside_a": "0",
      "fee_growth_outside_b": "0",
      "rewarders_growth_outside": []
  },
  {
      "index": 443620,
      "sqrt_price": "79163320688686837543952944461",
      "liquidity_net": "-76997091",
      "liquidity_gross": "76997091",
      "fee_growth_outside_a": "0",
      "fee_growth_outside_b": "0",
      "rewarders_growth_outside": [
          0
      ]
  }
]

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
  const sdk = initFerraSDK({ network: 'mainnet', wallet })

  sdk.senderAddress = wallet
  const tick_spacing = 2
  const initialize_price = 1
  const coin_a_decimals = 9
  const coin_b_decimals = 9
  const coin_type_a = `0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::ferra::FERRA`
  const coin_type_b = `0x2::sui::SUI`

  const pool = await sdk.Pool.getPool("0x05d77d00b2452b4dbc4815ed27cc19043cfc509199c7df015458eb7192b6b64f");

  const ticks = TICKS.map(
    (v) =>
      ({
        sqrtPrice: new BN(v.sqrt_price),
        feeGrowthOutsideA: new BN(v.fee_growth_outside_a),
        feeGrowthOutsideB: new BN(v.fee_growth_outside_b),
        index: v.index,
        liquidityGross: new BN(v.liquidity_gross),
        liquidityNet: new BN(v.liquidity_net),
        rewardersGrowthOutside: [] as BN[],
      }) as TickData
  )

  const swapResults = sdk.Swap.calculateRates({
    byAmountIn: true,
    a2b: true,
    amount: new BN(1_00_000_000n),
    currentPool: pool!,
    decimalsA: 9,
    decimalsB: 9,
    swapTicks: ticks,
  })

  if (swapResults) {
    // swapResults.estimatedAmountOut = swapResults.estimatedAmountOut.toNumber()
    console.log('swapResults', {
      estimatedAmountIn: swapResults.estimatedAmountIn.toString(),
      estimatedAmountOut: swapResults.estimatedAmountOut.toString(),
      estimatedEndSqrtPrice: swapResults.estimatedEndSqrtPrice.toString(),
      estimatedFeeAmount: swapResults.estimatedFeeAmount.toString(),
      isExceed: swapResults.isExceed,
      extraComputeLimit: swapResults.extraComputeLimit,
      amount: swapResults.amount.toString(),
      aToB: swapResults.aToB,
      byAmountIn: swapResults.byAmountIn,
      priceImpactPct: swapResults.priceImpactPct
    })
    return
  }

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
