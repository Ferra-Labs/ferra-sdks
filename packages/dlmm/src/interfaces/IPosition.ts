export type LbPositionOnChain = {
  id: {
    id: string
  }
  pair_id: string
  my_id: string
  saved_fees_x: string
  saved_fees_y: string
  saved_rewards: string[]
  coin_type_a: {
    fields: {
      name: string
    }
  }
  coin_type_b: {
    fields: {
      name: string
    }
  }
  lock_until: string
  total_bins: string
}

export interface BinDataOnchain {
  name: number
  value: string
}

export interface PositionBinOnchain {
  id: {
    id: string
  }
  name: number
  value: {
    fields: {
      active_bins_bitmap: string
      bin_data: {
        fields: {
          bin_id: number
          amount: string
          fee_growth_inside_last_x: string
          fee_growth_inside_last_y: string
          reward_growth_inside_last: string[]
        }
      }[]
    }
  }
}

export type BinReserveOnchain = {
  id: {
    id: string
  }
  name: string
  value: {
    fields: {
      active_bins_bitmap: number
      bin_data: {
        fields: {
          bin_id: number
          reserve_x: string
          reserve_y: string
          price: string
          fee_growth_x: string
          fee_growth_y: string
          reward_growths: string[]
          total_supply: string
        }
        type: string
      }[]
    }
  }
}

export interface PositionInfoOnChain {
  id: {
    id: string
  }
  name: string
  value: {
    fields: {
      position_id: string
      pair_id: string
      bins: {
        fields: {
          id: {
            id: string
          }
          size: string
        }
      }
      toggle: number
    }
  }
}

export type PositionReward = {
  coinType: string
  amount: string
}

export interface LockPositionParams {
  positionId: string
  untilTimestamp: number
  pairId: string
  typeX: string
  typeY: string
}
