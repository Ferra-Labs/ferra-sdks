// test/swap-v2.test.ts
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'
import { inspect } from 'util'
import { initMainnetAggV2SDK } from '../src/config'
import { AggProvider } from '../src/types'

/**
 * Test script for AggSwapV2Module and QuoterV2Module
 *
 * Flow:
 * 1. Initialize SDK with Cetus provider using initMainnetAggV2SDK
 * 2. Get quote for SUI -> USDC swap
 * 3. Build swap transaction using the quote
 * 4. Dry run or execute transaction
 */
export async function main() {
  // ============ Setup Wallet ============
  const secret = process.env.SUI_WALLET_SECRET || ''
  const mnemonic = process.env.SUI_WALLET_MNEMONICS || ''
  let keypair: Ed25519Keypair

  if (secret && secret.length > 0) {
    keypair = Ed25519Keypair.fromSecretKey(fromBase64(secret).slice(1, 33))
  } else {
    keypair = Ed25519Keypair.deriveKeypair(mnemonic)
  }

  const wallet = keypair.getPublicKey().toSuiAddress()

  console.log('🔑 Wallet address:', wallet)

  // ============ Initialize SDK ============
  // Use initMainnetAggV2SDK with Cetus provider
  const sdk = initMainnetAggV2SDK(AggProvider.CETUS, wallet, {
    providers: {
      cetus: {
        depth: 1,
      }
    }
  })
  // console.log(sdk)

  console.log('📦 SDK initialized with provider:', AggProvider.CETUS)

  // ============ Test Configuration ============
  const TEST = true // Set to false to execute real transaction

  // Swap parameters
  const SUI_TYPE = '0x2::sui::SUI'
  const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
  const AMOUNT_IN = '10000000' // 0.01 SUI (9 decimals)

  try {
    // ============ Step 1: Get Quote ============
    console.log('\n📊 Step 1: Fetching quote...')
    console.log('- From:', SUI_TYPE)
    console.log('- To:', USDC_TYPE)
    console.log('- Amount:', formatAmount(BigInt(AMOUNT_IN), 9), 'SUI')

    const quote = await sdk.Quoter.getBestQuotes(
      {
        coinTypeIn: SUI_TYPE,
        coinTypeOut: USDC_TYPE,
        amountIn: AMOUNT_IN,
      },
      { sender: wallet }
    )

    console.log(quote)

    if (!quote) {
      throw new Error('No quote found for SUI -> USDC swap')
    }

    console.log('\n✅ Quote received:')
    console.log('- Provider:', quote.provider)
    console.log('- Amount In:', formatAmount(BigInt(AMOUNT_IN), 9), 'SUI')
    console.log('- Expected Out:', formatAmount(BigInt(quote.amountOut || '0'), 6), 'USDC')
    console.log('- Quote ID:', (quote.quote as any)?.quoteID || 'N/A')

    // ============ Step 2: Build Swap Transaction ============
    console.log('\n🔨 Step 2: Building swap transaction...')

    const slippageBps = 100 // 1% slippage

    const tx = await sdk.AggSwap.swap(
      {
        fromType: SUI_TYPE,
        targetType: USDC_TYPE,
        amountIn: AMOUNT_IN,
        amountOut: quote.amountOut?.toString() || '0',
        quote: quote,
      },
      slippageBps
    )

    if (!tx) {
      throw new Error('Failed to build swap transaction')
    }

    console.log('✅ Transaction built successfully')
    console.log('- Slippage:', slippageBps / 100, '%')

    // Set gas budget
    tx.setGasBudget(10_000_000) // 0.01 SUI

    // ============ Step 3: Execute or Dry Run ============
    let result

    if (TEST) {
      // Dry run the transaction
      console.log('\n🧪 Step 3: Running dry run...')

      result = await sdk.fullClient.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client: sdk.fullClient }),
      })

      // Check if transaction would succeed
      if (result.effects?.status?.status !== 'success') {
        console.error('\n❌ Transaction would fail!')
        console.error('Status:', result.effects?.status)
        if (result.effects?.status?.error) {
          console.error('Error:', result.effects.status.error)
        }
        return
      }

      console.log('\n✅ Dry run successful!')

      // Calculate gas cost
      const gasUsed = result.effects!.gasUsed
      const gasCost =
        BigInt(gasUsed.storageCost) -
        BigInt(gasUsed.storageRebate) +
        BigInt(gasUsed.computationCost)

      console.log('\n⛽ Gas Analysis:')
      console.log('- Storage Cost:', formatSUI(gasUsed.storageCost))
      console.log('- Storage Rebate:', formatSUI(gasUsed.storageRebate))
      console.log('- Computation Cost:', formatSUI(gasUsed.computationCost))
      console.log('- Total Gas Fee:', formatSUI(gasCost.toString()))

      // Find and parse swap events
      const swapEvents = result.events?.filter(e =>
        e.type.includes('SwapEvent') ||
        e.type.includes('swap') ||
        e.type.includes('Swap')
      )

      if (swapEvents && swapEvents.length > 0) {
        console.log('\n📈 Swap Events:')
        swapEvents.forEach((event, index) => {
          console.log(`\n  Event ${index + 1}:`)
          console.log('  - Type:', event.type)
          if (event.parsedJson) {
            console.log('  - Data:', inspect(event.parsedJson, { depth: null, colors: true }))
          }
        })
      }

      // Show balance changes
      if (result.balanceChanges && result.balanceChanges.length > 0) {
        console.log('\n💰 Expected Balance Changes:')
        result.balanceChanges.forEach(change => {
          const amount = BigInt(change.amount)
          const symbol = amount >= 0n ? '+' : ''
          const coinSymbol = getCoinSymbol(change.coinType)
          const decimals = getDecimals(change.coinType)
          console.log(`- ${coinSymbol}: ${symbol}${formatAmount(amount, decimals)}`)
        })
      }

    } else {
      // Execute the actual transaction
      console.log('\n💸 Step 3: Executing swap transaction...')

      result = await sdk.fullClient.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
          showBalanceChanges: true,
        }
      })

      console.log('\n✅ Transaction executed successfully!')
      console.log('- Digest:', result.digest)
      console.log('- Status:', result.effects?.status?.status)

      // Show actual balance changes
      if (result.balanceChanges) {
        console.log('\n💰 Actual Balance Changes:')
        result.balanceChanges.forEach(change => {
          const amount = BigInt(change.amount)
          const symbol = amount >= 0n ? '+' : ''
          const coinSymbol = getCoinSymbol(change.coinType)
          const decimals = getDecimals(change.coinType)
          console.log(`- ${coinSymbol}: ${symbol}${formatAmount(amount, decimals)}`)
        })
      }

      // Explorer link
      console.log(`\n🔗 View on explorer: https://suiscan.xyz/mainnet/tx/${result.digest}`)
    }

    // ============ Final Summary ============
    console.log('\n' + '='.repeat(50))
    console.log('📋 Summary:')
    console.log('='.repeat(50))
    console.log('- Mode:', TEST ? 'DRY RUN' : 'EXECUTED')
    console.log('- Provider:', quote.provider)
    console.log('- Swap:', `${formatAmount(BigInt(AMOUNT_IN), 9)} SUI → USDC`)
    console.log('- Expected Output:', formatAmount(BigInt(quote.amountOut || '0'), 6), 'USDC')
    console.log('- Slippage:', slippageBps / 100, '%')
    console.log('- Status:', result.effects?.status?.status || 'Unknown')
    console.log('- Timestamp:', new Date().toLocaleString())

  } catch (error: any) {
    console.error('\n❌ Error:', error.message)
    if (error.cause) {
      console.error('Cause:', inspect(error.cause, { depth: null, colors: true }))
    }
    if (error.stack) {
      console.error('\nStack trace:', error.stack)
    }
  }
}

