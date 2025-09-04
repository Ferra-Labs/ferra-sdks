import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { initFerraSDK } from '../src'
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
  const pair = await sdk.Pair.getPair('0x43259a8b778704359f35f0e6f92dd59ef3aeed3ad166e7826efc90902c1dfe6e')
  if (!pair) {
    throw new Error('Pair not found')
  }
  const start = performance.now()
  const tx = await sdk.Position.getLockPositionStatus(
    '0x709564e7570a470024285899331e1b571f54a7f5738425ff27b6b6a8fb06e205',
  )

  console.log('fees', tx);
  
  console.log('cost', performance.now() - start)
}

const sleep = () =>
  new Promise<void>((resolve, reject) => {
    setTimeout(resolve, 5000)
  })

process.argv.at(-1) == __filename && main()
