import { LBPair, LbPairBinData } from '../interfaces'

const MAX_LOOP_ITERATIONS = 7000000000000
const SCALE_OFFSET_64X64 = 64
const MAX_U64 = BigInt('0xffffffffffffffff')
const MAX_FEE = 100_000_000n
const PRECISION = 1_000_000_000n
const BASIS_POINT_MAX = 10_000n
const MAX_U128 = BigInt('0xffffffffffffffffffffffffffffffff')
const MAX_LIQUIDITY_PER_BIN = BigInt('0xffffffffffffffff')
const MAX_TOTAL_FEE = 100_000_000n

type PairParameters = LBPair['parameters']

type BinManager = {
  list: LbPairBinData[]
  map: Map<bigint, LbPairBinData>
  min: number
  max: number
}

export namespace SwapUtils {
  export function getSwapOut(
    pair: LBPair,
    bins: LbPairBinData[],
    amount_in: bigint,
    swap_for_y: boolean
  ): [bigint, bigint, bigint, bigint, isMaxLoop: boolean] {
    const now = Date.now()

    bins = sortBins(bins)
    const binMap = bins.reduce((p, v) => (p.set(v.bin_id, v), p), new Map<bigint, LbPairBinData>())
    const binIds = bins.map((v) => Number(v.bin_id))
    const binManager: BinManager = {
      list: bins,
      map: binMap,
      max: Math.max(...binIds),
      min: Math.min(...binIds),
    }

    let amounts_left_x: bigint, amounts_left_y: bigint
    if (swap_for_y) {
      ;[amounts_left_x, amounts_left_y] = [amount_in, 0n]
    } else {
      ;[amounts_left_x, amounts_left_y] = [0n, amount_in]
    }
    let [amounts_out_x, amounts_out_y] = [0n, 0n]
    let [total_fees_x, total_fees_y] = [0n, 0n]

    let temp_parameters = pair.parameters
    let bin_step = BigInt(pair.binStep)
    let active_id = BigInt(temp_parameters.active_id)

    update_references(temp_parameters, BigInt(now) / 1000n)

    let id = active_id

    while (true) {
      id = get_non_empty_bin(binManager, swap_for_y, id)

      if (binMap.has(id)) {
        let bin = binMap.get(id)!
        if (!is_empty(bin, !swap_for_y)) {
          update_volatility_accumulator(temp_parameters, id)

          let [in_x, in_y, out_x, out_y, fee_x, fee_y] = get_swap_amounts(
            bin,
            temp_parameters,
            bin_step,
            swap_for_y,
            amounts_left_x,
            amounts_left_y
          )

          if (in_x > 0 || in_y > 0) {
            amounts_left_x = sub_u64(amounts_left_x, in_x)
            amounts_left_y = sub_u64(amounts_left_y, in_y)
            amounts_out_x = add_u64(amounts_out_x, out_x)
            amounts_out_y = add_u64(amounts_out_y, out_y)
            total_fees_x = add_u64(total_fees_x, fee_x)
            total_fees_y = add_u64(total_fees_y, fee_y)
          }
        }
      }

      if (amounts_left_x == 0n && amounts_left_y == 0n) {
        break
      } else {
        let next_id = get_next_non_empty_bin(bins, swap_for_y, id)

        if (next_id == 0n || next_id == id) {
          break
        }
        id = next_id
      }
    }
    return [
      swap_for_y ? amounts_left_x : amounts_left_y,
      swap_for_y ? amounts_out_y : amounts_out_x,
      swap_for_y ? total_fees_x : total_fees_y,
      id,
      false,
    ]
  }
}

function get_next_non_empty_bin(bins: LbPairBinData[], swap_for_y: boolean, binId: bigint): bigint {
  const currentBinIndex = bins.findIndex((b) => b.bin_id === binId)
  if (currentBinIndex == -1) {
    return 0n
  }

  if (swap_for_y) {
    const nextBin = bins[currentBinIndex - 1]
    return nextBin ? nextBin.bin_id : 0n
  } else {
    const nextBin = bins[currentBinIndex + 1]
    return nextBin ? nextBin.bin_id : 0n
  }
}

function get_non_empty_bin(bins: BinManager, swap_for_y: boolean, binId: bigint): bigint {
  const max_bin = bins.max
  const min_bin = bins.min
  
  while (true) {
    const hasBin = bins.map.has(binId)
    if (!hasBin) {
      if (!swap_for_y) {
        binId += 1n
        if (binId > max_bin) {
          break;
        }
      } else {
        binId -= 1n
        if (binId < min_bin) {
          break;
        }
      }

      continue
    }

    return binId
  }

  throw new Error('There is not enough liquidity')
}

