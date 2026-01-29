import Decimal from 'decimal.js'
import d from 'decimal.js'
import { buildOracleAccount, buildTestAccount } from '.'
import { initFerraSDK } from '../src/config'
import { inspect } from 'util'
import { bcs } from '@mysten/sui/bcs'
import { PublicKey } from '@mysten/sui/cryptography'
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import { normalizeSuiAddress, toHex } from '@mysten/sui/utils'

const DcaMessage = bcs.struct('DcaMessage', {
  inCoin: bcs.String,
  sender: bcs.Address,
  cycle_frequency: bcs.U64,
  cycle_count: bcs.U64,
  in_amount_limit_per_cycle: bcs.U64,
  in_amount_per_cycle: bcs.U64,
  fee_rate: bcs.U64,
  oracle_timestamp: bcs.U64,
})

async function normalizedAddress(address: string) {
  const parts = address.split('::')
  const normalizedAddress = normalizeSuiAddress(parts[0])
  const normalizedTokenType = `${normalizedAddress.replace('0x', '')}::${parts[1]}::${parts[2]}`
  return normalizedTokenType
}

async function main() {
  const sdk = initFerraSDK({ network: 'testnet' })
  const wallet = buildTestAccount()
  const oracleWallet = buildOracleAccount()

  const orders = await sdk.Dca.getDcaOrders(wallet.toSuiAddress())
  console.log('orders', orders)

  sdk.senderAddress = wallet.getPublicKey().toSuiAddress()
  const in_coin_type = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'
  const out_coin_type = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
  const cycle_count = 4
  const in_coin_amount = (0.1 * 10 ** 9).toString()
  const cycle_count_amount = new Decimal(in_coin_amount).div(Math.pow(10, 9)).div(cycle_count)
  const min_price = 0.83854
  const max_price = 2.172898
  const per_cycle_max_out_amount = d(cycle_count_amount).div(d(min_price)).mul(Math.pow(10, 6)).toFixed(0).toString()
  const per_cycle_min_out_amount = d(cycle_count_amount).div(d(max_price)).mul(Math.pow(10, 6)).toFixed(0).toString()
  console.log('🚀🚀🚀 ~ file: dca.test.ts:36 ~ test ~ per_cycle_max_out_amount:', per_cycle_min_out_amount, per_cycle_max_out_amount)

  const time = Number(((Date.now() + 100 * 1000) / 1000).toFixed(0))
  const in_amount_per_cycle = new Decimal(in_coin_amount).div(cycle_count).toFixed(0) // v0

  const inCoinBytes = new TextEncoder().encode(await normalizedAddress(in_coin_type)) // ASCII bytes
  const senderBytes = bcs.Address.serialize(wallet.toSuiAddress()).toBytes()
  const cycleFrequencyBytes = bcs.U64.serialize(600).toBytes()
  const cycleCountBytes = bcs.U64.serialize(in_amount_per_cycle).toBytes() // v0 = in_amount / cycle_count
  const inAmountLimitBytes = bcs.U64.serialize((0.095 * 10 ** 9).toString()).toBytes()
  const cycleCountParamBytes = bcs.U64.serialize(cycle_count).toBytes()
  const feeRateBytes = bcs.U64.serialize(0).toBytes()
  const timestampBytes = bcs.U64.serialize(time).toBytes()
  const message = new Uint8Array([
    ...inCoinBytes,
    ...senderBytes,
    ...cycleFrequencyBytes,
    ...cycleCountBytes,
    ...inAmountLimitBytes,
    ...cycleCountParamBytes,
    ...feeRateBytes,
    ...timestampBytes,
  ])
  const signatureBytes = await oracleWallet.sign(message)
  const publicKeyBytes = oracleWallet.getPublicKey().toRawBytes()

  const serializedSignature = new Uint8Array(1 + signatureBytes.length + publicKeyBytes.length)
  serializedSignature.set([0x00], 0) // Scheme Ed25519
  serializedSignature.set(signatureBytes, 1)
  serializedSignature.set(publicKeyBytes, 1 + signatureBytes.length)
  const signature = toHex(serializedSignature)

  const payload = await sdk.Dca.dcaOpenOrderPayload({
    inCoinType: in_coin_type,
    outCoinType: out_coin_type,
    inCoinAmount: in_coin_amount,
    cycleFrequency: 600,
    cycleCount: cycle_count,
    perCycleMinOutAmount: per_cycle_min_out_amount,
    perCycleMaxOutAmount: per_cycle_max_out_amount,
    perCycleInAmountLimit: (0.095 * 10 ** 9).toString(),
    feeRate: 0,
    timestamp: time,
    signature: signature,
  })

  console.log(inspect(payload, { depth: null, colors: true }))
  const result = await sdk.fullClient.dryRunTransactionBlock({
    transactionBlock: await payload.build({ client: sdk.fullClient }),
  })
  console.log('redeemDividendPayload: ', result)
}

main()
