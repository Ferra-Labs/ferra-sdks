import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  fromDecimalsAmount,
  initFerraSDK,
  DistributionUtils,
  toDecimalsAmount,
} from '../src'
import { fromBase64 } from '@mysten/sui/utils'
import Decimal from 'decimal.js'

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
  const pair = await sdk.Pair.getPair(
    '0x7e934d6ea0cf5b73cd67e5767781859b50e10b598d64b2323d7473959ed50097'
  )

  if (!pair) {
    throw new Error('Pair not found')
  }

  const currentPairId = pair.parameters.active_id

  const coinXAmount = 1000
  const coinYAmount = 1000
  const slippage = 0.5

  const TEST = true;

  const distribution = DistributionUtils.createParams('BID_ASK', {
    activeId: currentPairId,
    binRange: [currentPairId - 100, currentPairId + 100],
    parsedAmounts: [
      Decimal(toDecimalsAmount(coinXAmount, 6)),
      Decimal(toDecimalsAmount(coinYAmount, 9)),
    ],
  })

  verifyDistribution(distribution)
  const tx = await sdk.Pair.openPosition(pair)

  let res;

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
  const gas =
    BigInt(res.effects!.gasUsed.storageCost) - BigInt(res.effects!.gasUsed.storageRebate) + BigInt(res.effects!.gasUsed.computationCost)
  console.log('gas fee:', Number(gas) / 10 ** 9)

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

const MAX_DIS = BigInt(toDecimalsAmount(1, 9));

function verifyDistribution(distribution: DistributionUtils.LiquidityDistributionParams) {
  const disX = distribution.distributionX.reduce((p, v) => (p += v, p), 0n)
  const disY = distribution.distributionY.reduce((p, v) => (p += v, p), 0n)
  if (disX > MAX_DIS || disY > MAX_DIS) {
    console.log('disX', distribution, disX, disY);
    
    throw "MAX_DIS"
  }
}

process.argv.at(-1) == __filename && main()
