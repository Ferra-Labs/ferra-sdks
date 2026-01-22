import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, initFerraSDK, Percentage, TickMath } from '../src'
import { buildTestAccount } from './data/init_test_data'
import { fromB64 } from '@mysten/bcs'
import { BN } from 'bn.js'
import { normalizeStructTag } from '@mysten/sui/utils'

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
  console.log('wallet', wallet)

  const sdk = initFerraSDK({ network: 'mainnet', wallet, fullNodeUrl: 'https://wallet-rpc.mainnet.sui.io' })

  sdk.senderAddress = buildTestAccount().getPublicKey().toSuiAddress()
  const tick_spacing = 2
  const initialize_price = 1
  const coin_a_decimals = 9
  const coin_b_decimals = 9
  const coin_type_a = `0x2::sui::SUI`
  const coin_type_b = `0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE`

  let pool = await sdk.Pool.getPool('0x263bedaf9075cc4339d93d0bf0a057cda851a059469a9720263f860f2810dc8d')

  console.log('pool', TickMath.tickIndexToPrice(pool.current_tick_index, 9, 9))
  console.log('pool swap b -> a', 1000000 / TickMath.tickIndexToPrice(pool.current_tick_index, 9, 9).toNumber())

  // const creatPoolTransactionPayload = await sdk.Swap.createSwapTransactionPayload({
  //   a2b: false,
  //   amount: '1000000',
  //   amount_limit: '0',
  //   by_amount_in: true,
  //   coinTypeA: coin_type_b,
  //   coinTypeB: coin_type_a,
  //   pool_id: '0x263bedaf9075cc4339d93d0bf0a057cda851a059469a9720263f860f2810dc8d',
  // })

  const creatPoolTransactionPayload = await sdk.Router.getBestInternalRouter(
    normalizeStructTag(coin_type_b),
    normalizeStructTag(coin_type_a),
    new BN(1000000),
    false,
    0.05,
    '0x0c59a3999e12a739f483c7c72ad34b4a7f50d7450f9fba9ce16c9dbb2f4222cc',
    
  )

  // const transferTxn = await sdk.fullClient.sendTransaction(buildTestAccount(), creatPoolTransactionPayload)
  console.log('doCreatPool: ', creatPoolTransactionPayload)
}

main()

export function toI32(value: string | bigint | number | undefined) {
  if (value === undefined) {
    return 0
  }

  return Number(value) >> 32
}