function assert(condition: boolean, error: string) {
  if (!condition) {
    throw new Error(error)
  }
}

function sortBins(bins: LbPairBinData[]) {
  return bins.sort((a, b) => Number(a.bin_id - b.bin_id))
}

function is_empty(bin: LbPairBinData, is_x: boolean): boolean {
  if (is_x) {
    return bin.reserve_x == 0n
  } else {
    return bin.reserve_y == 0n
  }
}

function get_swap_amounts(
  bin: LbPairBinData,
  parameters: PairParameters,
  bin_step: bigint,
  swap_for_y: boolean,
  amounts_in_left_x: bigint,
  amounts_in_left_y: bigint
): [bigint, bigint, bigint, bigint, bigint, bigint] {
  let price = bin.price

  let bin_reserve_out

  if (swap_for_y) {
    bin_reserve_out = bin.reserve_y
  } else {
    bin_reserve_out = bin.reserve_x
  }

  if (bin_reserve_out == 0n) {
    return [0n, 0n, 0n, 0n, 0n, 0n]
  }

  let max_amount_in_without_fee = max_input_for_exact_output(bin_reserve_out, price, swap_for_y)

  // Calculate fees
  let total_fee = get_total_fee_rate(parameters, bin_step)
  let max_fee = get_fee_amount(max_amount_in_without_fee, total_fee)
  let max_amount_in_with_fee = add_u64(max_amount_in_without_fee, max_fee)

  let amount_in_available = 0n

  if (swap_for_y) {
    amount_in_available = amounts_in_left_x
  } else {
    amount_in_available = amounts_in_left_y
  }

  const calcAmountOut = () => {
    if (amount_in_available >= max_amount_in_with_fee) {
      return [max_amount_in_with_fee, bin_reserve_out, max_fee]
    } else {
      let fee = get_fee_amount_inclusive(amount_in_available, total_fee)

      let amount_in_without_fee = sub_u64(amount_in_available, fee)

      let amount_out = swap_amount_out(amount_in_without_fee, price, swap_for_y)

      let final_amount_out = min_u64(amount_out, bin_reserve_out)
      return [amount_in_available, final_amount_out, fee]
    }
  }

  let [amount_in_with_fee, amount_out, fee] = calcAmountOut()

  let [amounts_in_with_fees_x, amounts_in_with_fees_y] = [0n, 0n]

  if (swap_for_y) {
    ;[amounts_in_with_fees_x, amounts_in_with_fees_y] = [amount_in_with_fee, 0n]
  } else {
    ;[amounts_in_with_fees_x, amounts_in_with_fees_y] = [0n, amount_in_with_fee]
  }

  let [amounts_out_of_bin_x, amounts_out_of_bin_y] = [0n, 0n]
  if (swap_for_y) {
    amounts_out_of_bin_y = amount_out
  } else {
    amounts_out_of_bin_x = amount_out
  }

  let [total_fees_x, total_fees_y] = swap_for_y ? [fee, 0n] : [0n, fee]

  let new_reserve_x = swap_for_y ? add_u64(bin.reserve_x, amount_in_with_fee - fee) : sub_u64(bin.reserve_x, amount_out)

  let new_reserve_y = swap_for_y ? sub_u64(bin.reserve_y, amount_out) : add_u64(bin.reserve_y, amount_in_with_fee - fee)

  let new_liquidity = liquidity_from_amounts(new_reserve_x, new_reserve_y, price)
  assert!(new_liquidity <= MAX_LIQUIDITY_PER_BIN, 'E_MAX_LIQUIDITY_PER_BIN_EXCEEDED')

  return [amounts_in_with_fees_x, amounts_in_with_fees_y, amounts_out_of_bin_x, amounts_out_of_bin_y, total_fees_x, total_fees_y]
}

function get_fee_amount_inclusive(amount_with_fees: bigint, total_fee_rate: bigint): bigint {
  assert!(total_fee_rate < PRECISION, 'E_FEE_TOO_HIGH')

  let fee_amount = mul_div_round_up_u128(amount_with_fees, total_fee_rate, PRECISION)
  return u128_to_u64(fee_amount)
}

function mul_div_round_up_u128(a: bigint, b: bigint, c: bigint): bigint {
  assert!(c > 0, 'E_DIVISION_BY_ZERO')

  if (a == 0n || b == 0n) return 0n

  let ab = a * b
  return u256_to_u128((ab - 1n) / c + 1n)
}

