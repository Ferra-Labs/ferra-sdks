import { Inputs, Transaction } from '@mysten/sui/transactions'
import {
  DevInspectResults,
  DynamicFieldPage,
  PaginatedEvents,
  PaginatedObjectsResponse,
  PaginatedTransactionResponse,
  QueryTransactionBlocksParams,
  SuiClient,
  SuiEventFilter,
  SuiObjectDataOptions,
  SuiObjectResponse,
  SuiObjectResponseQuery,
  SuiTransactionBlockResponse,
  TransactionFilter,
} from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1'


import { DataPage, PaginationArgs, SuiObjectIdType } from '../types'

/**
 * Represents a module for making RPC (Remote Procedure Call) requests.
 */
export class RpcModule extends SuiClient {
  /**
   * Get events for a given query criteria
   * @param query
   * @param paginationArgs
   * @returns
   */
  async queryEventsByPage(query: SuiEventFilter, paginationArgs: PaginationArgs = 'all'): Promise<DataPage<any>> {
    let result: any = []
    let hasNextPage = true
    const queryAll = paginationArgs === 'all'
    let nextCursor = queryAll ? null : paginationArgs.cursor

    do {
      const res: PaginatedEvents = await this.queryEvents({
        query,
        cursor: nextCursor,
        limit: queryAll ? null : paginationArgs.limit,
      })
      if (res.data) {
        result = [...result, ...res.data]
        hasNextPage = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        hasNextPage = false
      }
    } while (queryAll && hasNextPage)

    return { data: result, nextCursor, hasNextPage }
  }

  async queryTransactionBlocksByPage(
    filter?: TransactionFilter,
    paginationArgs: PaginationArgs = 'all',
    order: 'ascending' | 'descending' | null | undefined = 'ascending'
  ): Promise<DataPage<SuiTransactionBlockResponse>> {
    let result: any = []
    let hasNextPage = true
    const queryAll = paginationArgs === 'all'
    let nextCursor = queryAll ? null : paginationArgs.cursor

    do {
      const res: PaginatedTransactionResponse = await this.queryTransactionBlocks({
        filter,
        cursor: nextCursor,
        order,
        limit: queryAll ? null : paginationArgs.limit,
        options: { showEvents: true },
      })
      if (res.data) {
        result = [...result, ...res.data]
        hasNextPage = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        hasNextPage = false
      }
    } while (queryAll && hasNextPage)

    return { data: result, nextCursor, hasNextPage }
  }

  /**
   * Get all objects owned by an address
   * @param owner
   * @param query
   * @param paginationArgs
   * @returns
   */
  async getOwnedObjectsByPage(
    owner: string,
    query: SuiObjectResponseQuery,
    paginationArgs: PaginationArgs = 'all'
  ): Promise<DataPage<any>> {
    let result: any = []
    let hasNextPage = true
    const queryAll = paginationArgs === 'all'
    let nextCursor = queryAll ? null : paginationArgs.cursor
    do {
      const res: PaginatedObjectsResponse = await this.getOwnedObjects({
        owner,
        ...query,
        cursor: nextCursor,
        limit: queryAll ? null : paginationArgs.limit,
      })
      if (res.data) {
        result = [...result, ...res.data]
        hasNextPage = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        hasNextPage = false
      }
    } while (queryAll && hasNextPage)

    return { data: result, nextCursor, hasNextPage }
  }

  /**
   * Return the list of dynamic field objects owned by an object
   * @param parentId
   * @param paginationArgs
   * @returns
   */
  async getDynamicFieldsByPage(parentId: SuiObjectIdType, paginationArgs: PaginationArgs = 'all'): Promise<DataPage<any>> {
    let result: any = []
    let hasNextPage = true
    const queryAll = paginationArgs === 'all'
    let nextCursor = queryAll ? null : paginationArgs.cursor
    do {
      const res: DynamicFieldPage = await this.getDynamicFields({
        parentId,
        cursor: nextCursor,
        limit: queryAll ? null : paginationArgs.limit,
      })

      if (res.data) {
        result = [...result, ...res.data]
        hasNextPage = res.hasNextPage
        nextCursor = res.nextCursor
      } else {
        hasNextPage = false
      }
    } while (queryAll && hasNextPage)

    return { data: result, nextCursor, hasNextPage }
  }

