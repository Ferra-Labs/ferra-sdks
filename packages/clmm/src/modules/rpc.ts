import { Transaction } from '@mysten/sui/transactions'
import {
  DevInspectResults,
  DynamicFieldPage,
  PaginatedEvents,
  PaginatedObjectsResponse,
  PaginatedTransactionResponse,
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
 * RPC module for making remote procedure calls to Sui blockchain
 * Extends SuiClient to provide enhanced pagination, batching, and transaction utilities
 * Handles event querying, object retrieval, and transaction simulation/execution
 */
export class RpcModule extends SuiClient {
  /**
   * Retrieves events matching the given query criteria with pagination support
   * @param eventFilter - Filter criteria for event selection
   * @param paginationConfig - Pagination configuration ('all' or specific limits)
   * @returns Promise resolving to paginated event data
   */
  async queryEventsByPage(eventFilter: SuiEventFilter, paginationConfig: PaginationArgs = 'all'): Promise<DataPage<any>> {
    let combinedResults: any = []
    let hasMorePages = true
    const shouldQueryAll = paginationConfig === 'all'
    let currentCursor = shouldQueryAll ? null : paginationConfig.cursor

    do {
      const eventResponse: PaginatedEvents = await this.queryEvents({
        query: eventFilter,
        cursor: currentCursor,
        limit: shouldQueryAll ? null : paginationConfig.limit,
      })

      if (eventResponse.data) {
        combinedResults = [...combinedResults, ...eventResponse.data]
        hasMorePages = eventResponse.hasNextPage
        currentCursor = eventResponse.nextCursor
      } else {
        hasMorePages = false
      }
    } while (shouldQueryAll && hasMorePages)

    return { data: combinedResults, nextCursor: currentCursor, hasNextPage: hasMorePages }
  }

  /**
   * Queries transaction blocks with pagination support
   * @param transactionFilter - Optional filter for transaction selection
   * @param paginationConfig - Pagination configuration ('all' or specific limits)
   * @param sortOrder - Sort order for results (ascending/descending)
   * @returns Promise resolving to paginated transaction data
   */
  async queryTransactionBlocksByPage(
    transactionFilter?: TransactionFilter,
    paginationConfig: PaginationArgs = 'all',
    sortOrder: 'ascending' | 'descending' | null | undefined = 'ascending'
  ): Promise<DataPage<SuiTransactionBlockResponse>> {
    let combinedResults: any = []
    let hasMorePages = true
    const shouldQueryAll = paginationConfig === 'all'
    let currentCursor = shouldQueryAll ? null : paginationConfig.cursor

    do {
      const transactionResponse: PaginatedTransactionResponse = await this.queryTransactionBlocks({
        filter: transactionFilter,
        cursor: currentCursor,
        order: sortOrder,
        limit: shouldQueryAll ? null : paginationConfig.limit,
        options: { showEvents: true },
      })

      if (transactionResponse.data) {
        combinedResults = [...combinedResults, ...transactionResponse.data]
        hasMorePages = transactionResponse.hasNextPage
        currentCursor = transactionResponse.nextCursor
      } else {
        hasMorePages = false
      }
    } while (shouldQueryAll && hasMorePages)

    return { data: combinedResults, nextCursor: currentCursor, hasNextPage: hasMorePages }
  }

  /**
   * Retrieves all objects owned by a specific address with pagination
   * @param ownerAddress - Address of the object owner
   * @param queryOptions - Query options for object filtering
   * @param paginationConfig - Pagination configuration ('all' or specific limits)
   * @returns Promise resolving to paginated owned objects data
   */
  async getOwnedObjectsByPage(
    ownerAddress: string,
    queryOptions: SuiObjectResponseQuery,
    paginationConfig: PaginationArgs = 'all'
  ): Promise<DataPage<any>> {
    let combinedResults: any = []
    let hasMorePages = true
    const shouldQueryAll = paginationConfig === 'all'
    let currentCursor = shouldQueryAll ? null : paginationConfig.cursor

    do {
      const objectResponse: PaginatedObjectsResponse = await this.getOwnedObjects({
        owner: ownerAddress,
        ...queryOptions,
        cursor: currentCursor,
        limit: shouldQueryAll ? null : paginationConfig.limit,
      })

      if (objectResponse.data) {
        combinedResults = [...combinedResults, ...objectResponse.data]
        hasMorePages = objectResponse.hasNextPage
        currentCursor = objectResponse.nextCursor
      } else {
        hasMorePages = false
      }
    } while (shouldQueryAll && hasMorePages)

    return { data: combinedResults, nextCursor: currentCursor, hasNextPage: hasMorePages }
  }

  /**
   * Retrieves dynamic fields for a parent object with pagination support
   * @param parentObjectId - ID of the parent object containing dynamic fields
   * @param paginationConfig - Pagination configuration ('all' or specific limits)
   * @returns Promise resolving to paginated dynamic fields data
   */
  async getDynamicFieldsByPage(parentObjectId: SuiObjectIdType, paginationConfig: PaginationArgs = 'all'): Promise<DataPage<any>> {
    let combinedResults: any = []
    let hasMorePages = true
    const shouldQueryAll = paginationConfig === 'all'
    let currentCursor = shouldQueryAll ? null : paginationConfig.cursor

    do {
      const dynamicFieldResponse: DynamicFieldPage = await this.getDynamicFields({
        parentId: parentObjectId,
        cursor: currentCursor,
        limit: shouldQueryAll ? null : paginationConfig.limit,
      })

      if (dynamicFieldResponse.data) {
        combinedResults = [...combinedResults, ...dynamicFieldResponse.data]
        hasMorePages = dynamicFieldResponse.hasNextPage
        currentCursor = dynamicFieldResponse.nextCursor
      } else {
        hasMorePages = false
      }
    } while (shouldQueryAll && hasMorePages)

    return { data: combinedResults, nextCursor: currentCursor, hasNextPage: hasMorePages }
  }

  /**
   * Retrieves object details in batches to avoid API limits
   * Note: Duplicate object IDs will cause the call to fail
   * @param objectIds - Array of object IDs to retrieve
   * @param dataOptions - Options for object data retrieval
   * @param batchSize - Maximum number of objects per batch request
   * @returns Promise resolving to array of object responses
   */
  async batchGetObjects(objectIds: SuiObjectIdType[], dataOptions?: SuiObjectDataOptions, batchSize = 50): Promise<SuiObjectResponse[]> {
    let objectResponses: SuiObjectResponse[] = []

    try {
      for (let batchIndex = 0; batchIndex < Math.ceil(objectIds.length / batchSize); batchIndex++) {
        const batchResponse = await this.multiGetObjects({
          ids: objectIds.slice(batchIndex * batchSize, batchSize * (batchIndex + 1)),
          options: dataOptions,
        })
        objectResponses = [...objectResponses, ...batchResponse]
      }
    } catch (batchError) {
      console.log(batchError)
    }

    return objectResponses
  }

  /**
   * Estimates the gas cost required for executing a transaction
   * @param transaction - The transaction to estimate gas for
   * @returns Promise resolving to the estimated gas cost
   * @throws Error if transaction sender is not specified
   */
  async calculationTxGas(transaction: Transaction): Promise<number> {
    const { sender } = transaction.blockData

    if (sender === undefined) {
      throw Error('Transaction sender is required for gas calculation')
    }

    const inspectionResult = await this.devInspectTransactionBlock({
      transactionBlock: transaction,
      sender,
    })
    const { gasUsed } = inspectionResult.effects

    const totalGasCost = Number(gasUsed.computationCost) + Number(gasUsed.storageCost) - Number(gasUsed.storageRebate)
    return totalGasCost
  }

  /**
   * Signs and executes a transaction using the provided keypair
   * @param signingKeypair - Keypair for transaction signing (Ed25519 or Secp256k1)
   * @param transaction - Transaction to sign and execute
   * @returns Promise resolving to transaction response or undefined on failure
   */
  async sendTransaction(signingKeypair: Ed25519Keypair | Secp256k1Keypair, transaction: Transaction): Promise<SuiTransactionBlockResponse | undefined> {
    try {
      const executionResult: any = await this.signAndExecuteTransaction({
        transaction: transaction,
        signer: signingKeypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      })
      return executionResult
    } catch (executionError) {
      console.dir(executionError, { depth: null })
    }
    return undefined
  }

  /**
   * Simulates transaction execution without committing to blockchain
   * @param transaction - Transaction to simulate
   * @param simulationAddress - Address to use for simulation
   * @param enableDevInspect - Whether to use DevInspect mode (default: true)
   * @returns Promise resolving to simulation results or undefined on failure
   */
  async sendSimulationTransaction(
    transaction: Transaction,
    simulationAddress: string,
    enableDevInspect = true
  ): Promise<DevInspectResults | undefined> {
    try {
      if (enableDevInspect) {
        const simulationResult = await this.devInspectTransactionBlock({
          transactionBlock: transaction,
          sender: simulationAddress,
        })
        return simulationResult
      }


    } catch (simulationError) {
      console.log('Transaction simulation failed:', simulationError)
    }

    return undefined
  }
}