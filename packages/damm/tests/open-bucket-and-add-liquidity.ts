import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromDecimalsAmount, initFerraSDK, DistributionUtils, toDecimalsAmount, TransactionUtil } from '../src'
import { fromBase64 } from '@mysten/sui/utils'
import Decimal from 'decimal.js'
import { inspect } from 'node:util'
import { Transaction } from '@mysten/sui/transactions'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'

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

  const wallet = keypair.toSuiAddress()
  const sdk = initFerraSDK({ network: 'testnet', wallet })
  const pairs = await sdk.Pair.getPairs()
  const pair = await sdk.Pair.getPair('0x92661cf56ac72a1cb95b61954661fcdcebbbc6654ed98f40127e604689414e1d')
  
  if (!pair) {
    throw new Error('Pair not found')
  }

  const TEST = false
  const tx = new Transaction()

  sdk.Pair.openPositionAndAddLiquidity(pair, {
    amountX: 2_000_000n,
    amountY: 1_000_000_000n
  }, tx)

  TransactionUtil.removeLiquidity(pair, {} as any, sdk.sdkOptions, tx)

  let res

  if (TEST) {
    res = await sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: wallet
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

  console.log(
    'res',
    TEST
      ? {
          digest: res.effects?.transactionDigest,
          status: res.effects?.status,
          test: TEST,
        }
      : res
  )
}

const MAX_DIS = BigInt(toDecimalsAmount(1, 9))

function verifyDistribution(distribution: DistributionUtils.LiquidityDistributionParams) {
  const disX = distribution.distributionX.reduce((p, v) => ((p += v), p), 0n)
  const disY = distribution.distributionY.reduce((p, v) => ((p += v), p), 0n)
  if (disX > MAX_DIS || disY > MAX_DIS) {
    console.log('disX', distribution, disX, disY)

    throw 'MAX_DIS'
  }
}

process.argv.at(-1) == __filename && main()
function sum(v: number[]) {
  return v.reduce((p, v) => ((p += v), p))
}
