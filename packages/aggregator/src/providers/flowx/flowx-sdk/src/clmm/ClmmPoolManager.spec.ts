import { describe, it, expect, beforeAll } from '@jest/globals';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeStructTag } from '@mysten/sui/utils';
import { ClmmPoolManager } from './ClmmPoolManager';
import { ClmmPool } from './entities/ClmmPool';
import { FeeAmount } from './constants';
import { Coin } from '../core';
import {
  CLMMTestHelper,
  TEST_ADDRESS,
  TEST_SUI_COIN,
  TEST_USDC_COIN,
  TEST_SQRT_PRICE_X64,
} from './tests/test-setup';

describe('Pool Manager CLMM Test', () => {
  let testHelper: CLMMTestHelper;

  beforeAll(() => {
    testHelper = new CLMMTestHelper('testnet');
  });

  it(`get all pool`, async () => {
    const poolManager = new ClmmPoolManager('mainnet');
    const pools = await poolManager.getPools();

    expect(pools.length >= 400).toBeTruthy();
  }, 999999999);

  describe('Pool Creation', () => {
    it('should create a pool successfully', async () => {
      // Arrange
      const coinX = new Coin(TEST_SUI_COIN);
      const coinY = new Coin(TEST_USDC_COIN);
      const pool = new ClmmPool(
        '',
        [coinX, coinY],
        [],
        [0, 0],
        FeeAmount.MEDIUM,
        TEST_SQRT_PRICE_X64,
        0,
        0,
        0,
        0
      );

      // Act
      const tx = new Transaction();
      testHelper.getPoolManager().tx(tx);
      await testHelper.getPoolManager().createPoolV2(pool);

      // Dev inspect the transaction
      const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);

      // Assert
      expect(result.effects?.status?.status).toBe('success');
      expect(result.effects?.created).toBeDefined();
      expect(result.effects?.created?.length).toBeGreaterThan(0);
    });

    it('should fail with invalid fee amount', async () => {
      // Arrange
      const coinX = new Coin(TEST_SUI_COIN);
      const coinY = new Coin(TEST_USDC_COIN);

      const pool = new ClmmPool(
        '',
        [coinX, coinY],
        [],
        [0, 0],
        99999 as FeeAmount, // Invalid fee amount
        TEST_SQRT_PRICE_X64,
        0,
        0,
        0,
        0
      );

      // Act & Assert
      const tx = new Transaction();
      testHelper.getPoolManager().tx(tx);
      await testHelper.getPoolManager().createPoolV2(pool);

      // Dev inspect the transaction
      const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);

      // Assert
      expect(result.effects?.status?.status).toBe('failure');
    });

    it('should validate coin order', () => {
      // Arrange
      const coinX = new Coin(TEST_SUI_COIN);
      const coinY = new Coin(TEST_USDC_COIN);

      // Act
      const pool = new ClmmPool(
        'test-pool-id',
        [coinX, coinY],
        [],
        [1000000000, 1000000000],
        FeeAmount.MEDIUM,
        TEST_SQRT_PRICE_X64,
        0,
        1000000,
        0,
        0
      );

      // Assert
      expect(pool.coinX.coinType).toBe(normalizeStructTag(TEST_SUI_COIN));
      expect(pool.coinY.coinType).toBe(TEST_USDC_COIN);
      expect(pool.fee).toBe(FeeAmount.MEDIUM);
    });

    it('should calculate pool prices correctly', () => {
      // Arrange
      const coinX = new Coin(TEST_SUI_COIN);
      const coinY = new Coin(TEST_USDC_COIN);
      const pool = new ClmmPool(
        'test-pool-id',
        [coinX, coinY],
        [],
        [1000000000, 1000000000],
        FeeAmount.MEDIUM,
        TEST_SQRT_PRICE_X64,
        0,
        1000000,
        0,
        0
      );

      // Act
      const coinXPrice = pool.coinXPrice;
      const coinYPrice = pool.coinYPrice;

      // Assert
      expect(coinXPrice).toBeDefined();
      expect(coinYPrice).toBeDefined();
      expect(coinXPrice.invert().eq(coinYPrice)).toBe(true);
    });

    it('should validate pool involves coin', () => {
      // Arrange
      const coinX = new Coin(TEST_SUI_COIN);
      const coinY = new Coin(TEST_USDC_COIN);
      const otherCoin = new Coin('0x1::other::COIN');
      const pool = new ClmmPool(
        'test-pool-id',
        [coinX, coinY],
        [],
        [1000000000, 1000000000],
        FeeAmount.MEDIUM,
        TEST_SQRT_PRICE_X64,
        0,
        1000000,
        0,
        0
      );

      // Act & Assert
      expect(pool.involvesCoin(coinX)).toBe(true);
      expect(pool.involvesCoin(coinY)).toBe(true);
      expect(pool.involvesCoin(otherCoin)).toBe(false);
    });
  });
});
