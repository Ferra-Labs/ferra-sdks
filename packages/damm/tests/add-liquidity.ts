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
  // let keypair: Ed25519Keypair

  // if (secret && secret.length > 0) {
  //   keypair = Ed25519Keypair.fromSecretKey(fromBase64(secret).slice(1, 33))
  // } else {
  //   keypair = Ed25519Keypair.deriveKeypair(mnemonic)
  // }

  // const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'mainnet', wallet: "0x6a0f71c0bd78e84a98052b1aaa8aba4ad649bdc3c41c4d0553d7ad81e833952c" })
  const pair = await sdk.Pair.getPair(
    '0xb64263f776b3e84a21c6c5ad376fd911773c97ecf5ecc004dcfd3ff94b1c54b4'
  )

  if (!pair) {
    throw new Error('Pair not found')
  }

  const currentPairId = pair.parameters.active_id

  const coinXAmount = 250_00
  const coinYAmount = 450
  const slippage = 0.5

  const TEST = true;

  const distribution = DistributionUtils.createParams('BID_ASK', {
    activeId: currentPairId,
    binRange: [currentPairId - 500, currentPairId + 500],
    parsedAmounts: [
      Decimal(toDecimalsAmount(coinXAmount, 6)),
      Decimal(toDecimalsAmount(coinYAmount, 9)),
    ],
  })
  
  const tx = await sdk.Pair.addLiquidity(pair, {
    amountX: BigInt(toDecimalsAmount(coinXAmount, 6)),
    amountY: BigInt(toDecimalsAmount(coinYAmount, 9)),
    ...distribution,
    positionId: "0x2f83e88202c2873a129d648de9e2a053b2fce78cbed0fad12449c8578e15e089"
  })

  let res;

  if (TEST) {
    res = await sdk.fullClient.dryRunTransactionBlock({
      transactionBlock: await tx.build({ client: sdk.fullClient }),
    })
  } else {
    // res = await sdk.fullClient.signAndExecuteTransaction({
    //   transaction: tx,
    //   signer: keypair
    // })
  }

  console.log(
    'res',
    res
  )
}

process.argv.at(-1) == __filename && main()
