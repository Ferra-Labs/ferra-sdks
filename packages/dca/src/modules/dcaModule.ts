import type { TransactionObjectArgument } from '@mysten/sui/transactions'
import { coinWithBalance, Transaction } from '@mysten/sui/transactions'
import { DcaErrorCode, DETAILS_KEYS, handleError } from '../errors/errors'
import { FerraDcaSDK } from '../sdk'
import type {
  CloseDcaOrderParams,
  DcaCoinWhiteList,
  DcaConfigs,
  DcaOrder,
  DcaOrderTx,
  OpenDcaOrderParams,
  WithdrawDcaParams,
} from '../types/dca-type'
import { DcaUtils } from '../utils/dca'
import { IModule } from '../interfaces/IModule'
import { CLOCK_ADDRESS, DataPage, SuiAddressType, WithTx } from '../types/sui'
import { getPackagerConfigs } from '../config'
import { getObjectFields } from '../utils/objects'
import { extractStructTagFromType } from '../utils/contracts'

/**
 * Helper class to help interact with farm pools with a router interface.
 */
export class DcaModule implements IModule {
  protected _sdk: FerraDcaSDK

  constructor(sdk: FerraDcaSDK) {
    this._sdk = sdk
  }

  get sdk() {
    return this._sdk
  }

