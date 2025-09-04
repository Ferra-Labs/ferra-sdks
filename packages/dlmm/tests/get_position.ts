import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { initFerraSDK } from '../src'
import { fromBase64 } from '@mysten/sui/utils'

const SUI_COINTYPE = '0x2::sui::SUI'
const USDC_COINTYPE =
  '0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC'

export async function main() {
  const secret = process.env.SUI_WALLET_SECRET || ''
  const mnemonic = process.env.SUI_WALLET_MNEMONICS || ''
  let keypair: Ed25519Keypair

  if (secret && secret.length > 0) {
    keypair = Ed25519Keypair.fromSecretKey(fromBase64(secret).slice(1, 33))
  } else {
    keypair = Ed25519Keypair.deriveKeypair(mnemonic)
  }

  const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'mainnet', wallet })
  const pair = await sdk.Pair.getPair(
    '0x5885e78ea4fec715badc3b49c996989428f1c8a1f396d2ac1e99b28f94785657'
  )
  const position = await sdk.Position.getLbPositions([pair!.id])

  console.log('res', position)
}

process.argv.at(-1) == __filename && main()
