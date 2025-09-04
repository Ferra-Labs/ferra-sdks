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

  const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'testnet', wallet: wallet })
  const pair = await sdk.Pair.getPair('0x90ae881c804906018a669c1fc87bea420efee97d6a05e37901ad7087333f8909')

  if (!pair) {
    throw new Error('Pair not found')
  }

  const currentPairId = pair.parameters.active_id

  const coinXAmount = 0.01
  const coinYAmount = 0.01
  const slippage = 0.5

  const TEST = false
  const COUNT = 10
  const distribution = DistributionUtils.createParams('BID_ASK', {
    activeId: currentPairId,
    binRange: [currentPairId - COUNT, currentPairId + COUNT],
    parsedAmounts: [Decimal(toDecimalsAmount(coinXAmount, 6)), Decimal(toDecimalsAmount(coinYAmount, 9))],
  })
  console.log('-----------', distribution.deltaIds.length);
  
  console.log('pair', pair.id)
  console.log('active_id', pair.parameters.active_id)
  console.log('Coin X', {
    coinType: pair.tokenXType,
    amount: toDecimalsAmount(coinXAmount, 6),
  })  
  
  console.log('Coin Y', {
    coinType: pair.tokenYType,
    amount: Decimal(toDecimalsAmount(coinYAmount, 9)),
  })

  verifyDistribution(distribution)
  const tx = new Transaction()
  const [_, position] = TransactionUtil.createLbPosition(pair, sdk.sdkOptions, tx)
  
  await sdk.Pair.addLiquidity(pair, {
    amountX: BigInt(toDecimalsAmount(coinXAmount, 6)),
    amountY: BigInt(toDecimalsAmount(coinYAmount, 9)),
    ...distribution,
    position: position
  }, tx)

  tx.transferObjects([position], sdk.senderAddress)

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
