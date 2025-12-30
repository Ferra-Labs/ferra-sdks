import { isValidSuiAddress, normalizeStructTag, parseStructTag } from '@mysten/sui/utils'
import { IModule, Paginate } from '../interfaces/IModule'
import { FerraDammSDK } from '../sdk'
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
import { checkValidSuiAddress, DistributionUtils, RpcBatcher, TransactionUtil } from '../utils'
import { DammPairsError, UtilsErrorCode } from '../errors/errors'
import { Transaction, type TransactionResult, coinWithBalance } from '@mysten/sui/transactions'
import { BinMath, CoinAssist } from '../math'
import { bcs, BcsType } from '@mysten/sui/bcs'
import { BinReserveOnchain } from '../interfaces/IPosition'
import { BinReserves } from '../utils/bin_helper'
import Decimal from 'decimal.js'

const DynamicFieldNode = <K extends BcsType<any>, V extends BcsType<any>>(key: K, value: V) => {
  return bcs.struct('DynamicFieldNode', {
    id: bcs.struct('UID', {
      id: bcs.Address,
    }),
    name: key,
    value,
  })
}

const BinNodeStruct = DynamicFieldNode(
  bcs.u32(),
  bcs.struct('PackedBins', {
    active_bins_bitmap: bcs.u8(),
    bin_data: bcs.vector(
      bcs.struct('LBBinPosition', {
        bin_id: bcs.u32(),
        reserve_x: bcs.u64(),
        reserve_y: bcs.u64(),
        price: bcs.u128(),
        fee_growth_x: bcs.u128(),
        fee_growth_y: bcs.u128(),
        reward_growths: bcs.vector(bcs.u128()),
        total_supply: bcs.u128(),
      })
    ),
  })
)

const PairsStruct = bcs.struct('Pairs', {
  id: bcs.struct('0x2::object::ID', { id: bcs.Address }),
  list: ((_arg0: BcsType<any>, _arg1: BcsType<any>) =>
    bcs.struct('Table', {
      id: bcs.struct('0x2::object::ID', { id: bcs.Address }),
      size: bcs.u64(),
    }))(
    bcs.Address,
    (() =>
      bcs.struct('PairSimpleInfo', {
        pair_id: bcs.Address,
        pair_key: bcs.Address,
        bin_step: bcs.u16(),
        coin_type_a: (() =>
          bcs.struct('TypeName', {
            name: bcs.String,
          }))(),
        coin_type_b: (() =>
          bcs.struct('TypeName', {
            name: bcs.String,
          }))(),
      }))()
  ),
  index: bcs.u64(),
})

const PairSimpleInfo = DynamicFieldNode(
  bcs.Address,
  bcs.struct('PairSimpleInfo', {
    pair_id: bcs.Address,
    pair_key: bcs.Address,
    bin_step: bcs.u16(),
    coin_type_a: (() =>
      bcs.struct('TypeName', {
        name: bcs.String,
      }))(),
    coin_type_b: (() =>
      bcs.struct('TypeName', {
        name: bcs.String,
      }))(),
  })
)