function u256_to_u128(value: bigint): bigint {
  assert!(value <= (MAX_U128 as bigint), 'E_OVERFLOW')
  return value as bigint
}

function liquidity_from_amounts(x: bigint, y: bigint, price: bigint): bigint {
  return ((x * price) >> BigInt(SCALE_OFFSET_64X64)) + y
}

function sub_u64(a: bigint, b: bigint): bigint {
  assert!(a >= b, 'E_OVERFLOW')
  return a - b
}

function min_u64(a: bigint, b: bigint): bigint {
  if (a < b) {
    return a
  } else {
    return b
  }
}

// dangerouse
function swap_amount_out(amount_in: bigint, price: bigint, swap_for_y: boolean): bigint {
  if (amount_in == 0n) {
    return 0n
  }

  if (swap_for_y) {
    // X in -> Y out: y = x * price
    return y_from_x_price(amount_in, price)
  } else {
    // Y in -> X out: x = y / price
    return x_from_y_price(amount_in, price)
  }
}

function get_fee_amount_from(amount_with_fees: bigint, total_fee: bigint): bigint {
  verify_fee(total_fee)

  if (amount_with_fees == 0n || total_fee == 0n) {
    return 0n
  }

  let precision = PRECISION

  // Use mul_div with round up
  let fee_amount = div_round_up_u64(mul_u64(amount_with_fees, total_fee), precision)

  // Ensure fee doesn't exceed the total amount
  if (fee_amount > amount_with_fees) {
    return amount_with_fees
  } else {
    return fee_amount
  }
}

function div_round_up_u64(numerator: bigint, denominator: bigint): bigint {
  assert!(denominator > 0n, 'E_DIVISION_BY_ZERO')

  if (numerator == 0n) return 0n
  return (numerator - 1n) / denominator + 1n
}

function verify_fee(fee: bigint) {
  assert!(fee <= MAX_FEE, 'E_FEE_TOO_LARGE')
}

function get_fee_amount(amount: bigint, total_fee: bigint): bigint {
  verify_fee(total_fee)

  if (amount == 0n || total_fee == 0n) {
    return 0n
  }

  let precision = PRECISION

  // Check if fee would make denominator 0 or negative
  assert!(total_fee < precision, 'E_FEE_TOO_LARGE')

  let denominator = precision - total_fee

  // Use mul_div with round up
  let fee_amount = div_round_up_u128(mul_u128(amount, total_fee), denominator)

  return u128_to_u64(fee_amount)
}

function get_total_fee_rate(params: PairParameters, bin_step: bigint): bigint {
  let base = get_base_fee(params, bin_step)
  let variable = get_variable_fee(params, bin_step)
  const total = add_u64(base, variable)

  if (total > MAX_TOTAL_FEE) {
    return MAX_TOTAL_FEE
  }

  return total
}

function x_from_y_price(y: bigint, price: bigint): bigint {
  if (y == 0n || price == 0n) {
    return 0n
  }

  // y / price = (y << 64) / price
  let y_shifted = y << BigInt(SCALE_OFFSET_64X64)
  return y_shifted / price
}

function y_from_x_price(x: bigint, price: bigint): bigint {
  if (x == 0n || price == 0n) {
    return 0n
  }

  return (x * price) >> BigInt(SCALE_OFFSET_64X64)
}

function get_variable_fee(params: PairParameters, bin_step: bigint): bigint {
  let variable_fee_control = BigInt(params.variable_fee_control)

  if (variable_fee_control != 0n) {
    let volatility = BigInt(params.volatility_accumulator)
    let step = bin_step

    let prod = mul_u64(volatility, step)
    let prod_squared = mul_u64(prod, prod)

    return (mul_u64(prod_squared, variable_fee_control) + 99n) / 100n
  } else {
    return 0n
  }
}

function update_references(params: PairParameters, timestamp: bigint) {
  let dt = timestamp - BigInt(params.time_of_last_update)

  if (dt >= BigInt(params.filter_period)) {
    params.id_reference = String(params.active_id)
    if (dt < BigInt(params.decay_period)) {
      update_volatility_reference(params)
    } else {
      set_volatility_reference(params, 0n)
    }
  }

  params.time_of_last_update = timestamp.toString()
}

function set_volatility_reference(params: PairParameters, vol_ref: bigint) {
  assert!(vol_ref <= 0xfffff, 'E_INVALID_PARAMETER') // 20 bits max
  params.volatility_reference = vol_ref.toString()
}

