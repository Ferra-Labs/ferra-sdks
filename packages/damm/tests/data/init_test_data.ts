import { CoinAssist, Package } from '../../src'
import { FerraDammSDK } from '../../src/sdk'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { getObjectPreviousTransactionDigest } from '../../src/utils/objects'
import { SDK } from './init_mainnet_sdk'
import { TestnetSDK } from './init_testnet_sdk'
import dotenv from 'dotenv'

const envConfig = dotenv.config()

export const PositionObjectID = '0x7cea8359f50318d88026d702462df7ce9d96a5b12f3efe9dce6d6450fba779a0'
export const PoolObjectID = '0xcf994611fd4c48e277ce3ffd4d4364c914af2c3cbb05f7bf6facd371de688630'

export const USDT_USDC_POOL_10 = '0x40c2dd0a9395b1f15a477f0e368c55651b837fd27765395a9412ab07fc75971c'

export async function mintAll(sdk: FerraDammSDK, sendKeypair: Ed25519Keypair, faucet: Package, funName: string) {
  const objects = await sdk.fullClient.getObject({ id: faucet.package_id, options: { showPreviousTransaction: true } })
  const previousTx = getObjectPreviousTransactionDigest(objects)
  console.log('previousTx', previousTx)
  if (previousTx) {
    const txResult: any = await sdk.Pool.getSuiTransactionResponse(previousTx)

    if (txResult) {
      const faucetCoins = CoinAssist.getFaucetCoins(txResult)
      console.log('faucetCoins: ', faucetCoins)

      const tx = new Transaction()

      faucetCoins.forEach((coin) => {
        tx.moveCall({
          target: `${faucet.published_at}::${coin.transactionModule}::${funName}`,
          typeArguments: [],
          arguments: [tx.object(coin.suplyID)],
        })
      })

      const result = await sdk.fullClient.sendTransaction(sendKeypair, tx)
      console.log('result: ', result)
    }
  }
}

export enum SdkEnv {
  mainnet = 'mainnet',
  testnet = 'testnet',
}
export let currSdkEnv = SdkEnv.testnet

export function buildSdk(sdkEnv: SdkEnv = currSdkEnv): FerraDammSDK {
  currSdkEnv = sdkEnv
  switch (currSdkEnv) {
    case SdkEnv.mainnet:
      return SDK
    case SdkEnv.testnet:
      return TestnetSDK
    default:
      throw Error('not match SdkEnv')
  }
}

export async function buildTestPool(sdk: FerraDammSDK, poolObjectId: string) {
  const pool = await sdk.Pool.getPool(poolObjectId)
  console.log('buildPool: ', pool)
  return pool
}

export async function buildTestPosition(sdk: FerraDammSDK, posObjectId: string) {
  const position = await sdk.Position.getSimplePosition(posObjectId)
  console.log('buildTestPosition: ', position)
  return position
}

export function buildTestAccount(): Ed25519Keypair {
  const testAccountObject = Ed25519Keypair.deriveKeypair(envConfig?.parsed?.SUI_WALLET_MNEMONICS || '')
  console.log(' Address: ', testAccountObject.getPublicKey().toSuiAddress())

  return testAccountObject
}

export enum TestnetCoin {
  USDC = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  USDT = '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
  ETH = '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',
  SUI = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  FERRA = '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::ferra::FERRA',
  NAVX = '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX',
}

export enum MainnetCoin {
  USDC = '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  USDT = '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
  ETH = '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',
  SUI = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  FERRA = '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::ferra::FERRA',
  NAVX = '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX',
}
