export type LbPositionOnChain = {
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
  description: string
  id: {
    id: string
  }
  index: string
  name: string
  pair_id: string
  url: string
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
      score: string
      nexts: {
        fields: {
          is_none: boolean
          v: string
        }
      }[]
      prev: {
        fields: {
          is_none: boolean
          v: string
        }
      }
      value: {
        fields: {
          reserve_x: string | number | bigint
          reserve_y: string | number | bigint
          fee_x: string | number | bigint
          fee_y: string | number | bigint
          price: string | number | bigint
          fee_growth_x: string | number | bigint
          fee_growth_y: string | number | bigint
          rewards_growth: Iterable<string | number | bigint> & {
            length: number
          }
          liquidity: string | number | bigint
          total_supply: string | number | bigint
        }
      }
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
      bins: {
        fields: {
          id: {
            id: string
          }
          size: string
        }
      }
      total_fees_gen: string
      reward_per_fee_snapshot: string[]
      reward_dump: boolean
      reward_dump_version: string
      reward_claimed_bitmap: number
      reward_version_checksum: string
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
