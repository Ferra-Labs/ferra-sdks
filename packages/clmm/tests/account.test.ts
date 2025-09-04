import BN from 'bn.js'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildSdk, buildTestAccount, SdkEnv } from './data/init_test_data'
import { coinWithBalance, Transaction } from '@mysten/sui/transactions'

let sendKeypair: Ed25519Keypair

describe('account function test', () => {
  const sdk = buildSdk(SdkEnv.mainnet)

  beforeEach(async () => {
    sendKeypair = buildTestAccount()
    sdk.senderAddress = sendKeypair.getPublicKey().toSuiAddress()
  })
  test('test coinWithBalance', async () => {
    const tx = new Transaction()

    // tx.setSender(sdk.senderAddress)

    tx.transferObjects([coinWithBalance({ balance: 0, useGasCoin: false })], sdk.senderAddress)

    tx.transferObjects(
      [coinWithBalance({ balance: 0, type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC' })],
      sdk.senderAddress
    )

    // const res = await sdk.fullClient.devInspectTransactionBlock({
    //   transactionBlock: tx,
    //   sender: sdk.senderAddress,
    // })
    const res = await sdk.fullClient.sendTransaction(sendKeypair, tx)
    console.log('🚀 ~ test ~ res:', res)
  })
})
