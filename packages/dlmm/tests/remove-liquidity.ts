import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { initFerraSDK } from '../src'
import { fromBase64 } from '@mysten/sui/utils'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { Transaction } from '@mysten/sui/transactions'

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
  const sdk = initFerraSDK({ network: 'testnet', wallet })
  let hasTx = false
  const TEST = true
  const pair = await sdk.Pair.getPair("0x839b50516175f9a345d70e6df2d9e32cb29a2893e8c47a7cb451a88a27bed20e")
  const tx = new Transaction()
  
  const bins = await sdk.Pair.getPairBins(pair!, [8445280, 8445287])
  console.log('bins', bins);

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
