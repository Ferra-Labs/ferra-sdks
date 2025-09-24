import { isValidSuiAddress, normalizeStructTag, parseStructTag } from '@mysten/sui/utils'
import { IModule } from '../interfaces/IModule'
import { FerraDlmmSDK } from '../sdk'
import { CachedContent } from '../utils/cached-content'
import {
  AddLiquidityParams,
  LBPair,
  LbPairBinData,
  LbPairOnChain,
  PairBin,
  PairInfo,
  Pairs,
  RemoveLiquidityParams,
} from '../interfaces/IPair'
import { SuiObjectResponse, SuiParsedData } from '@mysten/sui/client'
import { PrepareSwapParams } from '../interfaces/ISwap'
import { checkInvalidSuiAddress, RpcBatcher, TransactionUtil } from '../utils'
import { DlmmPairsError, UtilsErrorCode } from '../errors/errors'
import { Transaction, type TransactionResult, coinWithBalance } from '@mysten/sui/transactions'
import { CoinAssist } from '../math'
import { bcs } from '@mysten/bcs'
import { BinReserveOnchain } from '../interfaces/IPosition'
import { BinReserves } from '../utils/bin_helper'
import { inspect } from 'util'

/**
 * Module for managing DLMM pairs
 * Handles fetching pair data, bins information, and preparing swap transactions
 */
export class PairModule implements IModule {
  protected _sdk: FerraDlmmSDK

  /**
   * Cache storage for pair data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the pair module with SDK instance
   * @param sdk - FerraDlmmSDK instance
   */
  constructor(sdk: FerraDlmmSDK) {
    this._sdk = sdk
  }

  /**
   * Get the SDK instance
   * @returns FerraDlmmSDK instance
   */
  get sdk() {
    return this._sdk
  }

  /**
   * Fetch all available liquidity pairs from the pairs manager
   * @returns Promise resolving to array of LBPair objects
   * @throws Error if pairs manager ID is not configured or pairs manager not found
   *
   * @example
   * ```typescript
   * const allPairs = await pairModule.getPairs();
   * console.log(`Found ${allPairs.length} pairs`);
   * ```
   */
  public async getPair(pairAddress: string): Promise<LBPair | null> {
    // Validate pair address format
    if (!isValidSuiAddress(pairAddress)) {
      return null
    }

    const suiClient = this.sdk.fullClient

    // Fetch pair object from chain
    const lpPairWapper = await suiClient.getObject({
      id: pairAddress,
      options: {
        showContent: true,
        showType: true,
      },
    })

    // Check if pair exists
    if (!lpPairWapper.data || !lpPairWapper.data.type) {
      return null
    }

    // Parse and return pair data
    return this.parsePairContent(lpPairWapper.data.type, lpPairWapper.data.content, lpPairWapper.data.version)
  }

