import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { BinMath, initFerraSDK } from '../src'
import { fromBase64 } from '@mysten/sui/utils'

const SUI_COINTYPE = '0x2::sui::SUI'
const USDC_COINTYPE = '0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC'

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
  const sdk = initFerraSDK({ network: 'testnet', wallet })
  const fees = await sdk.Factory.getBaseFeeAvailable()
  const pair = await sdk.Pair.getPair("0x7214926986d2add63369330b8f407a8af22d8da667989bb0cda018b0e85952de")
  console.log('pair', fees)

  console.log('res', pair)
}

function sum(v: number[]) {
  return v.reduce((p, v) => ((p += v), p))
}

process.argv.at(-1) == __filename && main()
