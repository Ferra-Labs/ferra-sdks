import BN from 'bn.js'
import { Graph, GraphEdge, GraphVertex } from '@syntsugar/cc-graph'
import { Transaction } from '@mysten/sui/transactions'
import { PreSwapLpChangeParams, PreSwapWithMultiPoolParams } from '../types'
import { checkValidSuiAddress, extractStructTagFromType } from '../utils'
import { ClmmExpectSwapModule, ClmmIntegrateRouterModule, SuiAddressType } from '../types/sui'
import { FerraClmmSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { U64_MAX, ZERO } from '../math'
import { ClmmpoolsError, ConfigErrorCode, RouterErrorCode } from '../errors/errors'
import Decimal from '../utils/decimal'
import { isValidSuiAddress, normalizeStructTag } from '@mysten/sui/utils'

// Represents a coin node in the coin mapping system
export interface CoinNode {
  address: string
  decimals: number
}

// Provider interface for coin data
export interface CoinProvider {
  coins: CoinNode[]
}

// Represents a trading path link between two coins
export interface PathLink {
  base: string
  quote: string
  addressMap: Map<number, string>
}

// Provider interface for path data
export interface PathProvider {
  paths: PathLink[]
}

// Defines a single routing path with swap details
export type OnePath = {
  amountIn: BN
  amountOut: BN
  poolAddress: string[]
  a2b: boolean[]
  rawAmountLimit: BN[]
  isExceed: boolean
  coinType: string[]
}

// Base path information for routing calculations
export type BasePath = {
  direction: boolean
  label: string
  poolAddress: string
  fromCoin: string
  toCoin: string
  feeRate: number
  outputAmount: number
  inputAmount: number
  currentSqrtPrice: BN
  fromDecimal: number
  toDecimal: number
  currentPrice: Decimal
}

// Split path configuration for multi-path routing
export type SplitPath = {
  percent: number
  inputAmount: number
  outputAmount: number
  pathIndex: number
  lastQuoteOutput: number
  basePaths: BasePath[]
}

// Contains address mapping with directional information
export type AddressAndDirection = {
  addressMap: Map<number, string>
  direction: boolean
}

// Parameters for executing router-based swaps
export type SwapWithRouterParams = {
  paths: OnePath[]
  partner: string
  priceSlippagePoint: number
}

// Parameters for pre-calculating router swap operations
export type PreRouterSwapParams = {
  stepNums: number
  poolAB: string
  poolBC: string | undefined
  a2b: boolean
  b2c: boolean | undefined
  byAmountIn: boolean
  amount: BN
  coinTypeA: SuiAddressType
  coinTypeB: SuiAddressType
  coinTypeC: SuiAddressType | undefined
}

// Result of pre-swap calculations with optimal path information
export type PreSwapResult = {
  index: number
  amountIn: BN
  amountMedium: BN
  amountOut: BN
  targetSqrtPrice: BN[]
  currentSqrtPrice: BN[]
  isExceed: boolean
  stepNum: number
}

// Comprehensive result for the best internal routing option
export type BestInternalRouterResult = {
  amountIn: BN
  amountOut: BN
  paths: OnePath[]
  a2b: boolean
  b2c: boolean | undefined
  byAmountIn: boolean
  isExceed: boolean
  targetSqrtPrice: BN[]
  currentSqrtPrice: BN[]
  coinTypeA: SuiAddressType
  coinTypeB: SuiAddressType
  coinTypeC: SuiAddressType | undefined
  createTxParams: SwapWithRouterParams | undefined
}

// Pool information with total value locked (TVL) data
type PoolWithTvl = {
  poolAddress: string
  tvl: number
}

interface CoinInfo {
  address: string
  decimals: number
}

interface PoolInfo {
  address: string
  is_closed: boolean
  fee: number

  // Token information
  coin_a: CoinInfo
  coin_b: CoinInfo
}

interface GraphApiResponse {
  code: number
  pools: PoolInfo[]
}

/**
 * Creates trading pair symbols for both directions
 * @param baseCoin - Base coin identifier
 * @param quoteCoin - Quote coin identifier
 * @returns Object containing pair and reverse pair symbols
 */
function _pairSymbol(
  baseCoin: string,
  quoteCoin: string
): {
  pair: string
  reversePair: string
} {
  return {
    pair: `${baseCoin}-${quoteCoin}`,
    reversePair: `${quoteCoin}-${baseCoin}`,
  }
}

/**
 * Router module for finding optimal swap paths in CLMM pools
 * Handles pathfinding, route optimization, and swap execution across multiple pools
 * Supports both single-hop and multi-hop swaps with TVL-based routing prioritization
 */
export class RouterModule implements IModule {
  readonly graph: Graph

  readonly pathProviders: PathProvider[]

  private coinProviders: CoinProvider

  private _coinAddressMap: Map<string, CoinNode>

  private poolAddressMap: Map<string, Map<number, string>>

  private _isGraphLoaded: boolean = false

  protected _sdk: FerraClmmSDK

  constructor(sdk: FerraClmmSDK) {
    this.pathProviders = []
    this.coinProviders = {
      coins: [],
    }
    this.graph = new Graph(false)
    this._coinAddressMap = new Map()
    this.poolAddressMap = new Map()
    this._sdk = sdk

    // Bind all methods to maintain proper context
    this.getPoolAddressMapAndDirection = this.getPoolAddressMapAndDirection.bind(this)
    this.setCoinList = this.setCoinList.bind(this)
    this.loadGraph = this.loadGraph.bind(this)
    this.addCoinProvider = this.addCoinProvider.bind(this)
    this.addPathProvider = this.addPathProvider.bind(this)
    this.preRouterSwapA2B2C = this.preRouterSwapA2B2C.bind(this)
    this.getPoolWithTVL = this.getPoolWithTVL.bind(this)
    this.getBestInternalRouter = this.getBestInternalRouter.bind(this)
  }

  get sdk() {
    return this._sdk
  }

  get isGraphLoaded(): boolean {
    return this._isGraphLoaded
  }

  /**
   * Retrieves pool address mapping with trading direction
   * @param baseCoin - Base coin identifier
   * @param quoteCoin - Quote coin identifier
   * @returns Address mapping with direction information, or undefined if not found
   */
  getPoolAddressMapAndDirection(baseCoin: string, quoteCoin: string): AddressAndDirection | undefined {
    const { pair, reversePair } = _pairSymbol(baseCoin, quoteCoin)
    let poolAddressMapping: any = this.poolAddressMap.get(pair)

    if (poolAddressMapping != null) {
      return {
        addressMap: poolAddressMapping,
        direction: true,
      }
    }

    poolAddressMapping = this.poolAddressMap.get(reversePair)
    if (poolAddressMapping != null) {
      return {
        addressMap: poolAddressMapping,
        direction: false,
      }
    }
    return undefined
  }

  /**
   * Populates the coin address mapping with available coins
   */
  private setCoinList() {
    this.coinProviders.coins.forEach((coinData) => {
      this._coinAddressMap.set(coinData.address, coinData)
    })
  }

  /**
   * Initializes the routing graph with coin and path data
   * Must be called before finding optimal routes
   * @param coinData - All available coins
   * @param pathData - All available trading paths
   */
  loadGraph(coinData: CoinProvider, pathData: PathProvider) {
    this.addCoinProvider(coinData)
    this.addPathProvider(pathData)
    this.setCoinList()
    this._isGraphLoaded = true

    this.pathProviders.forEach((provider) => {
      const { paths } = provider
      paths.forEach((pathInfo) => {
        const vertexA = this.graph.getVertexByKey(pathInfo.base) ?? new GraphVertex(pathInfo.base)
        const vertexB = this.graph.getVertexByKey(pathInfo.quote) ?? new GraphVertex(pathInfo.quote)

        this.graph.addEdge(new GraphEdge(vertexA, vertexB))

        const baseCoinInfo: any = this._coinAddressMap.get(pathInfo.base)
        const quoteCoinInfo: any = this._coinAddressMap.get(pathInfo.quote)

        if (baseCoinInfo != null && quoteCoinInfo != null) {
          const pairSymbol = _pairSymbol(pathInfo.base, pathInfo.quote).pair
          this.poolAddressMap.set(pairSymbol, pathInfo.addressMap)
        }
      })
    })
  }

  /**
   * Adds a new path provider to the routing graph
   * @param provider - Path provider containing trading paths
   * @returns Current RouterModule instance for chaining
   */
  private addPathProvider(provider: PathProvider): RouterModule {
    // Normalize coin order in paths for consistency
    for (let pathIndex = 0; pathIndex < provider.paths.length; pathIndex += 1) {
      const { base, quote } = provider.paths[pathIndex]
      const lexicalComparison = base.localeCompare(quote)

      if (lexicalComparison < 0) {
        provider.paths[pathIndex].base = quote
        provider.paths[pathIndex].quote = base
      }

      // Special handling for SUI coin ordering
      if (base === '0x2::sui::SUI') {
        provider.paths[pathIndex].base = quote
        provider.paths[pathIndex].quote = base
      }

      if (quote === '0x2::sui::SUI') {
        provider.paths[pathIndex].base = base
        provider.paths[pathIndex].quote = quote
      }
    }

    this.pathProviders.push(provider)
    return this
  }

  /**
   * Registers a coin provider with the router
   * @param provider - Coin provider containing coin information
   * @returns Current RouterModule instance for chaining
   */
  private addCoinProvider(provider: CoinProvider): RouterModule {
    this.coinProviders = provider
    return this
  }

  /**
   * Retrieves token information from the coin address mapping
   * @param coinType - Coin type identifier
   * @returns Coin node information or undefined if not found
   */
  tokenInfo(coinType: string): CoinNode | undefined {
    return this._coinAddressMap.get(coinType)
  }

  /**
   * Calculates the fee rate for a specific pool
   * @param fromCoin - Source coin type
   * @param toCoin - Target coin type
   * @param poolAddress - Pool address
   * @returns Fee rate percentage for the pool
   */
  getFeeRate(fromCoin: string, toCoin: string, poolAddress: string): number {
    const pairSymbol = _pairSymbol(fromCoin, toCoin).pair
    const forwardAddressMap = this.poolAddressMap.get(pairSymbol)

    if (forwardAddressMap != null) {
      // Find fee rate by matching pool address
      for (const [feeKey, addressValue] of forwardAddressMap.entries()) {
        if (addressValue === poolAddress) {
          return feeKey * 100
        }
      }
    }

    const reversePairSymbol = _pairSymbol(fromCoin, toCoin).reversePair
    const reverseAddressMap = this.poolAddressMap.get(reversePairSymbol)

    if (reverseAddressMap != null) {
      // Find fee rate by matching pool address in reverse direction
      for (const [feeKey, addressValue] of reverseAddressMap.entries()) {
        if (addressValue === poolAddress) {
          return feeKey * 100
        }
      }
    }
    return 0
  }

  /**
   * Finds the optimal internal routing path between two coins
   *
   * @param fromCoin - Source coin type
   * @param toCoin - Target coin type
   * @param swapAmount - Amount to swap
   * @param isFixedInput - Whether input amount is fixed
   * @param slippagePoint - Price slippage tolerance
   * @param partnerObjectId - Partner object identifier
   * @param multiPoolParams - Parameters for fallback to multi-pool swap
   * @returns Promise resolving to the best routing result or undefined
   */
  async getBestInternalRouter(
    fromCoin: string,
    toCoin: string,
    swapAmount: BN,
    isFixedInput: boolean,
    slippagePoint: number,
    partnerObjectId: string,
    multiPoolParams?: PreSwapWithMultiPoolParams
  ): Promise<BestInternalRouterResult | undefined> {
    if (!this.isGraphLoaded) {
      await this.loadGraphData()
    }

    const sourceCoinInfo = this.tokenInfo(normalizeStructTag(fromCoin))
    const targetCoinInfo = this.tokenInfo(normalizeStructTag(toCoin))

    if (sourceCoinInfo === undefined || targetCoinInfo === undefined) {
      throw new ClmmpoolsError('From/To coin is undefined', RouterErrorCode.InvalidCoin)
    }

    const sourceVertex = this.graph.getVertexByKey(sourceCoinInfo.address)
    const targetVertex = this.graph.getVertexByKey(targetCoinInfo.address)

    const pathIterator = this.graph.findAllPath(sourceVertex, targetVertex)
    const availablePaths = Array.from(pathIterator)

    if (availablePaths.length === 0) {
      throw new ClmmpoolsError('No valid path found in coin graph', RouterErrorCode.NotFoundPath)
    }

    let routerSwapParams: PreRouterSwapParams[] = []

    for (let pathIndex = 0; pathIndex < availablePaths.length; pathIndex += 1) {
      const currentPath = availablePaths[pathIndex]

      // Only consider single and double hop paths
      if (currentPath.length > 3) {
        continue
      }

      const coinSequence = []
      const swapDirections = []
      const firstStepPools: string[] = []
      const secondStepPools: string[] = []

      for (let stepIndex = 0; stepIndex < currentPath.length - 1; stepIndex += 1) {
        const stepFromCoin = currentPath[stepIndex].value.toString()
        const stepToCoin = currentPath[stepIndex + 1].value.toString()
        const addressAndDirection = this.getPoolAddressMapAndDirection(stepFromCoin, stepToCoin)
        const stepAddressMap = addressAndDirection?.addressMap
        const stepDirection = addressAndDirection?.direction

        if (stepAddressMap != null && stepDirection != null) {
          swapDirections.push(stepDirection)
          coinSequence.push(stepFromCoin)
          coinSequence.push(stepToCoin)

          stepAddressMap.forEach((poolAddress) => {
            if (stepIndex === 0) {
              firstStepPools.push(poolAddress)
            } else {
              secondStepPools.push(poolAddress)
            }
          })
        }
      }

      for (const firstPool of firstStepPools) {
        if (secondStepPools.length > 0) {
          for (const secondPool of secondStepPools) {
            const routingParam: PreRouterSwapParams = {
              stepNums: 2,
              poolAB: firstPool,
              poolBC: secondPool,
              a2b: swapDirections[0],
              b2c: swapDirections[1],
              amount: swapAmount,
              byAmountIn: isFixedInput,
              coinTypeA: coinSequence[0],
              coinTypeB: coinSequence[1],
              coinTypeC: coinSequence[3],
            }
            routerSwapParams.push(routingParam)
          }
        } else {
          const routingParam: PreRouterSwapParams = {
            stepNums: 1,
            poolAB: firstPool,
            poolBC: undefined,
            a2b: swapDirections[0],
            b2c: undefined,
            amount: swapAmount,
            byAmountIn: isFixedInput,
            coinTypeA: coinSequence[0],
            coinTypeB: coinSequence[1],
            coinTypeC: undefined,
          }
          routerSwapParams.push(routingParam)
        }
      }
    }

    // Separate single-step and multi-step paths
    const singleStepPaths = routerSwapParams.filter((param) => param.stepNums === 1)
    const multiStepPaths = routerSwapParams.filter((param) => param.stepNums !== 1)

    let poolTvlData: PoolWithTvl[] = []
    try {
      poolTvlData = await this.getPoolWithTVL()
    } catch (error) {
      poolTvlData = []
    }

    if (poolTvlData.length > 0) {
      const tvlLookupMap = new Map(poolTvlData.map((poolInfo) => [poolInfo.poolAddress, poolInfo]))

      // Sort multi-step paths by minimum TVL across both pools
      multiStepPaths.sort((pathA, pathB) => {
        let minTvlA = 0
        let minTvlB = 0

        if (tvlLookupMap.has(pathA.poolAB) && tvlLookupMap.has(pathA.poolBC!)) {
          const poolAB_A = tvlLookupMap.get(pathA.poolAB)!
          const poolBC_A = tvlLookupMap.get(pathA.poolBC!)!
          minTvlA = Math.min(poolAB_A.tvl, poolBC_A.tvl)
        }

        if (tvlLookupMap.has(pathB.poolAB) && tvlLookupMap.has(pathB.poolBC!)) {
          const poolAB_B = tvlLookupMap.get(pathB.poolAB)!
          const poolBC_B = tvlLookupMap.get(pathB.poolBC!)!
          minTvlB = Math.min(poolAB_B.tvl, poolBC_B.tvl)
        }
        return minTvlB - minTvlA
      })
    }

    routerSwapParams = [...singleStepPaths, ...multiStepPaths]

    if (routerSwapParams.length === 0) {
      if (multiPoolParams != null) {
        const fallbackSwapResult = await this.sdk.Swap.preSwapWithMultiPool(multiPoolParams)

        const fallbackPath: OnePath = {
          amountIn: new BN(fallbackSwapResult!.estimatedAmountIn),
          amountOut: new BN(fallbackSwapResult!.estimatedAmountOut),
          poolAddress: [fallbackSwapResult!.poolAddress],
          a2b: [fallbackSwapResult!.aToB],
          rawAmountLimit: isFixedInput ? [fallbackSwapResult!.estimatedAmountOut] : [fallbackSwapResult!.estimatedAmountIn],
          isExceed: fallbackSwapResult!.isExceed,
          coinType: [fromCoin, toCoin],
        }

        const fallbackRouterParams = {
          paths: [fallbackPath],
          partner: partnerObjectId,
          priceSlippagePoint: slippagePoint,
        }

        const fallbackResult: BestInternalRouterResult = {
          amountIn: new BN(fallbackSwapResult!.estimatedAmountIn),
          amountOut: new BN(fallbackSwapResult!.estimatedAmountOut),
          paths: [fallbackPath],
          a2b: fallbackSwapResult!.aToB,
          b2c: undefined,
          byAmountIn: isFixedInput,
          isExceed: fallbackSwapResult!.isExceed,
          targetSqrtPrice: [fallbackSwapResult!.estimatedEndSqrtPrice],
          currentSqrtPrice: [fallbackSwapResult!.estimatedStartSqrtPrice],
          coinTypeA: fromCoin,
          coinTypeB: toCoin,
          coinTypeC: undefined,
          createTxParams: fallbackRouterParams,
        }
        return fallbackResult
      }
      throw new ClmmpoolsError('No parameters available for service downgrade', RouterErrorCode.NoDowngradeNeedParams)
    }

    const optimalSwapResult = await this.preRouterSwapA2B2C(routerSwapParams.slice(0, 16))
    if (optimalSwapResult == null) {
      if (multiPoolParams != null) {
        const fallbackSwapResult = await this.sdk.Swap.preSwapWithMultiPool(multiPoolParams)

        const fallbackPath: OnePath = {
          amountIn: new BN(fallbackSwapResult!.estimatedAmountIn),
          amountOut: new BN(fallbackSwapResult!.estimatedAmountOut),
          poolAddress: [fallbackSwapResult!.poolAddress],
          a2b: [fallbackSwapResult!.aToB],
          rawAmountLimit: isFixedInput ? [fallbackSwapResult!.estimatedAmountOut] : [fallbackSwapResult!.estimatedAmountIn],
          isExceed: fallbackSwapResult!.isExceed,
          coinType: [fromCoin, toCoin],
        }

        const fallbackRouterParams = {
          paths: [fallbackPath],
          partner: partnerObjectId,
          priceSlippagePoint: slippagePoint,
        }

        const fallbackResult: BestInternalRouterResult = {
          amountIn: new BN(fallbackSwapResult!.estimatedAmountIn),
          amountOut: new BN(fallbackSwapResult!.estimatedAmountOut),
          paths: [fallbackPath],
          a2b: fallbackSwapResult!.aToB,
          b2c: undefined,
          byAmountIn: isFixedInput,
          isExceed: fallbackSwapResult!.isExceed,
          targetSqrtPrice: [fallbackSwapResult!.estimatedEndSqrtPrice],
          currentSqrtPrice: [fallbackSwapResult!.estimatedStartSqrtPrice],
          coinTypeA: fromCoin,
          coinTypeB: toCoin,
          coinTypeC: undefined,
          createTxParams: fallbackRouterParams,
        }
        return fallbackResult
      }

      const emptyResult: BestInternalRouterResult = {
        amountIn: ZERO,
        amountOut: ZERO,
        paths: [],
        a2b: false,
        b2c: false,
        byAmountIn: isFixedInput,
        isExceed: true,
        targetSqrtPrice: [],
        currentSqrtPrice: [],
        coinTypeA: '',
        coinTypeB: '',
        coinTypeC: undefined,
        createTxParams: undefined,
      }

      return emptyResult
    }

    const optimalPathIndex = optimalSwapResult!.index

    const optimalPoolAddresses =
      routerSwapParams[optimalPathIndex].poolBC != null
        ? [routerSwapParams[optimalPathIndex].poolAB, routerSwapParams[optimalPathIndex].poolBC!]
        : [routerSwapParams[optimalPathIndex].poolAB]

    const optimalAmountLimits = isFixedInput
      ? [optimalSwapResult!.amountMedium, optimalSwapResult!.amountOut]
      : [optimalSwapResult!.amountIn, optimalSwapResult!.amountMedium]

    const optimalDirections = []
    optimalDirections.push(routerSwapParams[optimalPathIndex].a2b)
    if (optimalSwapResult!.stepNum! > 1) {
      optimalDirections.push(routerSwapParams[optimalPathIndex].b2c!)
    }

    const optimalCoinTypes = []
    optimalCoinTypes.push(routerSwapParams[optimalPathIndex].coinTypeA)
    optimalCoinTypes.push(routerSwapParams[optimalPathIndex].coinTypeB)
    if (optimalSwapResult!.stepNum! > 1) {
      optimalCoinTypes.push(routerSwapParams[optimalPathIndex].coinTypeC!)
    }

    const optimalPath: OnePath = {
      amountIn: optimalSwapResult!.amountIn,
      amountOut: optimalSwapResult!.amountOut,
      poolAddress: optimalPoolAddresses,
      a2b: optimalDirections,
      rawAmountLimit: optimalAmountLimits,
      isExceed: optimalSwapResult!.isExceed,
      coinType: optimalCoinTypes,
    }

    const routerTransactionParams = {
      paths: [optimalPath],
      partner: partnerObjectId,
      priceSlippagePoint: slippagePoint,
    }

    const finalResult: BestInternalRouterResult = {
      amountIn: optimalSwapResult!.amountIn,
      amountOut: optimalSwapResult!.amountOut,
      paths: [optimalPath],
      a2b: routerSwapParams[optimalPathIndex].a2b,
      b2c: optimalSwapResult!.stepNum! > 1 ? routerSwapParams[optimalPathIndex].b2c! : undefined,
      byAmountIn: isFixedInput,
      isExceed: optimalSwapResult!.isExceed,
      targetSqrtPrice: optimalSwapResult!.targetSqrtPrice,
      currentSqrtPrice: optimalSwapResult!.currentSqrtPrice,
      coinTypeA: routerSwapParams[optimalPathIndex].coinTypeA,
      coinTypeB: routerSwapParams[optimalPathIndex].coinTypeB,
      coinTypeC: optimalSwapResult!.stepNum! > 1 ? routerSwapParams[optimalPathIndex].coinTypeC! : undefined,
      createTxParams: routerTransactionParams,
    }
    return finalResult
  }

  /**
   * Loads graph data from the remote API endpoint
   */
  async loadGraphData() {
    const coinRegistry = new Map()
    const poolRegistry = new Map()

    const apiResponse = await fetch(this.sdk.sdkOptions.swapCountUrl!, { method: 'GET' })
    const poolsData = (await apiResponse.json()) as GraphApiResponse

    if (poolsData.code === 200) {
      for (const poolInfo of poolsData.pools) {
        if (
          poolInfo.is_closed ||
          !(
            isValidSuiAddress(poolInfo.address) &&
            isValidSuiAddress(poolInfo.coin_a.address) &&
            isValidSuiAddress(poolInfo.coin_b.address) &&
            poolInfo.fee
          )
        ) {
          continue
        }

        let coinA_address = poolInfo.coin_a.address
        let coinB_address = poolInfo.coin_b.address

        coinRegistry.set(coinA_address, {
          address: poolInfo.coin_a.address,
          decimals: poolInfo.coin_a.decimals,
        })
        coinRegistry.set(coinB_address, {
          address: poolInfo.coin_b.address,
          decimals: poolInfo.coin_b.decimals,
        })

        const tradingPair = `${coinA_address}-${coinB_address}`
        const existingPathProvider = poolRegistry.get(tradingPair)
        if (existingPathProvider) {
          existingPathProvider.addressMap.set(Number(poolInfo.fee) * 100, poolInfo.address)
        } else {
          poolRegistry.set(tradingPair, {
            base: coinA_address,
            quote: coinB_address,
            addressMap: new Map([[Number(poolInfo.fee) * 100, poolInfo.address]]),
          })
        }
      }
    } else {
      throw new ClmmpoolsError(`No response from server. Cannot load graph data`)
    }

    const coinData: CoinProvider = {
      coins: Array.from(coinRegistry.values()),
    }
    const pathData: PathProvider = {
      paths: Array.from(poolRegistry.values()),
    }

    this.sdk.Router.loadGraph(coinData, pathData)
  }

  /**
   * Pre-calculates routing swap results for multiple parameter sets
   * @param parameterSets - Array of router swap parameters to evaluate
   * @returns Best swap result or null if none found
   */
  async preRouterSwapA2B2C(parameterSets: PreRouterSwapParams[]) {
    if (parameterSets.length === 0) {
      return null
    }

    const { integrate, simulationAccount } = this.sdk.sdkOptions

    const transaction = new Transaction()
    for (const swapParams of parameterSets) {
      if (swapParams.stepNums > 1) {
        const transactionArgs = [
          transaction.object(swapParams.poolAB),
          transaction.object(swapParams.poolBC!),
          transaction.pure.bool(swapParams.a2b),
          transaction.pure.bool(swapParams.b2c!),
          transaction.pure.bool(swapParams.byAmountIn),
          transaction.pure.u64(swapParams.amount.toString()),
        ]
        const typeParameters = []
        if (swapParams.a2b) {
          typeParameters.push(swapParams.coinTypeA, swapParams.coinTypeB)
        } else {
          typeParameters.push(swapParams.coinTypeB, swapParams.coinTypeA)
        }

        if (swapParams.b2c) {
          typeParameters.push(swapParams.coinTypeB, swapParams.coinTypeC!)
        } else {
          typeParameters.push(swapParams.coinTypeC!, swapParams.coinTypeB)
        }

        transaction.moveCall({
          target: `${integrate.published_at}::${ClmmIntegrateRouterModule}::calculate_router_swap_result`,
          typeArguments: typeParameters,
          arguments: transactionArgs,
        })
      } else {
        const transactionArgs = [
          transaction.object(swapParams.poolAB),
          transaction.pure.bool(swapParams.a2b),
          transaction.pure.bool(swapParams.byAmountIn),
          transaction.pure.u64(swapParams.amount.toString()),
        ]
        const typeParameters = swapParams.a2b ? [swapParams.coinTypeA, swapParams.coinTypeB] : [swapParams.coinTypeB, swapParams.coinTypeA]
        transaction.moveCall({
          target: `${integrate.published_at}::${ClmmExpectSwapModule}::get_expect_swap_result`,
          arguments: transactionArgs,
          typeArguments: typeParameters,
        })
      }
    }

    if (!checkValidSuiAddress(simulationAccount.address)) {
      throw new ClmmpoolsError('Invalid simulation account configuration', ConfigErrorCode.InvalidSimulateAccount)
    }

    const simulationResult = await this.sdk.fullClient.devInspectTransactionBlock({
      transactionBlock: transaction,
      sender: simulationAccount.address,
    })

    const eventData: any = simulationResult.events?.filter((event: any) => {
      return (
        extractStructTagFromType(event.type).name === `CalculatedRouterSwapResultEvent` ||
        extractStructTagFromType(event.type).name === `ExpectSwapResultEvent`
      )
    })
    if (eventData.length === 0) {
      return null
    }

    let optimalAmount = parameterSets[0].byAmountIn ? ZERO : U64_MAX
    let optimalIndex = 0

    for (let eventIndex = 0; eventIndex < eventData.length; eventIndex += 1) {
      if (eventData[eventIndex].parsedJson.data.is_exceed) {
        continue
      }

      if (parameterSets[0].byAmountIn) {
        const outputAmount = new BN(eventData[eventIndex].parsedJson.data.amount_out)
        if (outputAmount.gt(optimalAmount)) {
          optimalIndex = eventIndex
          optimalAmount = outputAmount
        }
      } else {
        const inputAmount =
          parameterSets[eventIndex].stepNums > 1
            ? new BN(eventData[eventIndex].parsedJson.data.amount_in)
            : new BN(eventData[eventIndex].parsedJson.data.amount_in).add(new BN(eventData[eventIndex].parsedJson.data.fee_amount))
        if (inputAmount.lt(optimalAmount)) {
          optimalIndex = eventIndex
          optimalAmount = inputAmount
        }
      }
    }

    const currentPrices = []
    const targetPrices = []
    if (parameterSets[optimalIndex].stepNums > 1) {
      targetPrices.push(
        eventData[optimalIndex].parsedJson.data.target_sqrt_price_ab,
        eventData[optimalIndex].parsedJson.data.target_sqrt_price_cd
      )
      currentPrices.push(
        eventData[optimalIndex].parsedJson.data.current_sqrt_price_ab,
        eventData[optimalIndex].parsedJson.data.current_sqrt_price_cd
      )
    } else {
      targetPrices.push(eventData[optimalIndex].parsedJson.data.after_sqrt_price)
      currentPrices.push(eventData[optimalIndex].parsedJson.current_sqrt_price)
    }

    const optimalResult: PreSwapResult = {
      index: optimalIndex,
      amountIn: parameterSets[0].byAmountIn ? parameterSets[optimalIndex].amount : optimalAmount,
      amountMedium: eventData[optimalIndex].parsedJson.data.amount_medium,
      amountOut: parameterSets[0].byAmountIn ? optimalAmount : parameterSets[optimalIndex].amount,
      targetSqrtPrice: targetPrices,
      currentSqrtPrice: currentPrices,
      isExceed: eventData[optimalIndex].parsedJson.data.is_exceed,
      stepNum: parameterSets[optimalIndex].stepNums,
    }
    return optimalResult
  }

  /**
   * Retrieves pool information with TVL data from API
   * @returns Array of pools with their TVL information
   */
  async getPoolWithTVL(): Promise<PoolWithTvl[]> {
    const poolTvlResults: PoolWithTvl[] = []

    const { swapCountUrl } = this._sdk.sdkOptions
    if (!swapCountUrl) {
      return poolTvlResults
    }

    let apiResponse
    try {
      apiResponse = await fetch(swapCountUrl)
    } catch (fetchError) {
      throw new ClmmpoolsError(`Failed to get pool list with liquidity from ${swapCountUrl}.`, RouterErrorCode.InvalidSwapCountUrl)
    }

    let responseData
    try {
      responseData = await apiResponse.json()
    } catch (parseError) {
      throw new ClmmpoolsError(`Failed to parse response from ${swapCountUrl}.`, RouterErrorCode.InvalidSwapCountUrl)
    }

    if (responseData.code !== 200) {
      throw new ClmmpoolsError(
        `Failed to get pool list from ${swapCountUrl}. Status code is ${responseData.code}.`,
        RouterErrorCode.InvalidSwapCountUrl
      )
    }

    const { pools } = responseData

    for (const poolData of pools) {
      poolTvlResults.push({
        poolAddress: poolData.address,
        tvl: Number(poolData.tvl_in_usd),
      })
    }

    return poolTvlResults
  }
}
