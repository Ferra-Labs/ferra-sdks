import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'
import { inspect } from 'util'
import { initFerraAggregatorSDK } from '../src/config'
import { DexOrigins, DexTypes, TradingRoute } from '../src/interfaces'

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
  const sdk = initFerraAggregatorSDK({ network: 'testnet', wallet })

  console.log('🔑 Wallet address:', wallet)

  const TEST = true // Set to false to execute real transaction

  const data:TradingRoute[] = [
    {
      "percent": "51.93",
      "inputAmount": "519300000",
      "outputAmount": "1142884467",
      "pathIndex": 0,
      "lastQuoteOutput": "1142884467",
      "swapStep": [
        {
          "direction": true,
          "type": DexTypes.CLMM,
          "origin": DexOrigins.Ferra,
          "poolAddress": "0xeb7e93a0e97fe2d36414e88e62f804f0ff6c55951c116eb39149753d8380553e",
          "coinIn": "0xb8e7c81766a2cd73869c41a8b05f81f466189d81889f2244c41b81d6a5e664fd::ferr::FERR",
          "coinOut": "0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC",
          "feeRate": 0.1,
          "amountOut": "1142891",
          "amountIn": "519300000",
          "currentSqrtPrice": "865392182273710464",
          "decimalsIn": 9,
          "decimalsOut": 6,
          "currentPrice": "0.0022008299634122857693"
        },
        {
          "direction": true,
          "type": DexTypes.CLMM,
          "origin": DexOrigins.Ferra,
          "poolAddress": "0x46b8c5de79023e4834ca7aaab7a0ed005c4d23481138035cae62c017b6b9ae5e",
          "coinIn": "0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC",
          "coinOut": "0x7c624b1ca63ae2817809841092c177c8ad298964a8bec331b7df943f489c9d69::Dai::DAI",
          "feeRate": 0.01,
          "amountOut": "1142884467",
          "amountIn": "1142891",
          "currentSqrtPrice": "583335599631076491264",
          "decimalsIn": 6,
          "decimalsOut": 9,
          "currentPrice": "999.9942837943425926"
        }
      ]
    },
    {
      "percent": "32.45",
      "inputAmount": "324500000",
      "outputAmount": "833204247",
      "pathIndex": 1,
      "lastQuoteOutput": "833204247",
      "swapStep": [
        {
          "direction": true,
          "type": DexTypes.CLMM,
          "origin": DexOrigins.Ferra,
          "poolAddress": "0xeb7e93a0e97fe2d36414e88e62f804f0ff6c55951c116eb39149753d8380553e",
          "coinIn": "0xb8e7c81766a2cd73869c41a8b05f81f466189d81889f2244c41b81d6a5e664fd::ferr::FERR",
          "coinOut": "0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC",
          "feeRate": 0.1,
          "amountOut": "714176",
          "amountIn": "324500000",
          "currentSqrtPrice": "865396227602847488",
          "decimalsIn": 9,
          "decimalsOut": 6,
          "currentPrice": "0.0022008505392912172573"
        },
        {
          "direction": true,
          "type": DexTypes.CLMM,
          "origin": DexOrigins.Ferra,
          "poolAddress": "0x1dc3a8b3bc47509d3f966dcbece179b936e4cba889292fd916f7a7626739dd7c",
          "coinIn": "0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC",
          "coinOut": "0x7c624b1ca63ae2817809841092c177c8ad298964a8bec331b7df943f489c9d69::Dai::DAI",
          "feeRate": 0.005,
          "amountOut": "833204247",
          "amountIn": "714176",
          "currentSqrtPrice": "630075850304930971648",
          "decimalsIn": 6,
          "decimalsOut": 9,
          "currentPrice": "1166.6651455663589927"
        }
      ]
    },
    {
      "percent": "15.63",
      "inputAmount": "156300000",
      "outputAmount": "143626452",
      "pathIndex": 2,
      "lastQuoteOutput": "143626452",
      "swapStep": [
        {
          "direction": true,

          "type": DexTypes.DLMM,
          "origin": DexOrigins.Ferra,
          "poolAddress": "0xd1c1522662c05c4b99ffe0cd23f95f1b3949129756aa98fc6e4fa0a3018fb215",
          "coinIn": "0xb8e7c81766a2cd73869c41a8b05f81f466189d81889f2244c41b81d6a5e664fd::ferr::FERR",
          "coinOut": "0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC",
          "feeRate": 0.1,
          "amountOut": "77376",
          "amountIn": "156300000",
          "currentSqrtPrice": "410434038493899328",
          "decimalsIn": 9,
          "decimalsOut": 6,
          "currentPrice": "0.00049504798464491362764"
        },
        {
          "direction": true,
          "type": DexTypes.CLMM,
          "origin": DexOrigins.Ferra,
          "poolAddress": "0x1dc3a8b3bc47509d3f966dcbece179b936e4cba889292fd916f7a7626739dd7c",
          "coinIn": "0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC",
          "coinOut": "0x7c624b1ca63ae2817809841092c177c8ad298964a8bec331b7df943f489c9d69::Dai::DAI",
          "feeRate": 0.005,
          "amountOut": "143626452",
          "amountIn": "77376",
          "currentSqrtPrice": "794755974187503452160",
          "decimalsIn": 6,
          "decimalsOut": 9,
          "currentPrice": "1856.214485111662531"
        }
      ]
    }
  ]

  try {
    // Build swap transaction
    const tx = await sdk.AggSwap.swapWithTradingRoutes(data)

    if (!tx) {
      throw new Error('Failed to build swap transaction')
    }

    // Set gas budget
    tx.setGasBudget(100_000_000) // 0.1 SUI

    let result

    if (TEST) {
      // Dry run the transaction
      console.log('\n🧪 Running dry run...')

      result = await sdk.fullClient.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client: sdk.fullClient }),
      })
      console.log(`result = `, result)

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

      // Find and parse swap event
      const swapEvent = result.events?.find(e =>
        e.type.includes('SwapEvent') ||
        e.type.includes('ClmmSwapEvent') ||
        e.type.includes('DlmmSwapEvent')
      )

      if (swapEvent && swapEvent.parsedJson) {
        console.log('\n📈 Swap Event Details:')
        console.log(inspect(swapEvent.parsedJson, { depth: null, colors: true }))




      } else {
        console.log('\n⚠️  No swap event found in dry run results')
      }

      // Show balance changes
      if (result.balanceChanges && result.balanceChanges.length > 0) {
        console.log('\n💰 Expected Balance Changes:')
        result.balanceChanges.forEach(change => {
          const amount = BigInt(change.amount)
          const symbol = amount >= 0n ? '+' : ''
          console.log(`- ${change.coinType}:`)
          console.log(`  ${symbol}${formatAmount(amount, 9)}`)
        })
      }

      // Show object changes
      if (result.objectChanges && result.objectChanges.length > 0) {
        console.log('\n📦 Object Changes:', result.objectChanges.length, 'objects affected')
      }

    } else {
      // Execute the actual transaction
      console.log('\n💸 Executing swap transaction...')

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
      console.log('- Status:', result.effects?.status)

      // Parse executed transaction events
      const swapEvent = result.events?.find(e =>
        e.type.includes('SwapEvent')
      )

      if (swapEvent?.parsedJson) {
        const eventData = swapEvent.parsedJson as any
        console.log('\n💱 Actual Swap Results:')
        console.log('- Amount In:', eventData.amount_in || eventData.amountIn)
        console.log('- Amount Out:', eventData.amount_out || eventData.amountOut)
      }

      // Show actual balance changes
      if (result.balanceChanges) {
        console.log('\n💰 Actual Balance Changes:')
        result.balanceChanges.forEach(change => {
          console.log(`- ${change.coinType}: ${formatAmount(BigInt(change.amount), 9)}`)
        })
      }

      // Explorer link
      console.log(`\n🔗 View on explorer: https://suiscan.xyz/testnet/tx/${result.digest}`)
    }

    // Final summary
    console.log('\n📋 Summary:')
    console.log('- Mode:', TEST ? 'DRY RUN' : 'EXECUTED')
    console.log('- Status:', TEST ? result.effects?.status?.status : 'Check explorer')
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

// Helper functions
function formatSUI(amount: string | number | bigint): string {
  const value = Number(amount) / 10 ** 9
  return `${value.toFixed(6)} SUI`
}

function formatAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals)
  const whole = amount / divisor
  const fraction = amount % divisor

  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionStr = fraction.toString().padStart(decimals, '0')
  // Remove trailing zeros
  const trimmed = fractionStr.replace(/0+$/, '')

  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString()
}

// Run the script
if (process.argv[process.argv.length - 1] === __filename || require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}