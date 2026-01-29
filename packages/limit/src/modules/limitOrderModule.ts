import type { TransactionObjectArgument } from '@mysten/sui/transactions'
import { coinWithBalance, Transaction } from '@mysten/sui/transactions'
import { LimitErrorCode, DETAILS_KEYS, handleError } from '../errors/errors'
import { FerraDcaSDK } from '../sdk'
import { IModule } from '../interfaces/IModule'
import { CLOCK_ADDRESS, DataPage, PaginationArgs, SuiAddressType, WithTx } from '../types/sui'
import { getPackagerConfigs } from '../config'
import { getObjectFields } from '../utils/objects'
import { composeType, extractStructTagFromType, fixCoinType } from '../utils/contracts'
import { CancelOrderByOwnerParams, ClaimTargetCoinParams, LimitOrder, LimitOrderCoinType, LimitOrderConfig, LimitOrderToken, OrderLimitEvent, OrderPool, PlaceLimitOrderParams } from '../types/limit-types'
import { normalizeSuiAddress } from '@mysten/sui/utils'
import { DevInspectResults } from '@mysten/sui/client'
import { blake2b } from 'blakejs'
import { LimitOrderUtils } from '../utils/limitOrder'

/**
 * Helper class to help interact with farm pools with a router interface.
 */
export class LimitOrderModule implements IModule {
  protected _sdk: FerraDcaSDK

