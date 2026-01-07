/* eslint-disable @nx/enforce-module-boundaries */
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { ClmmPoolManager } from '../ClmmPoolManager';
import { ClmmPositionManager } from '../ClmmPositionManager';
import { ClmmPool } from '../entities/ClmmPool';
import { Coin } from '../../core';
import { FeeAmount } from '../constants';
import { NETWORK } from '../../core/constants';

export class CLMMTestHelper {
  private client: SuiClient;
  private poolManager: ClmmPoolManager;
  private positionManager: ClmmPositionManager;
  private network: NETWORK;

  constructor(network: NETWORK = 'testnet') {
    this.network = network;
    this.client = new SuiClient({ url: getFullnodeUrl(network) });
    this.poolManager = new ClmmPoolManager(network);
    this.positionManager = new ClmmPositionManager(network, this.poolManager);
  }

  async devInspectTransaction(tx: Transaction, sender: string) {
    return await this.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender,
    });
  }

  getClient() {
    return this.client;
  }

  getPoolManager() {
    return this.poolManager;
  }

  getPositionManager() {
    return this.positionManager;
  }

  getNetwork() {
    return this.network;
  }
}

// Test constants
export const TEST_ADDRESS =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
export const TEST_SUI_COIN = '0x2::sui::SUI';
export const TEST_USDC_COIN =
  '0xe5ef003af44e4a3340bb3296e6c3da23cd4088bc27585d37a01a60f2391964cc::usdc::USDC';
export const TEST_SQRT_PRICE_X64 = '18446744073709551616'; // Price = 1.0
export const TEST_TICK_LOWER = -3000; // Must be divisible by tick spacing (60 for MEDIUM fee)
export const TEST_TICK_UPPER = 3000; // Must be divisible by tick spacing (60 for MEDIUM fee)

// Create a test pool for integration tests
export const testPool = new ClmmPool(
  'test-pool',
  [new Coin(TEST_SUI_COIN), new Coin(TEST_USDC_COIN)],
  [],
  [1000000000000, 500000000000], // 1000 SUI, 500 USDC reserves
  FeeAmount.MEDIUM,
  TEST_SQRT_PRICE_X64,
  0,
  5000000000, // Higher liquidity
  1000000, // Some fee growth
  2000000
);
