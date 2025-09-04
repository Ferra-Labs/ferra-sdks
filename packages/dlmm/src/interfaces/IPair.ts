import { Address, ObjectId, U128, U16, U32, U64 } from '../types/basic-type'
import { Transaction, TransactionResult } from '@mysten/sui/transactions'

// ===== Helper Types =====
export interface Amounts {
  id: number
  liquidity: bigint
  amountX: bigint
  amountY: bigint
}

// ===== Events =====
export interface SwapEvent {
  sender: Address
  to: Address
  id: U32
  amounts_in: Amounts
  amounts_out: Amounts
  volatility_accumulator: U32
  total_fees: Amounts
  protocol_fees: Amounts
}

// ===== Main LB Pair Interface =====
export interface LBPair {
  id: ObjectId
  tokenXType: string
  tokenYType: string
  binStep: U16
  reserveX: U128
  reserveY: U128
  binManager: string
  parameters: PairParameters
  positionManager: string
  version: string
  rewarders: {
    reward_coin: string
    emissions_per_second: string
  }[]
  // Note: Internal fields like parameters, reserves, etc. are not exposed in the interface
}

export interface LbPairBinData {
  bin_id: bigint
  reserve_x: bigint
  reserve_y: bigint
  price: bigint
  total_supply: bigint
  fee_x: bigint
  fee_y: bigint
  fee_growth_x: bigint
  fee_growth_y: bigint
}

export interface LbPairOnChain {
  id: {
    id: string
  }
  is_pause: boolean
  bin_step: number
  parameters: {
    fields: {
      base_factor: number
      filter_period: number
      decay_period: number
      reduction_factor: number
      variable_fee_control: number
      protocol_share: number
      max_volatility_accumulator: number
      volatility_accumulator: number
      volatility_reference: number
      id_reference: number
      time_of_last_update: string
      oracle_id: number
      active_id: number
    }
  }
  protocol_fee_x: string
  protocol_fee_y: string
  bin_manager: {
    fields: {
      bins: {
        fields: {
          id: {
            id: string
          }
          head: {
            fields: {
              is_none: boolean
              v: string
            }
          }[]
          tail: {
            fields: {
              is_none: boolean
              v: string
            }
          }
          level: string
          max_level: string
          list_p: string
          size: string
          random: {
            fields: {
              seed: string
            }
          }
        }
      }
    }
  }
  oracle: {
    fields: {
      samples: {
        fields: {
          cumulative_id: string
          cumulative_volatility: string
          cumulative_bin_crossed: string
          sample_lifetime: number
          created_at: string
        }
      }[]
      oracle_length: number
      initialized: boolean
    }
  }
  position_manager: {
    fields: {
      positions: {
        fields: {
          id: {
            id: string
          }
          size: string
        }
      }
    }
  }
  balance_x: string
  balance_y: string
  reward_manager: {
    fields: {
      rewarders: {
        fields: {
          reward_coin: {
            fields: {
              name: string
            }
          }
          emissions_per_second: string
        }
      }[]
    }
  }
  reward_state: {
    fields: {
      reward_per_fee_cumulative: string[]
      total_fees_ever: string
      last_update_time: string
    }
  }
}

export interface Pairs {
  id: {
    id: string
  }
  index: string
  list: {
    fields: {
      head: string
      id: {
        id: string
      }
      size: string
      tail: string
    }
    type: string
  }
}

export interface PairInfo {
  id: {
    id: string
  }
  name: string
  value: {
    fields: {
      next: string
      prev: string
      value: {
        fields: {
          bin_step: number
          coin_type_a: {
            fields: {
              name: string
            }
            type: string
          }
          coin_type_b: {
            fields: {
              name: string
            }
            type: string
          }
          ignored_for_routing: boolean
          pair_id: string
          pair_key: string
        }
        type: string
      }
    }
    type: string
  }
}

export interface PairBin {
  reserve_x: string
  reserve_y: string
}

export interface LBPosition {
  id: string
  tokenXType: string
  tokenYType: string
  description: string
  index: string
  name: string
  pair_id: string
  url: string
  version: string
}

export interface BinData {
  id: number
  liquidity: bigint
}

export type PairParameters = {
  // Static fee parameters (rarely change)
  base_factor: U16
  filter_period: U16
  decay_period: U16
  reduction_factor: U16
  variable_fee_control: U32
  protocol_share: U16
  max_volatility_accumulator: U32

  // Dynamic parameters (change frequently)
  volatility_accumulator: U32
  volatility_reference: U32
  id_reference: U32
  time_of_last_update: U64
  oracle_id: U16
  active_id: number
}

// ===== Utility Types =====
export type AddLiquidityParams = {
  deltaIds: number[]
  distributionX: bigint[]
  distributionY: bigint[]
  amountX: bigint
  amountY: bigint
  minAmountX?: bigint
  minAmountY?: bigint
} & (
  | {
      positionId: string
    }
  | {
      position: TransactionResult[number]
    }
)

export interface RemoveLiquidityParams {
  positionId: string
  binIds: number[]
}

export interface ClosePositionParams {
  positionId: string
}

export interface AddLiquidityTxParams {
  amountX: TransactionResult[number] | ((tx: Transaction) => TransactionResult)
  amountY: TransactionResult[number] | ((tx: Transaction) => TransactionResult)
  deltaIds: number[]
  distributionX: bigint[]
  distributionY: bigint[]
  minAmountX?: bigint
  minAmountY?: bigint
  position:
    | TransactionResult[number]
    | {
        $kind: 'Input'
        Input: number
        type?: 'object'
      }
}

export interface CollectPositionRewardsParams {
  pairId: string
  positionId: string
  typeX: string
  typeY: string
  rewardCoin: string
  binIds: number[]
}

export interface CollectPositionFeesParams {
  pairId: string
  positionId: string
  typeX: string
  typeY: string
  binIds: number[]
}
