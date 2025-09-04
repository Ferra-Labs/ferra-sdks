import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { BinMath, initFerraSDK } from '../src'
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


  const pair = await sdk.Pair.getPair('0x6582aaa24e6d76649450b8440f9422a2fd8c29501e6f4213ad003c75d9d9a9dc')
  const bins = await sdk.Position.getPositionBinsAmount(pair!, "0xf425a6214fe34cf0fc0de606444d512d54a27cdef625312766b15953ca032861")

  console.log('res', {
    amountX: sum(bins.map(b => Number(b.amountX))),
    amountY: sum(bins.map(b => Number(b.amountY))),
  })
}

function sum(v: number[]) {
  return v.reduce((p, v) => (p += v, p))
}

process.argv.at(-1) == __filename && main()
