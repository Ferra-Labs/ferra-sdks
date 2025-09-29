import { Transaction } from '@mysten/sui/transactions'
import { AggPairsError, UtilsErrorCode } from '../errors/errors'
import { isValidSuiAddress } from '@mysten/sui/utils'
/**
 * Check if the address is a valid sui address.
 * @param {string}address
 * @returns
 */
export function checkValidSuiAddress(address: string): boolean {
  return !!address && isValidSuiAddress(address)
}

export class TxBlock {
  public txBlock: Transaction

  constructor() {
    this.txBlock = new Transaction()
  }

  /**
   * Transfer sui to many recipoents.
   * @param {string[]}recipients The recipient addresses.
   * @param {number[]}amounts The amounts of sui coins to be transferred.
   * @returns this
   */
  transferSuiToMany(recipients: string[], amounts: number[]) {
    if (recipients.length !== amounts.length) {
      throw new AggPairsError('The length of recipients and amounts must be the same', UtilsErrorCode.InvalidRecipientAndAmountLength)
    }

    for (const recipient of recipients) {
      if (!checkValidSuiAddress(recipient) === false) {
        throw new AggPairsError('Invalid recipient address', UtilsErrorCode.InvalidRecipientAddress)
      }
    }

    const tx = this.txBlock
    const coins = tx.splitCoins(
      tx.gas,
      amounts.map((amount) => tx.pure.u64(amount))
    )
    recipients.forEach((recipient, index) => {
      tx.transferObjects([coins[index]], tx.pure.address(recipient))
    })
    return this
  }

  /**
   * Transfer sui to one recipient.
   * @param {string}recipient recipient cannot be empty or invalid sui address.
   * @param {number}amount
   * @returns this
   */
  transferSui(recipient: string, amount: number) {
    if (!checkValidSuiAddress(recipient) === false) {
      throw new AggPairsError('Invalid recipient address', UtilsErrorCode.InvalidRecipientAddress)
    }

    return this.transferSuiToMany([recipient], [amount])
  }

  /**
   * Transfer coin to many recipients.
   * @param {string}recipient recipient cannot be empty or invalid sui address.
   * @param {number}amount amount cannot be empty or invalid sui address.
   * @param {string[]}coinObjectIds object ids of coins to be transferred.
   * @returns this
   * @deprecated use transferAndDestoryZeroCoin instead
   */
  transferCoin(recipient: string, amount: number, coinObjectIds: string[]) {
    if (!checkValidSuiAddress(recipient) === false) {
      throw new AggPairsError('Invalid recipient address', UtilsErrorCode.InvalidRecipientAddress)
    }

    const tx = this.txBlock
    const [primaryCoinA, ...mergeCoinAs] = coinObjectIds
    const primaryCoinAInput = tx.object(primaryCoinA)

    if (mergeCoinAs.length > 0) {
      tx.mergeCoins(
        primaryCoinAInput,
        mergeCoinAs.map((coin) => tx.object(coin))
      )
    }

    const spitAmount = tx.splitCoins(primaryCoinAInput, [tx.pure.u64(amount)])
    tx.transferObjects([spitAmount], tx.pure.address(recipient))
    return this
  }
}