  /**
   * Batch get details about a list of objects. If any of the object ids are duplicates the call will fail
   * @param ids
   * @param options
   * @param limit
   * @returns
   */
  async batchGetObjects(ids: SuiObjectIdType[], options?: SuiObjectDataOptions, limit = 50): Promise<SuiObjectResponse[]> {
    let objectDataResponses: SuiObjectResponse[] = []

    for (let i = 0; i < Math.ceil(ids.length / limit); i++) {
      try {
        const res = await this.multiGetObjects({
          ids: ids.slice(i * limit, limit * (i + 1)),
          options,
        })
        objectDataResponses = [...objectDataResponses, ...res]
      } catch (error) {
        console.error(`Batch ${i} failed:`, error)
        throw error
      }
    }

    return objectDataResponses
  }

  /**
 * Calculates the gas cost of a transaction block.
 * @param {Transaction} tx - The transaction block to calculate gas for.
 * @returns {Promise<number>} - The estimated gas cost of the transaction block.
 * @throws {Error} - Throws an error if the sender is empty or devInspect fails.
 */
  async calculationTxGas(tx: Transaction): Promise<number> {
    const { sender } = tx.blockData

    if (sender === undefined) {
      throw Error('Transaction sender is required')
    }

    const devResult = await this.devInspectTransactionBlock({
      transactionBlock: tx,
      sender,
    })

    // CHECK FOR ERRORS FIRST
    if (devResult.error) {
      console.error('DevInspect failed:', devResult.error)
      throw new Error(`Gas estimation failed: ${devResult.error}`)
    }

    // CHECK EFFECTS EXISTS
    if (!devResult.effects) {
      throw new Error('Gas estimation failed: No effects returned from devInspect')
    }

    // CHECK GASUSED EXISTS
    if (!devResult.effects.gasUsed) {
      throw new Error('Gas estimation failed: No gas information in effects')
    }

    const { gasUsed } = devResult.effects

    // VALIDATE GAS VALUES
    if (!gasUsed.computationCost || !gasUsed.storageCost || gasUsed.storageRebate === undefined) {
      throw new Error('Gas estimation failed: Incomplete gas information')
    }

    const estimateGas =
      Number(gasUsed.computationCost) +
      Number(gasUsed.storageCost) -
      Number(gasUsed.storageRebate)

    // SANITY CHECK
    if (estimateGas < 0 || !Number.isFinite(estimateGas)) {
      throw new Error(`Gas estimation failed: Invalid gas value ${estimateGas}`)
    }

    return estimateGas
  }

  /**
   * Sends a transaction block after signing it with the provided keypair.
   *
   * @param {Ed25519Keypair | Secp256k1Keypair} keypair - The keypair used for signing the transaction.
   * @param {Transaction} tx - The transaction block to send.
   * @returns {Promise<SuiTransactionBlockResponse | undefined>} - The response of the sent transaction block.
   */
  async sendTransaction(keypair: Ed25519Keypair | Secp256k1Keypair, tx: Transaction): Promise<SuiTransactionBlockResponse | undefined> {
    try {
      const resultTxn = await this.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      })
      return resultTxn
    } catch (error) {
      console.error('Transaction failed:', error)
      throw error
    }
  }

  /**
   * Send a simulation transaction.
   * @param tx - The transaction block.
   * @param simulationAccount - The simulation account.
   * @param useDevInspect - A flag indicating whether to use DevInspect. Defaults to true.
   * @returns A promise that resolves to DevInspectResults or undefined.
   */
  async sendSimulationTransaction(
    tx: Transaction,
    simulationAccount: string,
    useDevInspect = true
  ): Promise<DevInspectResults | undefined> {
    try {
      if (useDevInspect) {
        const simulateRes = await this.devInspectTransactionBlock({
          transactionBlock: tx,
          sender: simulationAccount,
        })
        return simulateRes
      }

    } catch (error) {
      console.error('sendSimulationTransaction failed:', error)
      throw error
    }
  }
}
