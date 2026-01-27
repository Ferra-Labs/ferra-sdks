import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, DammPoolUtil, initFerraSDK, TickMath } from '../src'
import { buildTestAccount } from './data/init_test_data'
import { fromB64, fromBase64 } from '@mysten/bcs'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { inspect } from 'util'
import Decimal from 'decimal.js'
import { BN } from 'bn.js'

async function main() {
  const privateKey = process.env.SUI_WALLET_PRIVATEKEY || ''
  const secret = process.env.SUI_WALLET_SECRET || ''
  const mnemonic = process.env.SUI_WALLET_MNEMONICS || ''
  let keypair: Ed25519Keypair
  
  if (privateKey) {
    keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(privateKey).secretKey)
  } else if (secret && secret.length > 0) {
    keypair = Ed25519Keypair.fromSecretKey(fromBase64(secret).slice(1, 33))
  } else {
    keypair = Ed25519Keypair.deriveKeypair(mnemonic)
  }

  const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'testnet', wallet })

  sdk.senderAddress = keypair.toSuiAddress()

  const pools = await sdk.Pool.getPools();
  console.log('pools', inspect(pools, { depth: null, colors: true }));
  if (pools) {
    return;
  }
  const fees = await sdk.Pool.getBaseFeesAvailable();
  console.log('pools', inspect(fees, { depth: null, colors: true }));

  const tick_spacing = 2
  const initialize_price = 1
  const coin_a_decimals = 9
  const coin_b_decimals = 9
  const coin_type_a = `0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`
  const coin_type_b = `0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI`

  const initialize_sqrt_price = TickMath.priceToSqrtPriceX64(d(1.2),6,6).toString()
  const current_tick_index = TickMath.sqrtPriceX64ToTickIndex(new BN(initialize_sqrt_price))
  // build tick range
  const tick_lower = TickMath.getPrevInitializableTickIndex(new BN(current_tick_index).toNumber()
      , new BN(tick_spacing).toNumber())
  const tick_upper = TickMath.getNextInitializableTickIndex(new BN(current_tick_index).toNumber()
      , new BN(tick_spacing).toNumber())
  // input token amount
  const fix_coin_amount = new BN(200)
  // input token amount is token a
  const fix_amount_a = true
  // slippage value 0.05 means 5%
  const slippage = 0.05
  const cur_sqrt_price = new BN(initialize_sqrt_price)

  const liquidityInput = DammPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
    tick_lower,
    tick_upper,
    fix_coin_amount,
    fix_amount_a,
    true,
    slippage,
    cur_sqrt_price
  )
  // Estimate  token a and token b amount
  const amount_a = fix_amount_a ? fix_coin_amount.toNumber()  : liquidityInput.tokenMaxA.toNumber()
  const amount_b = fix_amount_a ? liquidityInput.tokenMaxB.toNumber()  : fix_coin_amount.toNumber()

  const coinMetadataA = (await sdk.fullClient.getCoinMetadata({coinType: coin_type_a}))!
  const coinMetadataB = (await sdk.fullClient.getCoinMetadata({coinType: coin_type_b}))!

  console.log('params', {
    tick_spacing: 2,
    initialize_sqrt_price: cur_sqrt_price.toString(),
    uri: '',
    fix_amount_a: true,
    amount_a: amount_a,
    amount_b: amount_b,
    coinTypeA: coin_type_a,
    coinTypeB: coin_type_b,
    slippage: 0.05,
    metadata_a: coinMetadataA!.id!,
    metadata_b: coinMetadataB!.id!,
    tick_lower: tick_lower,
    tick_upper: tick_upper,
    activation_timestamp: Date.now() + 1000,
    collect_fee_mode: 0,
    enable_dynamic_fee: true,
    enable_fee_scheduler: true,
    fee_scheduler_mode: 0,
    is_quote_y: false,
  });
  
  const creatPoolTransactionPayload = await sdk.Pool.createPoolTransactionPayload({
      tick_spacing: 2,
      initialize_sqrt_price: cur_sqrt_price.toString(),
      uri: '',
      fix_amount_a: true,
      amount_a: amount_a,
      amount_b: amount_b,
      coinTypeA: coin_type_a,
      coinTypeB: coin_type_b,
      slippage: 0.05,
      metadata_a: coinMetadataA!.id!,
      metadata_b: coinMetadataB!.id!,
      tick_lower: tick_lower,
      tick_upper: tick_upper,
      activation_timestamp: Date.now() + 10000,
      collect_fee_mode: 0,
      enable_dynamic_fee: true,
      enable_fee_scheduler: true,
      fee_scheduler_mode: 0,
      is_quote_y: false,
    })

  const transferTxn = await sdk.fullClient.dryRunTransactionBlock({
    transactionBlock: await creatPoolTransactionPayload.build({ client: sdk.fullClient })
  })
  console.log('doCreatPool: ', transferTxn)
}

main()