function update_volatility_reference(params: PairParameters) {
  let vol_acc = BigInt(params.volatility_accumulator)
  let reduction_factor = BigInt(params.reduction_factor)
  let basis_max = BASIS_POINT_MAX

  let vol_ref = mul_div_u64(vol_acc, reduction_factor, basis_max)
  params.volatility_reference = u64_to_u32(vol_ref).toString()
}

function mul_div_u64(a: bigint, b: bigint, c: bigint): bigint {
  assert!(c > 0, 'E_DIVISION_BY_ZERO')
  if (a == 0n || b == 0n) return 0n
  let result = (a * b) / c
  return u128_to_u64(result)
}

function get_base_fee(params: PairParameters, bin_step: bigint): bigint {
  // base_fee = base_factor * bin_step * 10
  // This gives us the fee in units of 10^9 (matching precision)
  let base = BigInt(params.base_factor)
  let step = bin_step
  return mul_u64(base, step)
}

function update_volatility_accumulator(params: LBPair['parameters'], active_id: bigint) {
  let id_reference = BigInt(params.id_reference)

  let delta_id = active_id > id_reference ? active_id - id_reference : id_reference - active_id

  let vol_ref = BigInt(params.volatility_reference)
  let delta = BigInt(delta_id)
  let basis_max = 10n

  let vol_acc = add_u64(vol_ref, mul_u64(delta, basis_max))
  let max_vol_acc = BigInt(params.max_volatility_accumulator)

  let final_vol = vol_acc > max_vol_acc ? max_vol_acc : vol_acc

  params.volatility_accumulator = u64_to_u32(final_vol).toString()
}

function mul_u128(a: bigint, b: bigint): bigint {
  if (a == 0n || b == 0n) return 0n
  assert!(a <= MAX_U128 / b, 'E_OVERFLOW')
  return a * b
}

function u128_to_u64(value: bigint): bigint {
  assert!(value <= MAX_U64, 'E_OVERFLOW')
  return value
}

function div_round_up_u128(numerator: bigint, denominator: bigint): bigint {
  assert!(denominator > 0, 'E_DIVISION_BY_ZERO')

  if (numerator == 0n) return 0n
  return (numerator - 1n) / denominator + 1n
}

function add_u64(a: bigint, b: bigint): bigint {
  assert(a <= MAX_U64 - b, 'E_OVERFLOW')
  return a + b
}

function mul_u64(a: bigint, b: bigint): bigint {
  if (a == 0n || b == 0n) return 0n
  assert(a <= MAX_U64 / b, 'E_OVERFLOW')
  return a * b
}

function u64_to_u32(value: bigint): bigint {
  assert!(value <= BigInt(0xffffffff), 'E_OVERFLOW')
  return value
}

function max_input_for_exact_output(output_amount: bigint, price: bigint, swap_for_y: boolean): bigint {
  if (output_amount == 0n) {
    return 0n
  }

  if (swap_for_y) {
    // For Y output, need X input: x = y / price
    return shift_div_round_up(output_amount, BigInt(SCALE_OFFSET_64X64), price)
  } else {
    // For X output, need Y input: y = x * price
    return mul_shift_round_up(output_amount, price, BigInt(SCALE_OFFSET_64X64))
  }
}

function shift_div_round_up(numerator: bigint, offset: bigint, denominator: bigint): bigint {
  if (denominator <= 0) {
    throw new Error('E_DIVISION_BY_ZERO')
  }

  if (offset > 64) {
    throw new Error('E_OVERFLOW')
  }

  if (numerator == 0n) {
    return 0n
  }

  const numerator2 = numerator << offset

  return u128_to_u64((numerator2 - 1n) / denominator + 1n)
}

function mul_shift_round_up(a: bigint, b: bigint, offset: bigint): bigint {
  assert!(offset <= SCALE_OFFSET_64X64, 'E_OVERFLOW')

  if (a == 0n || b == 0n) return 0n

  let numerator = a * b
  let denominator = 1n << offset
  return u256_to_u64((numerator - 1n) / denominator + 1n)
}

function u256_to_u64(value: bigint): bigint {
  assert!(value <= MAX_U64, 'E_OVERFLOW')
  return value
}

/// Calculate y from x and price: y = x * price
/// Used in get_amounts for swap calculations
// function y_from_x_price(x: bigint, price: bigint): bigint {
//   if (x == 0n || price == 0n) {
//     return 0n
//   }

//   // x * price in fixed point, then convert to integer
//   return (x * price) >> BigInt(SCALE_OFFSET_64X64)
// }
