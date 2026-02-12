import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { d, initFerraSDK, TickMath } from '../src'
import { buildTestAccount } from './data/init_test_data'
import { bcs, fromB64, fromBase64 } from '@mysten/bcs'
import { BN } from 'bn.js'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { Transaction } from '@mysten/sui/transactions'

BN.prototype.toJSON = function () {
  return this.toString()
}

async function main() {
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
  const sdk = initFerraSDK({ network: 'testnet', wallet })

  sdk.senderAddress = keypair.toSuiAddress()
  const tick_spacing = 2
  const initialize_price = 1
  const coin_a_decimals = 9
  const coin_b_decimals = 9
  const coin_type_a = `0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::ferra::FERRA`
  const coin_type_b = `0x2::sui::SUI`

  const pool = await sdk.Pool.getPool('0x628b386c50d4218a53689b1e6e9feeb1ebde2743e8f9fc8ac99e8fb308613c92')
  console.log('pool', pool)

  // const tx = new Transaction()
  // tx.setSender(wallet)
  // const [parameters] = tx.moveCall({
  //   target: '0xde469e3fc61037aef6394bc9e61b6785e0541f2f4f82dc06ca339fc9266602c5::pool::get_pair_parameters',
  //   arguments: [tx.object('0x628b386c50d4218a53689b1e6e9feeb1ebde2743e8f9fc8ac99e8fb308613c92')],
  //   typeArguments: [pool.coinTypeA, pool.coinTypeB],
  // })

  // tx.moveCall({
  //   target: '0xde469e3fc61037aef6394bc9e61b6785e0541f2f4f82dc06ca339fc9266602c5::pair_parameter_helper::get_base_fee',
  //   arguments: [parameters, tx.pure.u64(Date.now())],
  // })

  // const rates = await sdk.fullClient.devInspectTransactionBlock({
  //   transactionBlock: tx,
  //   sender: wallet
  // })

  // console.log('==========================>', rates.results[1].returnValues[0][0]);
  // console.log('==========================>', bcs.u64().parse(new Uint8Array(rates.results[1].returnValues[0][0])));
  

  if (pool) {
    const ticks = await sdk.Pool.fetchTicks({
      pool_id: pool.poolAddress,
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
    })
    const res = sdk.Swap.calculateRates({
      byAmountIn: true,
      currentPool: pool,
      swapTicks: ticks,
      a2b: true,
      amount: new BN(28180978),
      decimalsA: 9,
      decimalsB: 9,
    })


    const res2 = await sdk.Swap.preswap({
      pool: pool,
      a2b: true,
      amount: (28180978).toString(),
      byAmountIn: true,
      decimalsA: 9,
      decimalsB: 9,
      currentSqrtPrice: Number('3274739578372501086'),
      coinTypeA: '0x3a304c7feba2d819ea57c3542d68439ca2c386ba02159c740f7b406e592c62ea::haedal::HAEDAL',
      coinTypeB: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    })

    console.log('rates', res2)
    console.log('res', JSON.parse(JSON.stringify(res)))
  }
}

main()
