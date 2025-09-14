import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { BinMath, formatBins, initFerraSDK, SwapUtils } from '../src'
import { fromBase64 } from '@mysten/sui/utils'
import { inspect } from 'util'
import axios from 'axios'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'

type SwapEvent = {
  amounts_in_x: Array<string>
  amounts_in_y: Array<string>
  amounts_out_x: Array<string>
  amounts_out_y: Array<string>
  bin_ids: Array<number>
  pair: string
  protocol_fees_x: Array<string>
  protocol_fees_y: Array<string>
  sender: string
  swap_for_y: boolean
  total_fees_x: Array<string>
  total_fees_y: Array<string>
  volatility_accumulators: Array<number>
}

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

  const pair = await sdk.Pair.getPair('0x02fcbaf9c8c4844e4dba54a9328bc51ffd20c47b3ce36959f185456666fb8a3f')
  if (!pair) {
    throw new Error('Pair not found')
  }

  const binsData = await sdk.Pair.getPairBinsData(pair.id)

  console.log('swapOut', binsData)
  console.log('swapOut', binsData.reduce((p, v) => ((p += BigInt(v.reserve_x) + BigInt(v.fee_x)), p), 0n))
  console.log('swapOut', binsData.reduce((p, v) => ((p += BigInt(v.reserve_y) + BigInt(v.fee_y)), p), 0n))

  const AMOUNT = 10_000_000n;
  const XTOY = false

  const swapOut = sdk.Swap.calculateRates(pair, {
    amount: AMOUNT,
    swapBins: binsData,
    xtoy: XTOY,
  })
  console.log('swapOut', swapOut)
  if (binsData) {
    return
  }
  const tx = await sdk.Swap.prepareSwap(pair, {
    amount: AMOUNT,
    xtoy: XTOY,
  })

  let res

  if (TEST) {
    res = await sdk.fullClient.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client: sdk.fullClient }),
    })
    const gas =
      BigInt(res.effects!.gasUsed.storageCost) - BigInt(res.effects!.gasUsed.storageRebate) + BigInt(res.effects!.gasUsed.computationCost)
    console.log('gas fee:', Number(gas) / 10 ** 9)
  } else {
    res = await sdk.fullClient.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
    })
  }

  const swapEvent = res.events?.find((e) => e.type.endsWith('SwapEvent'))!.parsedJson as SwapEvent
  const amountOut = swapEvent.swap_for_y
    ? swapEvent.amounts_out_y.reduce((p, v) => ((p += BigInt(v)), p), 0n)
    : swapEvent.amounts_out_x.reduce((p, v) => ((p += BigInt(v)), p), 0n)

  const fee = swapEvent.swap_for_y
    ? swapEvent.total_fees_x.reduce((p, v) => ((p += BigInt(v)), p), 0n)
    : swapEvent.total_fees_y.reduce((p, v) => ((p += BigInt(v)), p), 0n)
  console.log('swapEvent', amountOut, swapOut.estimatedAmountOut)
  console.log('fee', fee)
  console.log('swapEvent', swapEvent)
}

process.argv.at(-1) == __filename && main()