  constructor(sdk: FerraDcaSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  async getLimitOrderTokenList(): Promise<LimitOrderToken[]> {
    const { limit_order } = this._sdk.sdkOptions
    const { token_list_handle } = getPackagerConfigs(limit_order)
    const { fullClient } = this._sdk
    try {
      const res = await fullClient.getDynamicFieldsByPage(token_list_handle)
      const warpIds = res.data.map((item) => item.objectId)

      const objectRes = await fullClient.batchGetObjects(warpIds, { showContent: true })
      return objectRes.map((item: any) => {
        const { fields } = item.data.content
        const info: LimitOrderToken = {
          coin_type: extractStructTagFromType(fields.name.fields.name).full_address,
          min_trade_amount: Number(fields.value),
        }

        return info
      })
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderTokenList',
      })
    }
  }

  /**
   * Get the list of limit order pools
   * @returns
   */
  async getLimitOrderPoolList(): Promise<OrderPool[]> {
    const { limit_order } = this._sdk.sdkOptions
    const { rate_orders_indexer_handle } = getPackagerConfigs(limit_order)
    const { fullClient } = this._sdk
    try {
      const res = await fullClient.getDynamicFieldsByPage(rate_orders_indexer_handle)
      const warpIds = res.data.map((item) => item.objectId)

      const objectRes = await fullClient.batchGetObjects(warpIds, { showContent: true })

      return objectRes.map((item: any) => {
        const { fields } = item.data.content.fields.value
        const info: OrderPool = {
          pay_coin_type: extractStructTagFromType(fields.pay_coin.fields.name).full_address,
          target_coin_type: extractStructTagFromType(fields.target_coin.fields.name).full_address,
          indexer_id: fields.indexer_id,
          indexer_key: fields.indexer_key,
        }
        this._sdk.updateCache(`${info.pay_coin_type}_${info.target_coin_type}`, info.indexer_id)
        return info
      })
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderPoolList',
      })
    }
  }
  async getLimitOrderPool(pay_coin_type: string, target_coin_type: string): Promise<OrderPool> {
    const { limit_order } = this._sdk.sdkOptions
    const { rate_orders_indexer_handle } = getPackagerConfigs(limit_order)
    const { fullClient } = this._sdk

    try {
      const res: any = await fullClient.getDynamicFieldObject({
        parentId: rate_orders_indexer_handle,
        name: {
          type: '0x2::object::ID',
          value: this.buildPoolKey(fixCoinType(pay_coin_type, true), fixCoinType(target_coin_type, true)),
        },
      })
      
      const { fields } = getObjectFields(res).value

      const info: OrderPool = {
        pay_coin_type: extractStructTagFromType(fields.pay_coin.fields.name).full_address,
        target_coin_type: extractStructTagFromType(fields.target_coin.fields.name).full_address,
        indexer_id: fields.indexer_id,
        indexer_key: fields.indexer_key,
      }
      this._sdk.updateCache(`${info.pay_coin_type}_${info.target_coin_type}`, info.indexer_id)

      return info
    } catch (error) {
      console.log('🚀🚀🚀 ~ file: LimitOrderModule.ts:122 ~ LimitOrderModule ~ getLimitOrderPool ~ error:', error)
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderPool',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          pay_coin_type,
          target_coin_type,
        },
      })
    }
  }

  async getPoolIndexerId(pay_coin_type: string, target_coin_type: string): Promise<string | undefined> {
    const indexer_id = this._sdk.getCache<string>(`${pay_coin_type}_${target_coin_type}`)
    try {
      if (indexer_id === undefined) {
        const info = await this.getLimitOrderPool(pay_coin_type, target_coin_type)
        if (info) {
          return info.indexer_id
        }
      }
    } catch (error) {
      handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getPoolIndexerId',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          pay_coin_type,
          target_coin_type,
        },
      })
    }
  }

  public buildGetUserIndexerHandle(owner_address: string, tx?: Transaction) {
    const { limit_order } = this._sdk.sdkOptions
    tx = tx || new Transaction()
    tx.moveCall({
      target: `${limit_order.published_at}::limit_order::get_orders_indexer_by_owner`,
      typeArguments: [],
      arguments: [tx.pure.address(owner_address), tx.object(getPackagerConfigs(limit_order).user_orders_indexer_id)],
    })
  }

  public parsedQueryUserIndexerEvent(simulate_res: DevInspectResults) {
    const valueList: any[] = simulate_res.events?.filter((item: any) => {
      return item.type.includes('limit_order::QueryUserIndexerEvent')
    })
    if (valueList.length > 0) {
      const { parsedJson } = valueList[0]
      return parsedJson.orders_table_id
    }
    return undefined
  }

  /**
   * Get the list of limit orders
   * @returns
   */
  async getOwnerLimitOrderList(owner_address: string, pagination_args?: PaginationArgs): Promise<DataPage<LimitOrder>> {
    const { fullClient } = this._sdk
    const dataPage: DataPage<LimitOrder> = {
      data: [],
      hasNextPage: false,
    }
    try {
      const userIndexerHandle = await this.getUserIndexerHandle(owner_address)
      if (!userIndexerHandle) {
        return dataPage
      }

      const res = await fullClient.getDynamicFieldsByPage(userIndexerHandle, pagination_args)
      dataPage.hasNextPage = res.hasNextPage
      dataPage.nextCursor = res.nextCursor
      const orderIds = res.data.map((item) => item.name.value)

      const objectRes = await fullClient.batchGetObjects(orderIds, { showContent: true })
      const data = objectRes.map((item) => LimitOrderUtils.buildLimitOrderInfo(item)).filter((info) => info !== undefined) as LimitOrder[]
      dataPage.data = data
    } catch (error) {
      console.error('Error in getOwnerLimitOrderList:', error)
      handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getOwnerLimitOrderList',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          owner_address,
          pagination_args,
        },
      })
    }
    return dataPage
  }

  /**
   * Get order information
   * @param order_id
   * @returns
   */
  async getLimitOrder(order_id: string): Promise<LimitOrder | undefined> {
    try {
      const res = await this._sdk.fullClient.getObject({ id: order_id, options: { showContent: true } })
      return LimitOrderUtils.buildLimitOrderInfo(res)
    } catch (error) {
      console.log('Error in getLimitOrder:', error)
      return handleError(LimitErrorCode.LimitOrderIdInValid, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrder',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
  }

  /**
   * Get order operation logs
   * @param order_id
   * @returns
   */
  async getLimitOrderLogs(order_id: string): Promise<OrderLimitEvent[]> {
    try {
      const res = await this._sdk.fullClient.queryTransactionBlocks({ filter: { ChangedObject: order_id }, options: { showEvents: true } })
      const list: OrderLimitEvent[] = []
      res.data.forEach((item) => {
        list.push(...LimitOrderUtils.buildOrderLimitEvent(item, ['OrderPlacedEvent', 'OrderCanceledEvent', 'FlashLoanEvent']))
      })

      return list
    } catch (error) {
      console.log('Error in getLimitOrderLogs:', error)
      handleError(LimitErrorCode.LimitOrderIdInValid, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderLogs',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
    return []
  }

  /**
   * Get the claim logs of the order
   * @param order_id
   * @returns
   */
  async getLimitOrderClaimLogs(order_id: string): Promise<OrderLimitEvent[]> {
    try {
      const res = await this._sdk.fullClient.queryTransactionBlocks({ filter: { ChangedObject: order_id }, options: { showEvents: true } })
      const list: OrderLimitEvent[] = []
      res.data.forEach((item) => {
        list.push(...LimitOrderUtils.buildOrderLimitEvent(item, ['ClaimTargetCoinEvent']))
      })

      return list
    } catch (error) {
      console.log('Error in getLimitOrderLogs:', error)
      handleError(LimitErrorCode.LimitOrderIdInValid, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getLimitOrderClaimLogs',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
    return []
  }

  private buildRateOrdersIndexerType(params: LimitOrderCoinType) {
    const { limit_order } = this._sdk.sdkOptions
    return composeType(`${limit_order.package_id}::limit_order::RateOrdersIndexer`, [params.pay_coin_type, params.target_coin_type])
  }

  public buildPoolKey(pay_coin_type: string, target_coin_type: string) {
    const payCoinBytes = Buffer.from(pay_coin_type, 'ascii')
    const targetCoinBytes = Buffer.from(target_coin_type, 'ascii')

    const combinedBytes = Buffer.concat([payCoinBytes, targetCoinBytes])

    const hash = blake2b(combinedBytes, undefined, 32)

    return `0x${Buffer.from(hash).toString('hex')}`
  }

  /**
   * Place a limit order
   * @param pay_coin_type
   * @param target_coin_type
   * @returns
   */
  async placeLimitOrder(params: PlaceLimitOrderParams): Promise<Transaction> {
    const { limit_order } = this._sdk.sdkOptions
    const { user_orders_indexer_id, global_config_id, limit_order_config, rate_orders_indexer_id } = getPackagerConfigs(limit_order)
    let indexerId: string | undefined
    try {
      indexerId = await this.getPoolIndexerId(params.pay_coin_type, params.target_coin_type)
    } catch (error) {
      indexerId = undefined
    }
    try {
      const tx = new Transaction()
      const payCoinObj = coinWithBalance({
        balance: BigInt(params.pay_coin_amount), 
        type: params.pay_coin_type,
      })

      tx.moveCall({
        target: `${limit_order.published_at}::limit_order::${
          indexerId === undefined ? 'create_indexer_and_place_limit_order' : 'place_limit_order'
        }`,
        typeArguments: [params.pay_coin_type, params.target_coin_type],
        arguments: [
          tx.object(global_config_id),
          tx.object(limit_order_config),
          indexerId === undefined ? tx.object(rate_orders_indexer_id) : tx.object(indexerId),
          tx.object(user_orders_indexer_id),
          payCoinObj,
          tx.pure.u128(LimitOrderUtils.priceToRate(params.price, params.pay_decimal, params.target_decimal)),
          tx.pure.u64(params.expired_ts),
          tx.object(CLOCK_ADDRESS),
        ],
      })
      return tx
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'placeLimitOrder',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }
  }

  /**
   * claim target coin
   * @param params
   * @returns
   */
  async claimTargetCoin(params: ClaimTargetCoinParams): Promise<Transaction> {
    const { limit_order } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(limit_order)
    const tx = new Transaction()

    tx.moveCall({
      target: `${limit_order.published_at}::limit_order::claim_target_coin`,
      typeArguments: [params.pay_coin_type, params.target_coin_type],
      arguments: [tx.object(global_config_id), tx.object(params.order_id)],
    })
    return tx
  }

  /**
   * Cancel a limit order
   * @param pay_coin_type
   * @param target_coin_type
   * @returns
   */
  async cancelOrdersByOwner(params: CancelOrderByOwnerParams[]): Promise<Transaction> {
    const { limit_order } = this._sdk.sdkOptions
    const { global_config_id } = getPackagerConfigs(limit_order)
    const tx = new Transaction()
    try {
      const indexerIdMap: Record<string, string> = {}
      for (let index = 0; index < params.length; index++) {
        const element = params[index]
        const indexerId = await this.getPoolIndexerId(element.pay_coin_type, element.target_coin_type)
        if (indexerId === undefined) {
          throw Error('not found indexerId')
        }
        indexerIdMap[element.order_id] = indexerId
      }

      params.forEach((item) => {
        tx.moveCall({
          target: `${limit_order.published_at}::limit_order::cancel_order_by_owner`,
          typeArguments: [item.pay_coin_type, item.target_coin_type],
          arguments: [
            tx.object(global_config_id),
            tx.object(indexerIdMap[item.order_id]),
            tx.object(item.order_id),
            tx.object(CLOCK_ADDRESS),
          ],
        })
      })

      return tx
    } catch (error) {
      return handleError(LimitErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'cancelOrdersByOwner',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }
  }

  private async getUserIndexerHandle(owner_address: string) {
    let userIndexerHandle = this.getUserIndexerHandleByCache(owner_address)
    if (userIndexerHandle === undefined) {
      const tx = new Transaction()
      this.buildGetUserIndexerHandle(owner_address, tx)

      const res: any = await this._sdk.fullClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: normalizeSuiAddress(owner_address),
      })
      userIndexerHandle = this.parsedQueryUserIndexerEvent(res)
      if (userIndexerHandle) {
        this.saveUserIndexerHandleByCache(owner_address, userIndexerHandle)
      }
    }
    return userIndexerHandle
  }

  private getUserIndexerHandleByCache(owner_address: string) {
    const cacheKey = `getUserIndexerHandleByCache_${owner_address}`
    return this._sdk.getCache<string>(cacheKey)
  }

  private saveUserIndexerHandleByCache(owner_address: string, id: string) {
    const cacheKey = `getUserIndexerHandleByCache_${owner_address}`
    return this._sdk.updateCache(cacheKey, id)
  }
}