// ============ Helper Functions ============

function formatSUI(amount: string | number | bigint): string {
  const value = Number(amount) / 10 ** 9
  return `${value.toFixed(6)} SUI`
}

function formatAmount(amount: bigint, decimals: number): string {
  const isNegative = amount < 0n
  const absAmount = isNegative ? -amount : amount
  const divisor = BigInt(10 ** decimals)
  const whole = absAmount / divisor
  const fraction = absAmount % divisor

  let result: string
  if (fraction === 0n) {
    result = whole.toString()
  } else {
    const fractionStr = fraction.toString().padStart(decimals, '0')
    const trimmed = fractionStr.replace(/0+$/, '')
    result = trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString()
  }

  return isNegative ? `-${result}` : result
}

function getCoinSymbol(coinType: string): string {
  if (coinType.includes('::sui::SUI')) return 'SUI'
  if (coinType.includes('::usdc::USDC')) return 'USDC'
  if (coinType.includes('::usdt::USDT')) return 'USDT'

  const parts = coinType.split('::')
  return parts[parts.length - 1] || coinType
}

function getDecimals(coinType: string): number {
  if (coinType.includes('::sui::SUI')) return 9
  if (coinType.includes('::usdc::USDC')) return 6
  if (coinType.includes('::usdt::USDT')) return 6
  return 9
}

// ============ Run Script ============
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}


//bun ./tests/agg-v2.test.ts