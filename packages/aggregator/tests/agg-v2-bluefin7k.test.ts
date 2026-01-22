// test/swap-bluefin.test.ts
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fromBase64 } from '@mysten/sui/utils'
import { inspect } from 'util'
import { initMainnetAggV2SDK } from '../src/config'
import { AggProvider } from '../src/types'

/**
 * Test script for Bluefin7k Aggregator integration
 *
 * Flow:
 * 1. Initialize SDK with Bluefin7k provider using initMainnetAggV2SDK
 * 2. Get quote for SUI -> USDC swap via Bluefin7k
 * 3. Build swap transaction using the quote (through Ferra contract)
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
    // Use initMainnetAggV2SDK with Bluefin7k provider
    const sdk = initMainnetAggV2SDK(AggProvider.BLUEFIN, wallet)

    console.log('📦 SDK initialized with provider:', AggProvider.BLUEFIN)

    // ============ Test Configuration ============
    const TEST = true // Set to false to execute real transaction

    // Swap parameters
    const SUI_TYPE = '0x2::sui::SUI'
    const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'
    const AMOUNT_IN = '10000000' // 0.01 SUI (9 decimals)

    try {
        // ============ Step 1: Get Quote ============
        console.log('\n📊 Step 1: Fetching quote from Bluefin7k...')
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

        console.log('\n📝 Raw Quote Response:')
        console.log(inspect(quote, { depth: 3, colors: true }))

        if (!quote) {
            throw new Error('No quote found for SUI -> USDC swap via Bluefin7k')
        }

        console.log('\n✅ Quote received:')
        console.log('- Provider:', quote.provider)
        console.log('- Amount In:', formatAmount(BigInt(AMOUNT_IN), 9), 'SUI')
        console.log('- Expected Out:', formatAmount(BigInt(quote.amountOut || '0'), 6), 'USDC')

        // Bluefin7k specific quote info
        const bluefinQuote = quote.quote as any
        if (bluefinQuote?.routes) {
            console.log('- Routes Count:', bluefinQuote.routes.length)
            bluefinQuote.routes.forEach((route: any, idx: number) => {
                console.log(`  Route ${idx + 1}:`)
                console.log(`    - Amount In: ${route.amountIn || route.amount}`)
                console.log(`    - Amount Out: ${route.amountOut || route.returnAmount}`)
                if (route.paths) {
                    console.log(`    - Paths: ${route.paths.length}`)
                    route.paths.forEach((path: any, pathIdx: number) => {
                        console.log(`      Path ${pathIdx + 1}: ${path.source || path.protocol || 'unknown'} (${path.tokenIn?.split('::').pop()} -> ${path.tokenOut?.split('::').pop()})`)
                    })
                }
            })
        } else if (bluefinQuote?.swaps) {
            console.log('- Swaps Count:', bluefinQuote.swaps.length)
            bluefinQuote.swaps.forEach((swap: any, idx: number) => {
                console.log(`  Swap ${idx + 1}:`)
                console.log(`    - Protocol: ${swap.protocol || swap.source || 'unknown'}`)
                console.log(`    - Pool: ${swap.pool?.id || swap.poolId || 'unknown'}`)
            })
        }

        // ============ Step 2: Build Swap Transaction ============
        console.log('\n🔨 Step 2: Building swap transaction via Ferra...')

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
        console.log('- Min Amount Out:', formatAmount(
            BigInt(quote.amountOut || '0') * BigInt(10000 - slippageBps) / BigInt(10000),
            6
        ), 'USDC')

        // Set gas budget
        tx.setGasBudget(50_000_000) // 0.05 SUI

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

                // Show more debug info
                console.error('\n📋 Transaction Details:')

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

            // Find and parse swap events (Ferra events)
            const ferraEvents = result.events?.filter(e =>
                e.type.includes('ferra_aggregator') ||
                e.type.includes('StartSwapEvent') ||
                e.type.includes('ConfirmSwapEvent') ||
                e.type.includes('SwapEvent') ||
                e.type.includes('bluefin')
            )

            if (ferraEvents && ferraEvents.length > 0) {
                console.log('\n📈 Ferra/Swap Events:')
                ferraEvents.forEach((event, index) => {
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
        console.log('- Provider:', quote.provider, '(via Ferra)')
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

// bun ./tests/agg-v2-bluefin.test.ts