const LBPairStruct = bcs.struct('LBPair', {
  fields: bcs.struct('LBPairFields', {
    id: bcs.struct('0x2::object::ID', { id: bcs.Address }),
    is_pause: bcs.bool(),
    bin_step: bcs.u16(),
    parameters: bcs.struct('PairParameters', {
      base_factor: bcs.u32(),
      protocol_share: bcs.u64(),
      active_id: bcs.u32(),
      activation_timestamp: bcs.u64(),
      enabled_fee_scheduler: bcs.bool(),
      cliff_fee_numerator: bcs.u64(),
      number_of_period: bcs.u16(),
      period_frequency: bcs.u64(),
      fee_scheduler_reduction_factor: bcs.u64(),
      enabled_dynamic_fee: bcs.bool(),
      filter_period: bcs.u16(),
      decay_period: bcs.u16(),
      reduction_factor: bcs.u16(),
      variable_fee_control: bcs.u32(),
      max_volatility_accumulator: bcs.u32(),
      volatility_accumulator: bcs.u32(),
      volatility_reference: bcs.u32(),
      id_reference: bcs.u32(),
      time_of_last_update: bcs.u64(),
    }),
    collect_fee_mode: bcs.u8(),
    is_quote_y: bcs.bool(),
    protocol_fee_x: bcs.u64(),
    protocol_fee_y: bcs.u64(),
    bin_manager: (() =>
      bcs.struct('BinManager', {
        fields: bcs.struct('BinManagerFields', {
          bins: ((arg0: BcsType<any>, arg1: BcsType<any>) =>
            bcs.struct('Table', {
              id: bcs.struct('0x2::object::ID', { id: bcs.Address }),
              size: bcs.u64(),
            }))(
            bcs.u32(),
            (() =>
              bcs.struct('PackedBins', {
                fields: bcs.struct('PackedBinsFields', {
                  active_bins_bitmap: bcs.u8(),
                  bin_data: bcs.vector(
                    (() =>
                      bcs.struct('Bin', {
                        bin_id: bcs.u32(),
                        reserve_x: bcs.u64(),
                        reserve_y: bcs.u64(),
                        price: bcs.u128(),
                        fee_growth_x: bcs.u128(),
                        fee_growth_y: bcs.u128(),
                        reward_growths: bcs.vector(bcs.u128()),
                        total_supply: bcs.u128(),
                      }))()
                  ),
                }),
              }))()
          ),
          tree: (() =>
            bcs.struct('TreeUint24', {
              fields: bcs.struct('TreeUint24Fields', {
                level0: bcs.u256(),
                level1: ((arg0: BcsType<any>, arg1: BcsType<any>) =>
                  bcs.struct('Table', {
                    id: bcs.struct('0x2::object::ID', {
                      id: bcs.Address,
                    }),
                    size: bcs.u64(),
                  }))(bcs.u64(), bcs.u256()),
                level2: ((arg0: BcsType<any>, arg1: BcsType<any>) =>
                  bcs.struct('Table', {
                    id: bcs.struct('0x2::object::ID', {
                      id: bcs.Address,
                    }),
                    size: bcs.u64(),
                  }))(bcs.u64(), bcs.u256()),
              }),
            }))(),
        }),
      }))(),
    position_manager: (() =>
      bcs.struct('LBPositionManager', {
        fields: bcs.struct('LBPositionManagerFields', {
          positions: ((arg0: BcsType<any>, arg1: BcsType<any>) =>
            bcs.struct('Table', {
              fields: bcs.struct('TableFields', {
                id: bcs.struct('0x2::object::ID', { id: bcs.Address }),
                size: bcs.u64(),
              }),
            }))(
            bcs.Address,
            (() =>
              bcs.struct('LBPositionInfo', {
                fields: bcs.struct('LBPositionInfoFields', {
                  position_id: bcs.Address,
                  pair_id: bcs.Address,
                  bins: ((arg0: BcsType<any>, arg1: BcsType<any>) =>
                    bcs.struct('Table', {
                      fields: bcs.struct('TableFields', {
                        id: bcs.struct('0x2::object::ID', {
                          id: bcs.Address,
                        }),
                        size: bcs.u64(),
                      }),
                    }))(
                    bcs.u32(),
                    (() =>
                      bcs.struct('PackedBins', {
                        active_bins_bitmap: bcs.u8(),
                        bin_data: bcs.vector(
                          (() =>
                            bcs.struct('LBBinPosition', {
                              bin_id: bcs.u32(),
                              amount: bcs.u128(),
                              fee_growth_inside_last_x: bcs.u128(),
                              fee_growth_inside_last_y: bcs.u128(),
                              reward_growth_inside_last: bcs.vector(bcs.u128()),
                            }))()
                        ),
                      }))()
                  ),
                  toggle: bcs.u16(),
                }),
              }))()
          ),
        }),
      }))(),
    balance_x: bcs.u64(),
    balance_y: bcs.u64(),
    reward_manager: (() =>
      bcs.struct('RewarderManager', {
        rewarders: bcs.vector(
          (() =>
            bcs.struct('Rewarder', {
              emission_per_ms: bcs.u128(),
              reward_coin: (() =>
                bcs.struct('TypeName', {
                  fields: bcs.struct('TypeNameFields', {
                    name: bcs.String,
                  }),
                }))(),
            }))()
        ),
        last_update_timestamp: bcs.u64(),
      }))(),
  }),
})

/**
 * Module for managing DAMM pairs
 * Handles fetching pair data, bins information, and preparing swap transactions
 */
export class PairModule implements IModule {
  protected _sdk: FerraDammSDK

