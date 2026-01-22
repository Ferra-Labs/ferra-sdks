import BN from 'bn.js'
import { SdkEnv, TestnetCoin, MainnetCoin, buildSdk, buildTestAccount } from './data/init_test_data'
import { FerraDammSDK, CoinAsset, CoinAssist, TransactionUtil, CoinProvider, PathProvider } from '../src'
import { Transaction } from '@mysten/sui/transactions'
import { assert } from 'console'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1'
import { fromB64 } from '@mysten/bcs'

describe('Unified Router Module Tests', () => {
  const sdk = buildSdk(SdkEnv.testnet)
  const secret = process.env.SUI_WALLET_SECRET || ''
  const mnemonic = process.env.SUI_WALLET_MNEMONICS || ''
  let sendKeypair: Ed25519Keypair

  if (secret && secret.length > 0) {
    sendKeypair = Ed25519Keypair.fromSecretKey(fromB64(secret).slice(1, 33))
  } else {
    sendKeypair = Ed25519Keypair.deriveKeypair(mnemonic)
  }
  sdk.senderAddress = sendKeypair.getPublicKey().toSuiAddress()

  const coinList = Object.values(TestnetCoin)
  const amountList = [10, 1000000, 1000000000000, 1000000000000000]
  const fixInputOrOutput = [true, false]
  let allCoinAsset: CoinAsset[] = []

  beforeAll(async () => {
    // Load router graph for fallback functionality
    const coinMap = new Map()
    const poolMap = new Map()

    const resp: any = await fetch(sdk.sdkOptions.swapCountUrl!, { method: 'GET' })
    const poolsInfo = await resp.json()

    if (poolsInfo.code === 200) {
      for (const pool of poolsInfo.data.pools) {
        if (pool.is_closed) {
          continue
        }

        let coin_a = pool.coin_a.address
        let coin_b = pool.coin_b.address

        coinMap.set(coin_a, {
          address: pool.coin_a.address,
          decimals: pool.coin_a.decimals,
        })
        coinMap.set(coin_b, {
          address: pool.coin_b.address,
          decimals: pool.coin_b.decimals,
        })

        const pair = `${coin_a}-${coin_b}`
        const pathProvider = poolMap.get(pair)
        if (pathProvider) {
          pathProvider.addressMap.set(Number(pool.fee) * 100, pool.address)
        } else {
          poolMap.set(pair, {
            base: coin_a,
            quote: coin_b,
            addressMap: new Map([[Number(pool.fee) * 100, pool.address]]),
          })
        }
      }
    }

    console.log("poolMap.size: ", poolMap.size)
    console.log("coinMap.size: ", coinMap.size)

    const coins: CoinProvider = {
      coins: Array.from(coinMap.values()),
    }
    const paths: PathProvider = {
      paths: Array.from(poolMap.values()),
    }

    // Load graph for fallback routing
    sdk.Router.loadGraph(coins, paths)

    // Prepare all coin assets
    allCoinAsset = await sdk.getOwnerCoinAssets(sdk.senderAddress)
  })

  // ===== PRIMARY ROUTING TESTS =====

})

// ===== UTILITY FUNCTIONS =====

export function verifyBalanceEnough(allCoins: CoinAsset[], coinType: string, amount: string): boolean {
  const coinAssets: CoinAsset[] = CoinAssist.getCoinAssets(coinType, allCoins)
  const amountTotal = CoinAssist.calculateTotalBalance(coinAssets)
  return amountTotal >= BigInt(amount)
}

export async function execTx(
  sdk: FerraDammSDK,
  simulate: boolean,
  payload: Transaction,
  sendKeypair: Ed25519Keypair | Secp256k1Keypair
) {
  if (simulate) {
    const { simulationAccount } = sdk.sdkOptions
    const simulateRes = await sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: payload,
      sender: simulationAccount.address,
    })
    return simulateRes
  } else {
    const transferTxn = await sdk.fullClient.sendTransaction(sendKeypair, payload)
    console.log('Executed transaction:', transferTxn)
    return transferTxn!
  }
}

export async function execTxReturnRes(sdk: FerraDammSDK, payload: Transaction) {
  const { simulationAccount } = sdk.sdkOptions
  const simulateRes = await sdk.fullClient.devInspectTransactionBlock({
    transactionBlock: payload,
    sender: simulationAccount.address,
  })
  return simulateRes
}
