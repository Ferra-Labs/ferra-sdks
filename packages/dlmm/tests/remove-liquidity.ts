import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { initFerraSDK } from '../src'
import { fromBase64 } from '@mysten/sui/utils'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'

const SUI_COINTYPE = '0x2::sui::SUI'
const USDC_COINTYPE = '0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC'

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
  const sdk = initFerraSDK({ network: 'beta', wallet })

  const TEST = true
  const pair = await sdk.Pair.getPair('0x323e18fba6f65c8a67d75c97895857c1f5126e4eace4092eee7cddccb8eba2b6')

  if (!pair) {
    throw new Error('Pair not found')
  }
  const bins = await sdk.Position.getPositionBinsAmount(pair, '0xeff319521454059e0ada50e058ae037375f22d5c87d679b3fc8bce8ab215faf4')
  console.log(
    'bins',
    bins
  )

  const tx = await sdk.Pair.removeAndClosePosition(pair, "0xeff319521454059e0ada50e058ae037375f22d5c87d679b3fc8bce8ab215faf4")

  let res

  if (TEST) {
    res = await sdk.fullClient.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client: sdk.fullClient }),
    })
  } else {
    res = await sdk.fullClient.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
    })
  }

  console.log('res', res)
}

process.argv.at(-1) == __filename && main()

function createListBins(from: number, to: number) {
  let list: number[] = []
  for (let i = from; i < to; i++) {
    list.push(i)
  }
  return list
}