  // create dca order
  async dcaOpenOrderPayload(params: WithTx<OpenDcaOrderParams>): Promise<Transaction> {
    try {
      const { dca } = this.sdk.sdkOptions
      const { base_config_id: global_config_id, dca_config_id, indexer_id } = getPackagerConfigs(dca)

      const tx = params.tx ?? new Transaction()
      tx.setSenderIfNotSet(this.sdk.senderAddress)

      const inCoinObj = coinWithBalance({
        balance: BigInt(params.inCoinAmount),
        type: params.inCoinType,
      })
      
      tx.moveCall({
        target: `${dca.published_at}::dca_order::open_order`,
        typeArguments: [params.inCoinType, params.outCoinType],
        arguments: [
          tx.object(global_config_id ?? ''),
          tx.object(dca_config_id ?? ''),
          inCoinObj,
          tx.pure.u64(params.cycleFrequency),
          tx.pure.u64(params.cycleCount),
          tx.pure.u64(params.perCycleMinOutAmount),
          tx.pure.u64(params.perCycleMaxOutAmount),
          tx.pure.u64(params.perCycleInAmountLimit),
          tx.pure.u64(params.feeRate),
          tx.pure.u64(params.timestamp),
          tx.pure.string(params.signature),
          tx.object(CLOCK_ADDRESS),
          tx.object(indexer_id ?? ''),
        ],
      })
      return tx
    } catch (error) {
      return handleError(DcaErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'dcaOpenOrderPayload',
        [DETAILS_KEYS.REQUEST_PARAMS]: params,
      })
    }
  }

  // close dca order
  dcaCloseOrderPayload(params: Array<CloseDcaOrderParams>, tx = new Transaction()): Transaction {
    const { dca } = this._sdk.sdkOptions
    const { base_config_id: global_config_id, indexer_id } = getPackagerConfigs(dca)
    tx.setSenderIfNotSet(this.sdk.senderAddress)

    params.forEach((order: CloseDcaOrderParams) => {
      const outCoin = tx.moveCall({
        target: `${dca.published_at}::dca_order::cancle_order`,
        typeArguments: [order.inCoinType, order.outCoinType],
        arguments: [tx.object(global_config_id), tx.object(order.orderId), tx.object(indexer_id), tx.object(CLOCK_ADDRESS)],
      })
      tx.transferObjects([outCoin[0], outCoin[1]], tx.pure.address(this._sdk.senderAddress))
    })

    return tx
  }

  // query dca orders by wallet address
  async getDcaOrders(wallet_address: string): Promise<DataPage<DcaOrder>> {
    const dataPage: DataPage<DcaOrder> = {
      data: [],
      hasNextPage: false,
    }
    try {
      const { dca } = this._sdk.sdkOptions
      const { user_indexer_id } = getPackagerConfigs(dca)
      console.log('user_indexer_id', user_indexer_id);
      
      let dca_table_id
      const cache_dca_table_id = this._sdk.getCache(`${wallet_address}_dca_table_id`)
      if (cache_dca_table_id) {
        dca_table_id = cache_dca_table_id
      } else {
        const dca_table = await this._sdk.fullClient.getDynamicFieldObject({
          parentId: user_indexer_id,
          name: {
            type: 'address',
            value: wallet_address,
          },
        })
        if (!dca_table.data) {
          return dataPage
        }
        dca_table_id = getObjectFields(dca_table).value.fields.id.id
        this._sdk.updateCache(`${wallet_address}_dca_table_id`, dca_table_id)
      }
      let nextCursor: string | null = null
      const limit = 50
      const tableIdList: any = []
      while (true) {
        const tableRes: any = await this._sdk.fullClient.getDynamicFields({
          parentId: dca_table_id,
          cursor: nextCursor,
          limit,
        })
        
        tableRes.data.forEach((item: any) => {
          tableIdList.push(item.name.value)
        })
        nextCursor = tableRes.nextCursor
        if (nextCursor === null || tableRes.data.length < limit) {
          break
        }
      }
      const dcaOrderList = []
      const res = await this._sdk.fullClient.batchGetObjects(tableIdList, { showType: true, showContent: true })
      for (let i = 0; i < res.length; i++) {
        const dcaOrderObject: any = res[i]
        const type = extractStructTagFromType(dcaOrderObject.data.type)
        const in_coin_type: SuiAddressType = type.type_arguments[0]
        const out_coin_type: SuiAddressType = type.type_arguments[1]
        dcaOrderList.push({
          in_coin_type,
          out_coin_type,
          ...dcaOrderObject.data.content.fields,
          id: dcaOrderObject.data.content.fields.id.id,
          version: dcaOrderObject.data.version,
        })
      }
      dataPage.data = dcaOrderList
      return dataPage
    } catch (error) {
      return handleError(DcaErrorCode.InvalidWalletAddress, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaOrders',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          wallet_address,
        },
      })
    }
  }

  // get withdraw dca order payload
  async withdrawPayload(params: WithTx<WithdrawDcaParams>) {
    const { dca } = this._sdk.sdkOptions
    const { base_config_id: global_config_id } = getPackagerConfigs(dca)
    const tx = params.tx ?? new Transaction()
    tx.setSenderIfNotSet(this.sdk.senderAddress)

    const outCoin: TransactionObjectArgument[] = tx.moveCall({
      target: `${dca.published_at}::dca_order::withdraw`,
      typeArguments: [params.inCoinType, params.outCoinType],
      arguments: [tx.object(global_config_id), tx.object(params.orderId), tx.object(CLOCK_ADDRESS)],
    })
    tx.transferObjects([outCoin[0]], tx.pure.address(this._sdk.senderAddress))
    return tx
  }
  // get withdraw all dca order payload
  async withdrawAll(params: WithdrawDcaParams[]) {
    const { dca } = this._sdk.sdkOptions
    const { base_config_id: global_config_id } = getPackagerConfigs(dca)
    const tx = new Transaction()
    for (let i = 0; i < params.length; i++) {
      const outCoin: TransactionObjectArgument[] = tx.moveCall({
        target: `${dca.published_at}::dca_order::withdraw`,
        typeArguments: [params[i].inCoinType, params[i].outCoinType],
        arguments: [tx.object(global_config_id), tx.object(params[i].orderId), tx.object(CLOCK_ADDRESS)],
      })
      tx.transferObjects([outCoin[0]], tx.pure.address(this._sdk.senderAddress))
    }
    return tx
  }

  // query dca order make deal history
  async getDcaOrdersMakeDeal(order_id: string) {
    const historyResult: string[] | undefined = this._sdk.getCache(`${order_id}_tx`)
    const result: string[] = []
    let nextCursor: string | null = null
    const limit = 50
    try {
      while (true) {
        const dcaOrderTxRes: any = await this._sdk.fullClient.queryTransactionBlocks({
          filter: { ChangedObject: order_id },
          limit,
        })
        dcaOrderTxRes.data.forEach((element: DcaOrderTx) => {
          result.push(element.digest)
        })
        nextCursor = dcaOrderTxRes.nextCursor
        if (nextCursor === null || dcaOrderTxRes.data.length < limit) {
          break
        }
      }
      this._sdk.updateCache(`${order_id}_tx`, result)
      if (historyResult && historyResult.length === result.length) {
        return this._sdk.getCache(`${order_id}_history_list`)
      }
      const dcaOrderEvents: any = await this._sdk.fullClient.multiGetTransactionBlocks({
        digests: result,
        options: {
          showInput: true,
          showEffects: true,
          showEvents: true,
        },
      })
      const list: any = []
      dcaOrderEvents.forEach((item: any) => {
        list.push(...DcaUtils.buildOrderHistoryList(item, ['MakeDealEvent']))
      })
      this._sdk.updateCache(`${order_id}_history_list`, list)
      return list
    } catch (error) {
      return handleError(DcaErrorCode.InvalidOrderId, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaOrdersMakeDeal',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          order_id,
        },
      })
    }
  }

  // Query DCA token whitelist
  // whitelist_mode = 0 close whitelist mode
  // whitelist_mode = 1 open in_coin only
  // whitelist_mode = 2 open out_coin only
  // whitelist_mode = 3 open in_coin and out_coin
  async getDcaCoinWhiteList(whitelist_mode: number): Promise<DcaCoinWhiteList> {
    const { in_coin_whitelist_id, out_coin_whitelist_id } = getPackagerConfigs(this._sdk.sdkOptions.dca)
    const inCoinList: SuiAddressType[] = []
    const outCoinList: SuiAddressType[] = []
    try {
      if (whitelist_mode === 1 || whitelist_mode === 3) {
        let nextCursor: string | null = null
        const limit = 50
        while (true) {
          const inCoinTableRes: any = await this._sdk.fullClient.getDynamicFields({
            parentId: in_coin_whitelist_id,
            cursor: nextCursor,
            limit,
          })
          inCoinTableRes.data.forEach((item: any) => {
            inCoinList.push(extractStructTagFromType(item.name.value.name).full_address)
          })
          nextCursor = inCoinTableRes.nextCursor
          if (nextCursor === null || inCoinTableRes.data.length < limit) {
            break
          }
        }
      }
      if (whitelist_mode === 2 || whitelist_mode === 3) {
        let nextCursor: string | null = null
        const limit = 50
        while (true) {
          const outCoinTableRes: any = await this._sdk.fullClient.getDynamicFields({
            parentId: out_coin_whitelist_id,
            cursor: nextCursor,
            limit,
          })
          outCoinTableRes.data.forEach((item: any) => {
            outCoinList.push(extractStructTagFromType(item.name.value.name).full_address)
          })
          nextCursor = outCoinTableRes.nextCursor
          if (nextCursor === null || outCoinTableRes.data.length < limit) {
            break
          }
        }
      }
      return {
        inCoinList: inCoinList,
        outCoinList: outCoinList,
      }
    } catch (error) {
      return handleError(DcaErrorCode.InvalidMode, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaCoinWhiteList',
        [DETAILS_KEYS.REQUEST_PARAMS]: {
          whitelist_mode,
        },
      })
    }
  }

  async getDcaGlobalConfig() {
    const { base_config_id: global_config_id } = getPackagerConfigs(this._sdk.sdkOptions.dca)
    try {
      const globalConfigObject: any = await this._sdk.fullClient.getObject({
        id: global_config_id,
        options: { showType: true, showContent: true },
      })
      const globalConfig = DcaUtils.buildDcaGlobalConfig(globalConfigObject.data.content.fields)
      return globalConfig
    } catch (error) {
      handleError(DcaErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaGlobalConfig',
      })
    }
  }

  async getDcaConfigs() {
    const { package_id } = this._sdk.sdkOptions.dca
    const config: DcaConfigs = {
      admin_cap_id: '',
      dca_config_id: '',
      base_config_id: '',
      indexer_id: '',
      user_indexer_id: '',
      in_coin_whitelist_id: '',
      out_coin_whitelist_id: '',
    }
    try {
      const configEvent = (await this._sdk.fullClient.queryEventsByPage({ MoveEventType: `${package_id}::dca_config::InitEvent` })).data
      const orderEvent = (await this._sdk.fullClient.queryEventsByPage({ MoveEventType: `${package_id}::dca_order::InitEvent` })).data

      if (configEvent && configEvent.length > 0) {
        const { parsedJson } = configEvent[0] as { parsedJson: any }
        config.admin_cap_id = parsedJson.admin_cap_id
        config.base_config_id = parsedJson.global_config_id
      }
      if (orderEvent && orderEvent.length > 0) {
        const { parsedJson } = orderEvent[0] as { parsedJson: any }
        config.indexer_id = parsedJson.indexer_id
        const user_indexer_object: any = await this._sdk.fullClient.getObject({
          id: parsedJson.indexer_id,
          options: { showType: true, showContent: true },
        })
        config.user_indexer_id = user_indexer_object.data?.content.fields.user_orders.fields.id.id
      }
      if (config.base_config_id) {
        const global_config_object: any = await this._sdk.fullClient.getObject({
          id: config.base_config_id,
          options: { showType: true, showContent: true },
        })
        config.in_coin_whitelist_id = global_config_object.data.content.fields.in_coin_whitelist.fields.id.id
        config.out_coin_whitelist_id = global_config_object.data.content.fields.out_coin_whitelist.fields.id.id
      }
      return config
    } catch (error) {
      handleError(DcaErrorCode.FetchError, error as Error, {
        [DETAILS_KEYS.METHOD_NAME]: 'getDcaConfigs',
      })
    }
  }
}
