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
  const sdk = initFerraSDK({ network: 'mainnet', wallet, fullNodeUrl: 'https://wallet-rpc.mainnet.sui.io' })
  const pair = await sdk.Pair.getPair('0xec707780d108410b1b865cc2cf082305d9cb844876ab64b728f60cbd505ac35c')
  console.log('pair', pair);
  let start = performance.now();
  const positions = await sdk.Pair.getPairReserves(pair!);
  let stop = performance.now();

  console.log('res', stop - start, 'ms')
  console.log('res', positions.length)
}

process.argv.at(-1) == __filename && main()