  /**
   * Get bins data for a specific range in a pair
   * @param pair - The LBPair object
   * @param binRange - Tuple of [from, to] bin indices to fetch
   * @returns Promise resolving to array of PairBin data
   */
  public async getPairBins(pair: LBPair, binRange: [from: number, to: number]): Promise<PairBin[]> {
    const {
      dlmm_pool: { package_id },
    } = this.sdk.sdkOptions

    // Build transaction to query multiple bins
    const tx = new Transaction()

    // Add moveCall for each bin in the range
    for (let i = binRange[0]; i < binRange[1]; i++) {
      
      tx.moveCall({
        target: `${package_id}::lb_pair::get_bin`,
        arguments: [tx.object(pair.id), tx.pure.u32(i)],
        typeArguments: [pair.tokenXType, pair.tokenYType],
      })
    }

    // Execute dev inspect to get bin data without submitting transaction
    const res = await this.sdk.fullClient.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    })
    
    // Parse bin reserves from response
    const bins = res.results as { returnValues: [number[], string][] }[]
    return bins?.map((r) => ({
      reserve_x: bcs.u64().parse(new Uint8Array(r.returnValues[0][0])),
      reserve_y: bcs.u64().parse(new Uint8Array(r.returnValues[1][0])),
    }))
  }

  /**
   * Fetch all available liquidity pairs from the pairs manager
   * @returns Promise resolving to array of LBPair objects
   * @throws Error if pairs manager ID is not configured or pairs manager not found
   *
   * @example
   * ```typescript
   * const allPairs = await pairModule.getPairs();
   * console.log(`Found ${allPairs.length} pairs`);
   * ```
   */
  public async getPairs(): Promise<LBPair[]> {
    const {
      dlmm_pool: { config },
    } = this.sdk.sdkOptions
    const { pairs_id } = config ?? {}
    if (!pairs_id) throw new Error('Pairs ID is required')

    const pairsData = await this.sdk.fullClient.getObject({ id: pairs_id, options: { showContent: true } })

    const pairsContent = this.getStructContentFields<Pairs>(pairsData)
    if (!pairsContent) {
      throw new Error('Pairs Manager not found')
    }
    const pairManagerId = pairsContent.list.fields.id.id

    return new RpcBatcher({
      key: ['pairs'],
      callback: async (cursor, limit) => {
        // Get dynamic fields (bins) of the bin manager
        const fields = await this.sdk.fullClient.getDynamicFields({
          parentId: pairManagerId,
          cursor,
          limit,
        })

        // Fetch full content of each bin
        const objects = await this.sdk.fullClient.multiGetObjects({
          ids: fields.data.map((p) => p.objectId as string),
          options: {
            showContent: true,
            showType: true,
          },
        })

        // Parse bin content
        const pairNodeInfo = objects
          .map((obj) => {
            const nodeContent = this.getStructContentFields<PairInfo>(obj)
            return nodeContent?.value.fields.pair_id
          })
          .filter((o) => !!o)

        // Fetch full content of each bin
        const pairObjectInfo = await this.sdk.fullClient.multiGetObjects({
          ids: pairNodeInfo as string[],
          options: {
            showContent: true,
            showType: true,
          },
        })

        return {
          data: pairObjectInfo
            .map((o) => o.data)
            .filter((o) => !!o)
            .map((o) => this.parsePairContent(o.type!, o.content, o.version))
            .filter((o) => !!o),
          hasNextPage: fields.hasNextPage,
          nextCursor: fields.nextCursor,
        }
      },
      version: Date.now().toString(),
    }).fetchAll()
  }

  /**
   * Fetch reserve data for all bins in a pair
   * @param pair - The LBPair to fetch reserves for
   * @returns Promise resolving to array of bin reserves with ID, fees, and total supply
   *
   * @example
   * ```typescript
   * const reserves = await pairModule.getPairReserves(pair);
   * reserves.forEach(bin => {
   *   console.log(`Bin ${bin.id}: X=${bin.reserve_x}, Y=${bin.reserve_y}`);
   * });
   * ```
   */
  public async getPairReserves(pair: LBPair): Promise<
    (BinReserves & {
      id: number
    })[]
  > {
    const binManager = pair.binManager

    const binsFetcher = new RpcBatcher({
      key: ['pair-reserves', binManager],
      callback: async (cursor, limit) => {
        // Get dynamic fields (bins) of the bin manager
        const fields = await this.sdk.fullClient.getDynamicFields({
          parentId: binManager,
          cursor,
          limit,
        })

        // Fetch full content of each bin
        const objects = await this.sdk.fullClient.multiGetObjects({
          ids: fields.data.map((p) => p.objectId),
          options: {
            showContent: true,
          },
        })

        // Parse bin content
        const objectsContent = objects.map<BinReserveOnchain | null>(this.getStructContentFields)

        return {
          data: objectsContent.filter((o) => !!o),
          hasNextPage: fields.hasNextPage,
          nextCursor: fields.nextCursor,
        }
      },
      version: pair.version,
    })

    // Fetch all bins and sort by bin ID
    const bins = await binsFetcher.fetchAll().then((res) => res.sort((a, b) => Number(a.name) - Number(b.name)))

    // Convert to BinData format
    return bins.map(
      (bin) =>
        ({
          id: Number(bin.name),
          fee_x: BigInt(bin.value.fields.value.fields.fee_x ?? '0'),
          fee_y: BigInt(bin.value.fields.value.fields.fee_y ?? '0'),
          reserve_x: BigInt(bin.value.fields.value.fields.reserve_x ?? '0'),
          reserve_y: BigInt(bin.value.fields.value.fields.reserve_y ?? '0'),
          total_supply: BigInt(bin.value.fields.value.fields.total_supply),
        }) as BinReserves & { id: number }
    )
  }

  /**
   * Extract struct content fields from a Sui object response
   * @param object - SuiObjectResponse to parse
   * @returns Parsed fields or null if invalid
   */
  private getStructContentFields<T extends Object>(object: SuiObjectResponse): T | null {
    // Skip package objects or objects without fields
    if (object.data?.content?.dataType === 'package' || !object.data?.content?.fields) {
      return null
    }

    return object.data?.content?.fields as unknown as T
  }

  /**
   * Parse raw pair content from chain into LBPair format
   * @param typeTag - The type tag string of the pair object
   * @param contents - The parsed data content from chain
   * @param version - Version string of the pair
   * @returns Parsed LBPair or null if invalid
   */
  private parsePairContent(typeTag: string, contents: SuiParsedData | undefined | null, version: string): LBPair | null {
    // Parse and validate struct tag
    const structTag = parseStructTag(typeTag)
    const {
      dlmm_pool: { package_id, published_at },
    } = this.sdk.sdkOptions

    // Validate pair type matches expected structure
    if (
      contents?.dataType !== 'moveObject' ||
      (structTag.address !== package_id && structTag.address !== published_at) ||
      structTag.module !== 'lb_pair' ||
      structTag.name !== 'LBPair' ||
      structTag.typeParams.length != 2
    ) {
      return null
    }

    // Cast to pair on-chain type
    const lbPairOnChain = contents?.fields as unknown as LbPairOnChain

    if (!lbPairOnChain) {
      return null
    }

    // Convert to LBPair format with all necessary fields
    return {
      id: lbPairOnChain.id.id,
      tokenXType: normalizeStructTag(structTag.typeParams[0]),
      tokenYType: normalizeStructTag(structTag.typeParams[1]),
      reserveX: lbPairOnChain.balance_x,
      reserveY: lbPairOnChain.balance_y,
      binStep: String(lbPairOnChain.bin_step),
      binManager: lbPairOnChain.bin_manager.fields.bins.fields.id.id,
      positionManager: lbPairOnChain?.position_manager?.fields?.positions?.fields?.id?.id,
      version,
      parameters: {
        active_id: Number(lbPairOnChain.parameters.fields.active_id),
        base_factor: String(lbPairOnChain.parameters.fields.base_factor),
        decay_period: String(lbPairOnChain.parameters.fields.decay_period),
        filter_period: String(lbPairOnChain.parameters.fields.filter_period),
        id_reference: String(lbPairOnChain.parameters.fields.id_reference),
        max_volatility_accumulator: String(lbPairOnChain.parameters.fields.max_volatility_accumulator),
        oracle_id: String(lbPairOnChain.parameters.fields.oracle_id),
        protocol_share: String(lbPairOnChain.parameters.fields.protocol_share),
        reduction_factor: String(lbPairOnChain.parameters.fields.reduction_factor),
        time_of_last_update: String(lbPairOnChain.parameters.fields.time_of_last_update),
        variable_fee_control: String(lbPairOnChain.parameters.fields.variable_fee_control),
        volatility_accumulator: String(lbPairOnChain.parameters.fields.volatility_accumulator),
        volatility_reference: String(lbPairOnChain.parameters.fields.volatility_reference),
      },
      rewarders: lbPairOnChain.reward_manager.fields.rewarders.map((r) => ({
        reward_coin: r.fields.reward_coin.fields.name,
        emissions_per_second: r.fields.emissions_per_second,
      })),
    }
  }

  /**
   * Prepare a swap transaction for a pair
   * @deprecated
   * @param pair - The LBPair to swap on
   * @param params - Swap parameters including amount, direction, recipient
   * @param tx - Optional existing transaction to add swap to
   * @returns Transaction object ready to be executed
   * @throws DlmmPairsError if sender address is invalid
   */
  public async prepareSwap(pair: LBPair, params: PrepareSwapParams, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    const recipient = params.recipient ?? sender
    const xtoy = params.xtoy ?? true

    // Validate sender address
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new DlmmPairsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    let coinX: (tx: Transaction) => TransactionResult
    let coinY: (tx: Transaction) => TransactionResult

    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Build coin amounts based on swap direction
    if (xtoy) {
      // Swapping X to Y: set amount for X, 0 for Y
      coinX = coinWithBalance({
        type: pair.tokenXType,
        balance: params.amount,
      })
      coinY = coinWithBalance({
        type: pair.tokenYType,
        balance: 0n,
      })
    } else {
      // Swapping Y to X: set amount for Y, 0 for X
      coinX = coinWithBalance({
        type: pair.tokenXType,
        balance: 0n,
      })
      coinY = coinWithBalance({
        type: pair.tokenYType,
        balance: params.amount,
      })
    }

    // Create the swap transaction
    const [_, coinXReceipt, coinYReceipt] = TransactionUtil.createSwapTx(
      {
        pairId: pair.id,
        coinTypeX: pair.tokenXType,
        coinTypeY: pair.tokenYType,
        coinX,
        coinY,
        recipient,
        xtoy,
        minAmountOut: params.minAmountOut,
      },
      this.sdk.sdkOptions,
      tx
    )

    // Transfer the received coins to recipient
    tx.transferObjects([coinXReceipt, coinYReceipt], recipient)

    return tx
  }

  /**
   * Add liquidity to a pair and create a new position (open bucket)
   *
   * @param pair - The LBPair to add liquidity to
   * @param params - Liquidity parameters
   *   @param params.amountX - Amount of token X to add
   *   @param params.amountY - Amount of token Y to add
   *   @param params.ids - Array of relative bin IDs from active bin
   *   @param params.distributionX - Distribution percentages for token X across bins
   *   @param params.distributionY - Distribution percentages for token Y across bins
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity addition and position creation
   *
   * @example
   * ```typescript
   * const tx = await router.addOpenBucketLiquidity(pair, {
   *   amountX: 1000000000n, // 1 token X
   *   amountY: 2000000000n, // 2 token Y
   *   ids: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
   *   distributionX: [0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 0],
   *   distributionY: [0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 0]
   * });
   * ```
   */
  async openPositionAndAddLiquidity(pair: LBPair, params: Omit<AddLiquidityParams, 'positionId'>, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress

    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Build coin objects with specified amounts
    const amountX = coinWithBalance({
      type: pair.tokenXType,
      balance: params.amountX,
    })

    const amountY = coinWithBalance({
      type: pair.tokenYType,
      balance: params.amountY,
    })

    // Create new LB position NFT
    const [_, position] = TransactionUtil.createLbPosition(pair, this.sdk.sdkOptions, tx)

    // Add liquidity to the newly created position
    if (params.distributionX.length > 0) {
      tx = TransactionUtil.addLiquidity(
        pair,
        {
          ids: params.ids,
          distributionX: params.distributionX,
          distributionY: params.distributionY,
          amountX,
          amountY,
          position,
        },
        this.sdk.sdkOptions,
        tx
      )
    }

    // Transfer the position NFT to sender
    tx.transferObjects([position], sender)

    return tx
  }

  /**
   * Add liquidity to a pair and create a new position (open bucket)
   *
   * @param pair - The LBPair to add liquidity to
   * @param params - Liquidity parameters
   *   @param params.amountX - Amount of token X to add
   *   @param params.amountY - Amount of token Y to add
   *   @param params.ids - Array of relative bin IDs from active bin
   *   @param params.distributionX - Distribution percentages for token X across bins
   *   @param params.distributionY - Distribution percentages for token Y across bins
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity addition and position creation
   *
   * @example
   * ```typescript
   * const tx = await router.addOpenBucketLiquidity(pair, {
   *   amountX: 1000000000n, // 1 token X
   *   amountY: 2000000000n, // 2 token Y
   *   ids: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
   *   distributionX: [0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 0],
   *   distributionY: [0, 0, 0, 0, 0, 50, 50, 0, 0, 0, 0]
   * });
   * ```
   */
  async openPositionAndAddLiquidityV2(
    pair: LBPair,
    params: Omit<AddLiquidityParams, 'positionId'>,
    tx?: Transaction
  ): Promise<Transaction> {
    const sender = this.sdk.senderAddress

    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Build coin objects with specified amounts
    const amountX = coinWithBalance({
      type: pair.tokenXType,
      balance: params.amountX,
    })

    const amountY = coinWithBalance({
      type: pair.tokenYType,
      balance: params.amountY,
    })

    // Create new LB position NFT
    const [_, position] = TransactionUtil.createLbPosition(pair, this.sdk.sdkOptions, tx)

    // Add liquidity to the newly created position
    if (params.distributionX.length > 0) {
      tx = TransactionUtil.addLiquidityV2(
        pair,
        {
          ids: params.ids,
          distributionX: params.distributionX,
          distributionY: params.distributionY,
          amountX,
          amountY,
          position,
        },
        this.sdk.sdkOptions,
        tx
      )
    }

    // Transfer the position NFT to sender
    tx.transferObjects([position], sender)

    return tx
  }

  /**
   * Create a new empty position NFT for a pair without adding liquidity
   * @param pair - The LBPair to create position for
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with position creation
   *
   * @example
   * ```typescript
   * const tx = await pairModule.openPosition(pair);
   * // Position NFT will be transferred to sender after execution
   * ```
   */
  async openPosition(pair: LBPair, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress

    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Create new LB position NFT
    const [_, position] = TransactionUtil.createLbPosition(pair, this.sdk.sdkOptions, tx)

    // Transfer the position NFT to sender
    tx.transferObjects([position], sender)

    return tx
  }

  // async addLiquidity(pair: LBPair, params: AddLiquidityParams, tx?: Transaction) {
  //   const BATCH_SIZE = 50;

  //   const binLenght = params.ids.length;

  //   if (BATCH_SIZE >= binLenght) {
  //     return this.addLiquidityInternal(pair, params, tx)
  //   }

  //   for (let i = 0; i < binLenght; i += BATCH_SIZE) {
  //     const currentIds = params.ids.slice(i, i + BATCH_SIZE);
  //     const newAmountX = params.amountX * BigInt(currentIds.length) / BigInt(binLenght);
  //     const newAmountY = params.amountY * BigInt(currentIds.length) / BigInt(binLenght);

  //     this.addLiquidityInternal(pair, {
  //       ...params,
  //       amountX: newAmountX,
  //       amountY: newAmountY,
  //       ids: currentIds,
  //       distributionX: params.distributionX.slice(i, i + BATCH_SIZE),
  //       distributionY: params.distributionY.slice(i, i + BATCH_SIZE),
  //     }, tx)
  //   }
  //   return tx;
  // }

  /**
   * Add liquidity to an existing position
   * @param pair - The LBPair to add liquidity to
   * @param params - Liquidity parameters
   *   @param params.positionId - ID of existing position to add liquidity to
   *   @param params.amountX - Amount of token X to add
   *   @param params.amountY - Amount of token Y to add
   *   @param params.ids - Array of relative bin IDs from active bin
   *   @param params.distributionX - Distribution percentages for token X across bins
   *   @param params.distributionY - Distribution percentages for token Y across bins
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity addition
   *
   * @example
   * ```typescript
   * const tx = await router.addLiquidity(pair, {
   *   positionId: "0x123...",
   *   amountX: 1000000000n,
   *   amountY: 2000000000n,
   *   ids: [-2, -1, 0, 1, 2],
   *   distributionX: [10, 20, 40, 20, 10],
   *   distributionY: [10, 20, 40, 20, 10]
   * });
   * ```
   */
  async addLiquidity(pair: LBPair, params: AddLiquidityParams, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Build coin objects with specified amounts
    const amountX = coinWithBalance({ balance: params.amountX, type: CoinAssist.isSuiCoin(pair.tokenXType) ? undefined : pair.tokenXType })
    const amountY = coinWithBalance({ balance: params.amountY, type: CoinAssist.isSuiCoin(pair.tokenYType) ? undefined : pair.tokenYType })

    // Add liquidity to existing position
    TransactionUtil.addLiquidity(
      pair,
      {
        ids: params.ids,
        distributionX: params.distributionX,
        distributionY: params.distributionY,
        amountX,
        amountY,
        minAmountX: params.minAmountX,
        minAmountY: params.minAmountY,
        position: 'position' in params ? params.position : tx.object(params.positionId),
      },
      this.sdk.sdkOptions,
      tx
    )

    return tx
  }

  /**
   * Add liquidity to an existing position
   * @param pair - The LBPair to add liquidity to
   * @param params - Liquidity parameters
   *   @param params.positionId - ID of existing position to add liquidity to
   *   @param params.amountX - Amount of token X to add
   *   @param params.amountY - Amount of token Y to add
   *   @param params.ids - Array of relative bin IDs from active bin
   *   @param params.distributionX - Distribution percentages for token X across bins
   *   @param params.distributionY - Distribution percentages for token Y across bins
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity addition
   *
   * @example
   * ```typescript
   * const tx = await router.addLiquidity(pair, {
   *   positionId: "0x123...",
   *   amountX: 1000000000n,
   *   amountY: 2000000000n,
   *   ids: [-2, -1, 0, 1, 2],
   *   distributionX: [10, 20, 40, 20, 10],
   *   distributionY: [10, 20, 40, 20, 10]
   * });
   * ```
   */
  async addLiquidityV2(pair: LBPair, params: AddLiquidityParams, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Build coin objects with specified amounts
    const amountX = coinWithBalance({ balance: params.amountX, type: CoinAssist.isSuiCoin(pair.tokenXType) ? undefined : pair.tokenXType })
    const amountY = coinWithBalance({ balance: params.amountY, type: CoinAssist.isSuiCoin(pair.tokenYType) ? undefined : pair.tokenYType })

    // Add liquidity to existing position
    TransactionUtil.addLiquidityV2(
      pair,
      {
        ids: params.ids,
        distributionX: params.distributionX,
        distributionY: params.distributionY,
        amountX,
        amountY,
        minAmountX: params.minAmountX,
        minAmountY: params.minAmountY,
        position: 'position' in params ? params.position : tx.object(params.positionId),
      },
      this.sdk.sdkOptions,
      tx
    )

    return tx
  }

  /**
   * Remove liquidity from a position
   * @param pair - The LBPair to remove liquidity from
   * @param params - Remove liquidity parameters
   *   @param params.positionId - ID of position to remove liquidity from
   *   @param params.binIds - Array of bin IDs to remove liquidity from
   *   @param params.binAmounts - Array of amounts to remove from each bin
   *   @param params.minAmountXOut - Minimum amount of token X to receive (slippage protection)
   *   @param params.minAmountYOut - Minimum amount of token Y to receive (slippage protection)
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity removal
   * @throws DlmmPairsError if sender address is invalid
   * @throws Error if bin arrays are empty or mismatched
   *
   * @example
   * ```typescript
   * const tx = await router.removeLiquidity(pair, {
   *   positionId: "0x123...",
   *   binIds: [8388606, 8388607, 8388608],
   *   binAmounts: [100000n, 200000n, 150000n],
   *   minAmountXOut: 900000n,
   *   minAmountYOut: 1800000n
   * });
   * ```
   */
  async removeLiquidity(pair: LBPair, params: RemoveLiquidityParams, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress

    // Validate sender address
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new DlmmPairsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Validate bin IDs array is not empty
    if (!params.binIds.length) {
      throw new Error('List bin id cannot empty')
    }

    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Remove liquidity and get output coins
    const [_, coinX, coinY] = TransactionUtil.removeLiquidity(pair, params, this.sdk.sdkOptions, tx)

    // Transfer received coins to sender
    tx.transferObjects([coinX, coinY], sender)

    return tx
  }

  /**
   * Remove liquidity from a position
   * @param pair - The LBPair to remove liquidity from
   * @param params - Remove liquidity parameters
   *   @param params.positionId - ID of position to remove liquidity from
   *   @param params.binIds - Array of bin IDs to remove liquidity from
   *   @param params.binAmounts - Array of amounts to remove from each bin
   *   @param params.minAmountXOut - Minimum amount of token X to receive (slippage protection)
   *   @param params.minAmountYOut - Minimum amount of token Y to receive (slippage protection)
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity removal
   * @throws DlmmPairsError if sender address is invalid
   * @throws Error if bin arrays are empty or mismatched
   *
   * @example
   * ```typescript
   * const tx = await router.removeLiquidity(pair, {
   *   positionId: "0x123...",
   *   binIds: [8388606, 8388607, 8388608],
   *   binAmounts: [100000n, 200000n, 150000n],
   *   minAmountXOut: 900000n,
   *   minAmountYOut: 1800000n
   * });
   * ```
   */
  async removeLiquidityV2(pair: LBPair, params: RemoveLiquidityParams, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress

    // Validate sender address
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new DlmmPairsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    // Validate bin IDs array is not empty
    if (!params.binIds.length) {
      throw new Error('List bin id cannot empty')
    }

    // Create new transaction if not provided
    tx ??= new Transaction()
    tx.setSenderIfNotSet(sender)

    // Remove liquidity and get output coins
    const [_, coinX, coinY] = TransactionUtil.removeLiquidityV2(pair, params, this.sdk.sdkOptions, tx)

    // Transfer received coins to sender
    tx.transferObjects([coinX, coinY], sender)

    return tx
  }

  /**
   * Remove all liquidity from a position and close/burn the position NFT
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to remove and close
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity removal and position closure
   * @throws DlmmPairsError if sender address is invalid
   *
   * @example
   * ```typescript
   * const tx = await pairModule.removeAndClosePosition(pair, "0x123...");
   * // All liquidity will be withdrawn and position NFT burned
   * ```
   */
  async removeAndClosePosition(pair: LBPair, positionId: string, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress

    // Validate sender address
    if (!checkInvalidSuiAddress(this.sdk.senderAddress)) {
      throw new DlmmPairsError(
        'Invalid sender address: ferra clmm sdk requires a valid sender address. Please set it using sdk.senderAddress = "0x..."',
        UtilsErrorCode.InvalidSendAddress
      )
    }

    const bins = await this.sdk.Position.getPositionBins(pair, positionId)
    const binAvailable = bins.filter((v) => v.liquidity > 0n).map((v) => v.id)

    tx ??= new Transaction()
    tx.setSender(sender)

    if (binAvailable.length) {
      await this.removeLiquidity(pair, { positionId, binIds: binAvailable }, tx)
    }

    TransactionUtil.closePosition(pair, { positionId }, this.sdk.sdkOptions, tx)

    return tx
  }

  /**
   * Fetch bin data for a pair from the DLMM API
   * @param pairId - The ID of the pair to fetch bin data for
   * @returns Promise resolving to formatted bin data including reserves, prices, and fees
   *
   * @example
   * ```typescript
   * const binData = await pairModule.getPairBinsData("0x123...");
   * binData.forEach(bin => {
   *   console.log(`Bin ${bin.bin_id}: Price=${bin.price}`);
   * });
   * ```
   */
  async getPairBinsData(pairId: string) {
    const res = await fetch(`${this.sdk.sdkOptions.dlmmApiUrl}${pairId}/bins`).then((res) => res.json())

    return formatBins(res?.data ?? [])
  }
}

/**
 * Format raw bin data from API response into LbPairBinData objects
 * @param bins - Array of raw bin data from API
 * @returns Formatted array of LbPairBinData with BigInt values
 *
 * @example
 * ```typescript
 * const rawBins = await fetch('/api/bins').then(res => res.json());
 * const formattedBins = formatBins(rawBins.data);
 * ```
 */
export function formatBins(
  bins: {
    bin_id: string
    reserve_x: string
    reserve_y: string
    price: string
    total_supply: string
    fee_x: string
    fee_y: string
    fee_growth_x: string
    fee_growth_y: string
  }[]
): LbPairBinData[] {
  return bins.map(
    (b) =>
      ({
        bin_id: BigInt(b.bin_id),
        reserve_x: BigInt(b.reserve_x),
        reserve_y: BigInt(b.reserve_y),
        price: BigInt(b.price),
        total_supply: BigInt(b.total_supply),
        fee_growth_x: BigInt(b.fee_growth_x),
        fee_growth_y: BigInt(b.fee_growth_y),
      }) as LbPairBinData
  )
}