  /**
   * Cache storage for pair data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the pair module with SDK instance
   * @param sdk - FerraDammSDK instance
   */
  constructor(sdk: FerraDammSDK) {
    this._sdk = sdk
  }

  /**
   * Get the SDK instance
   * @returns FerraDammSDK instance
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
    const lpPairWapper = (
      await this.sdk.grpcClient.ledgerService.getObject({
        objectId: pairAddress,
        readMask: {
          paths: ['object_type', 'contents'],
        },
      })
    ).response

    // Check if pair exists
    if (!lpPairWapper.object?.objectType) {
      return null
    }

    // Parse and return pair data
    return this.parsePairContent(
      lpPairWapper.object?.objectType,
      LBPairStruct.parse(lpPairWapper.object.contents?.value ?? new Uint8Array()),
      (lpPairWapper.object.version ?? '0').toString()
    )
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
  public async getPairs(pageToken: Uint8Array | null = null, limit = 500): Promise<Paginate<LBPair>> {
    const {
      damm_pool: { config },
    } = this.sdk.sdkOptions
    const { pairs_id } = config ?? {}
    if (!pairs_id) throw new Error('Pairs ID is required')

    const pairsData = (
      await this.sdk.grpcClient.ledgerService.getObject({
        objectId: pairs_id,
        readMask: {
          paths: ['contents'],
        },
      })
    ).response.object

    if (!pairsData) {
      throw new Error('Pairs Manager not found')
    }
    const pairsContent = PairsStruct.parse(pairsData.contents?.value!)

    const pairManagerId = pairsContent.list.id.id

    const pairsInfoRaw = await this.sdk.grpcClient.stateService.listDynamicFields({
      parent: pairManagerId,
      pageSize: limit,
      pageToken: pageToken ?? undefined,
      readMask: {
        paths: ['field_id', 'child_id', 'field_object.contents'],
      },
    })

    const pairsInfo = pairsInfoRaw.response
      .dynamicFields.map((v) => PairSimpleInfo.parse(v.fieldObject?.contents?.value!))

    const pairsRaw = (
      await this.sdk.grpcClient.ledgerService.batchGetObjects({
        requests: pairsInfo.map((v) => ({
          objectId: v.value.pair_id,
        })),
        readMask: {
          paths: ['contents', 'object_id', 'object_type'],
        },
      })
    ).response.objects

    return {
      pageToken: pairsInfoRaw.response.nextPageToken,
      data: pairsRaw
        .map((v) => v.result)
        .filter((v) => v.oneofKind === 'object')
        .map((v) => {
          return this.parsePairContent(
            v.object.objectType ?? '',
            LBPairStruct.parse(v.object.contents?.value!),
            v.object.version?.toString() ?? ''
          )
        })
        .filter((v) => !!v),
    }
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
    const grpcClient = this.sdk.grpcClient

    const packedBins: (typeof BinNodeStruct.$inferType)[] = []
    let token: Uint8Array | undefined = undefined

    while (true) {
      const res = await grpcClient.stateService.listDynamicFields({
        parent: binManager,
        readMask: {
          paths: ['field_object.contents'],
        },
        pageSize: 500,
        pageToken: token,
      }).response

      if (!!res.nextPageToken) {
        token = getNextPageToken(res)
      }

      const packed = res.dynamicFields.map((v) => 
        BinNodeStruct.parse(v.fieldObject?.contents?.value ?? new Uint8Array()))

      packedBins.push(...packed)

      if (!token || !res.dynamicFields.length) {
        break
      }
    }

    // Convert to BinData format
    return packedBins
      .flatMap((bins) => bins.value.bin_data)
      .map(
        (bin) =>
          ({
            id: Number(bin.bin_id),
            reserve_x: BigInt(bin.reserve_x ?? '0'),
            reserve_y: BigInt(bin.reserve_y ?? '0'),
            total_supply: BigInt(bin.total_supply),
            fee_growth_x: BigInt(bin.fee_growth_x),
            fee_growth_y: BigInt(bin.fee_growth_y),
            price: BigInt(bin.price),
            reward_growths: bin.reward_growths.map(BigInt),
          }) as BinReserves & { id: number }
      )
  }

  /**
   * Parse raw pair content from chain into LBPair format
   * @param typeTag - The type tag string of the pair object
   * @param contents - The parsed data content from chain
   * @param version - Version string of the pair
   * @returns Parsed LBPair or null if invalid
   */
  private parsePairContent(typeTag: string, contents: typeof LBPairStruct.$inferType, version: string): LBPair | null {
    // Parse and validate struct tag
    const structTag = parseStructTag(typeTag)
    const {
      damm_pool: { package_id, published_at },
    } = this.sdk.sdkOptions

    // Validate pair type matches expected structure
    if (
      (structTag.address !== package_id && structTag.address !== published_at) ||
      structTag.module !== 'lb_pair' ||
      structTag.name !== 'LBPair' ||
      structTag.typeParams.length != 2
    ) {
      return null
    }

    // Cast to pair on-chain type
    const lbPairOnChain = contents?.fields

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
      binManager: lbPairOnChain.bin_manager.fields.bins.id.id,
      positionManager: lbPairOnChain?.position_manager?.fields?.positions?.fields?.id?.id,
      version,
      parameters: {
        active_id: Number(lbPairOnChain.parameters.active_id),
        base_factor: String(lbPairOnChain.parameters.base_factor),
        decay_period: String(lbPairOnChain.parameters.decay_period),
        filter_period: String(lbPairOnChain.parameters.filter_period),
        id_reference: String(lbPairOnChain.parameters.id_reference),
        max_volatility_accumulator: String(lbPairOnChain.parameters.max_volatility_accumulator),
        protocol_share: String(lbPairOnChain.parameters.protocol_share),
        reduction_factor: String(lbPairOnChain.parameters.reduction_factor),
        time_of_last_update: String(lbPairOnChain.parameters.time_of_last_update),
        variable_fee_control: String(lbPairOnChain.parameters.variable_fee_control),
        volatility_accumulator: String(lbPairOnChain.parameters.volatility_accumulator),
        volatility_reference: String(lbPairOnChain.parameters.volatility_reference),
      },
      rewarders: lbPairOnChain.reward_manager.rewarders.map((r) => ({
        reward_coin: r.reward_coin.fields.name,
        emission_per_ms: r.emission_per_ms,
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
   * @throws DammPairsError if sender address is invalid
   */
  public async prepareSwap(pair: LBPair, params: PrepareSwapParams, tx?: Transaction): Promise<Transaction> {
    const sender = this.sdk.senderAddress
    const recipient = params.recipient ?? sender
    const xtoy = params.xtoy ?? true

    // Validate sender address
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammPairsError(
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

    const activeId = pair.parameters.active_id;
    const distributions = DistributionUtils.createParams('SPOT', {
      activeId: activeId,
      binRange: [activeId - 74, activeId + 74],
      parsedAmounts: [Decimal(params.amountX.toString()), Decimal(params.amountY.toString())]
    })

    // Add liquidity to the newly created position
    if (distributions.distributionX.length > 0) {
      tx = TransactionUtil.addLiquidity(
        pair,
        {
          ids: distributions.ids,
          distributionX: distributions.distributionX,
          distributionY: distributions.distributionY,
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

    const activeId = pair.parameters.active_id;
    const distributions = DistributionUtils.createParams('SPOT', {
      activeId: activeId,
      binRange: [activeId - 74, activeId + 74],
      parsedAmounts: [Decimal(params.amountX.toString()), Decimal(params.amountY.toString())]
    })

    // Add liquidity to existing position
    TransactionUtil.addLiquidity(
      pair,
      {
        ids: distributions.ids,
        distributionX: distributions.distributionX,
        distributionY: distributions.distributionY,
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
   * @throws DammPairsError if sender address is invalid
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
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammPairsError(
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
   * Remove all liquidity from a position and close/burn the position NFT
   * @param pair - The LBPair containing the position
   * @param positionId - ID of the position to remove and close
   * @param tx - Optional existing transaction to add operations to
   * @returns Transaction object with liquidity removal and position closure
   * @throws DammPairsError if sender address is invalid
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
    if (!checkValidSuiAddress(this.sdk.senderAddress)) {
      throw new DammPairsError(
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
   * Fetch bin data for a pair from the DAMM API
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
    const res = await fetch(`${this.sdk.sdkOptions.dammApiUrl}${pairId}/bins`).then((res) => res.json())

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

function getNextPageToken(o: any) {
  return o.nextPageToken
}
