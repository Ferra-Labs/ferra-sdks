import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { BinMath, CreateLBPairParams, initFerraSDK, isSortedSymbols, LBPair } from '../src'
import { fromBase64 } from '@mysten/sui/utils'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { Transaction } from '@mysten/sui/transactions'

const SUI_COINTYPE = '0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND'
const USDC_COINTYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'

const COIN_X = {
  type: SUI_COINTYPE,
  decimals: 9,
}

const COIN_Y = {
  type: USDC_COINTYPE,
  decimals: 6,
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

  console.log('wallet', keypair.toSuiAddress())

  const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'testnet', wallet })

  const TEST = false
  const fees = await sdk.Factory.getBaseFeeAvailable()

  const binStep = 80
  let inititalPrice = 0.2225
  let activeId = BinMath.getIdFromPrice(inititalPrice, binStep, COIN_X.decimals, COIN_Y.decimals)

  if (isSortedSymbols(COIN_X.type, COIN_Y.type)) {
    inititalPrice = 1 / inititalPrice
    activeId = BinMath.getIdFromPrice(inititalPrice, binStep, COIN_Y.decimals, COIN_X.decimals)
  }

  const tx = new Transaction()

  const createPairParams = {
    activeId: Number(activeId),
    binStep,
    tokenXType: USDC_COINTYPE,
    tokenYType: SUI_COINTYPE,
    baseFactor: fees[0].base_factor,
    activationTimestamp: Date.now() + 10000
  } as CreateLBPairParams

  const liquidityX = 166932n
  const liquidityY = 1000_000n

  await sdk.Factory.createLBPairWithCallback(
    createPairParams,
    async (pair) => {
      console.log('pair', pair);
      
      await sdk.Pair.openPositionAndAddLiquidity(
        pair,
        {
          amountX: pair.tokenXType == createPairParams.tokenXType ? liquidityX : liquidityY,
          amountY: pair.tokenYType == createPairParams.tokenYType ? liquidityY : liquidityX,
        },
        tx
      )
    },
    tx
  )
  tx.setSender(keypair.toSuiAddress())

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

process.argv.at(-1) == __filename && main()
