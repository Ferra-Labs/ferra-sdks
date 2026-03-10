import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { BinMath, initFerraSDK } from '../src/index.js'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/bcs'

const SUI_COINTYPE = '0x2::sui::SUI'
const USDC_COINTYPE =
  '0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC'

export async function main() {
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
  const sdk = initFerraSDK({ network: 'mainnet', wallet })


  const positions = await sdk.Position.getLbPositions([])

  console.log('res', positions)
}

function sum(v: number[]) {
  return v.reduce((p, v) => (p += v, p))
}

main()
