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

  const creatPoolTransactionPayload = await sdk.Position.getPositionList('0x0c59a3999e12a739f483c7c72ad34b4a7f50d7450f9fba9ce16c9dbb2f4222cc')

  console.log('doCreatPool: ', JSON.stringify(creatPoolTransactionPayload, null, ' '))
}

main()