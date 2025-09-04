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
  const coin_type_a = `0xb8e7c81766a2cd73869c41a8b05f81f466189d81889f2244c41b81d6a5e664fd::ferr::FERR`
  const coin_type_b = `0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC`
  TickMath.sqrtPriceX64ToPrice
  const creatPoolTransactionPayload = await sdk.Pool.createPoolTransactionPayload({
      tick_spacing: 20,
      initialize_sqrt_price: '18446744073709551616',
      uri: '',
      fix_amount_a: true,
      amount_a: '100',
      amount_b: '100',
      coinTypeA: coin_type_a,
      coinTypeB: coin_type_b,
      slippage: 0.05,
      metadata_a: '0x4c0dce55eff2db5419bbd2d239d1aa22b4a400c01bbb648b058a9883989025da',
      metadata_b: '0x9258181f5ceac8dbffb7030890243caed69a9599d2886d957a9cb7656af3bdb3',
      tick_lower: -40000,
      tick_upper: 40000,
    })

  const transferTxn = await sdk.fullClient.dryRunTransactionBlock({
    transactionBlock: await creatPoolTransactionPayload.build({ client: sdk.fullClient })
  })
  console.log('doCreatPool: ', transferTxn)
}

main()