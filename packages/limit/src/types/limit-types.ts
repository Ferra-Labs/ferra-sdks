import { SuiObjectIdType } from "./sui"

export type LimitOrderConfig = {
  rate_orders_indexer_id: SuiObjectIdType
  rate_orders_indexer_handle: SuiObjectIdType
  global_config_id: SuiObjectIdType
  limit_order_config: SuiObjectIdType
  token_list_handle: SuiObjectIdType
  user_orders_indexer_id: SuiObjectIdType
  user_orders_indexer_handle: SuiObjectIdType
}

/**
 * The limit order coin type.
 */
export type LimitOrderCoinType = {
  pay_coin_type: string
  target_coin_type: string
}

export enum LimitOrderStatus {
  Running = 'Running',
  PartialCompleted = 'PartialCompleted',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

/**
 * The limit order.
 */
export type LimitOrder = {
  id: SuiObjectIdType
  owner: string
  rate_order_indexer_id: string
  pay_balance: string
  target_balance: string
  total_pay_amount: string
  obtained_amount: string
  claimed_amount: string
  rate: number
  expire_ts: number
  canceled_ts: number
  created_ts: number
  status: LimitOrderStatus
} & LimitOrderCoinType

export type OrderPool = {
  indexer_id: SuiObjectIdType
  indexer_key: string
} & LimitOrderCoinType

export type LimitOrderToken = {
  coin_type: string
  min_trade_amount: number
}

export type PlaceLimitOrderParams = {
  pay_coin_amount: number
  price: number
  expired_ts: number
  target_decimal: number
  pay_decimal: number
} & LimitOrderCoinType

export type CancelOrderByOwnerParams = {
  order_id: string
} & LimitOrderCoinType

export type ClaimTargetCoinParams = {
  order_id: string
} & LimitOrderCoinType

export type OrderPlacedEvent = {
  order_id: string
}

export type OrderLimitEvent = {
  digest: string
  type: string
  timestamp_ms: string
  parsed_json: any
}
