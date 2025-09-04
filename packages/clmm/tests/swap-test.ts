import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, initFerraSDK, TickMath } from '../src'
import { buildTestAccount } from './data/init_test_data'
import { fromB64 } from '@mysten/bcs'

async function main() {
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

  sdk.senderAddress = buildTestAccount().getPublicKey().toSuiAddress()
  const tick_spacing = 2
  const initialize_price = 1
  const coin_a_decimals = 9
  const coin_b_decimals = 9
  const coin_type_a = `0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::ferra::FERRA`
  const coin_type_b = `0x2::sui::SUI`

  const creatPoolTransactionPayload = await sdk.Position.createAddLiquidityFixTokenPayload({
      fix_amount_a: false,
      amount_a: '120',
      amount_b: '150',
      coinTypeA: coin_type_a,
      coinTypeB: coin_type_b,
      slippage: 0.05,
      tick_lower: -1200,
      tick_upper: 800,
      collect_fee: false,
      is_open: true,
      pool_id: "0x4cec8091dfa95e5cf42f8deb817512a0c449fb29198b754b1e2250376247e843",
      pos_id: "",
      rewarder_coin_types: []
    })

  const transferTxn = await sdk.fullClient.sendTransaction(buildTestAccount(), creatPoolTransactionPayload)
  console.log('doCreatPool: ', transferTxn)
}

main()