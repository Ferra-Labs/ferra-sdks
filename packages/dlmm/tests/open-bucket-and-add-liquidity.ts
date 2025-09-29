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

  const wallet = "0xac5bceec1b789ff840d7d4e6ce4ce61c90d190a7f8c4f4ddf0bff6ee2413c33c"
  const sdk = initFerraSDK({ network: 'beta', wallet })
  const pair = await sdk.Pair.getPair('0xe82b6f6d569907f87c2c3e8748bc393d9f19ec7fc70c53f54354d7da633cc18f')

  if (!pair) {
    throw new Error('Pair not found')
  }

  const currentPairId = pair.parameters.active_id

  const coinXAmount = 0.01
  const coinYAmount = 0.01
  const slippage = 0.5

  const TEST = true
  const COUNT = 10000
  const distribution = DistributionUtils.createParams('SPOT', {
    activeId: currentPairId,
    binRange: [currentPairId - COUNT, currentPairId + COUNT],
    parsedAmounts: [Decimal(toDecimalsAmount(coinXAmount, 6)), Decimal(toDecimalsAmount(0, 9))],
  })

  console.log('distribution', distribution);

  const tx = new Transaction()
  const [_, position] = TransactionUtil.createLbPosition(pair, sdk.sdkOptions, tx)

  const BATCH_SIZE = 400;
  for (let i = 0; i < BATCH_SIZE * 1000; i += BATCH_SIZE) {
    const ids = distribution.ids.slice(i, (i + BATCH_SIZE));
    if (ids.length === 0) {
      break;
    }
    
    await sdk.Pair.addLiquidity(pair, {
      amountX: BigInt(toDecimalsAmount(coinXAmount / 4, 6)),
      amountY: BigInt(toDecimalsAmount(coinYAmount / 4, 9)),
      ids: ids,
      distributionX: distribution.distributionX.slice(i, (i + BATCH_SIZE)),
      distributionY: distribution.distributionY.slice(i, (i + BATCH_SIZE)),
      position: position
    }, tx)
  }

  tx.transferObjects([position], sdk.senderAddress)

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
