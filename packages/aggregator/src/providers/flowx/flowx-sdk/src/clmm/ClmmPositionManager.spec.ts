import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  coinWithBalance,
  Transaction,
  TransactionResult,
} from '@mysten/sui/transactions';
import { ClmmPositionManager } from './ClmmPositionManager';
import { ClmmPoolManager } from './ClmmPoolManager';
import { ClmmPosition } from './entities/ClmmPosition';
import { Coin, CoinAmount, ONE, Percent } from '../core';
import {
  CLMMTestHelper,
  TEST_ADDRESS,
  TEST_SQRT_PRICE_X64,
  TEST_SUI_COIN,
  TEST_USDC_COIN,
  testPool,
} from './tests/test-setup';
import { ClmmPool } from './entities';
import { FeeAmount } from './constants';
import { BN } from 'bn.js';

describe('Position Manager CLMM Test', () => {
  it(`get user liquidity position`, async () => {
    const poolManager = new ClmmPoolManager('mainnet');
    const positionManager = new ClmmPositionManager('mainnet', poolManager);
    const positions = await positionManager.getUserPositions(
      '0xa52b3f2e8b3f0dac377f753eeade7f7c6b329a97c227425a59b91c1e2f8dff2c'
    );
    const positionRewards = await positionManager.getPositionReward(positions);

    for (const [pIndex, position] of positions.entries()) {
      const rewards = await position.getRewards();
      rewards.forEach((reward, rIndex) => {
        const incentiveReward =
          positionRewards[pIndex]?.incentiveReward?.[
            rIndex
          ]?.quotient.toNumber() || 0;
        const rewardValue = reward.toNumber();

        if (incentiveReward > 0) {
          const percentDiff =
            ((rewardValue - incentiveReward) / incentiveReward) * 100;
          expect(percentDiff).toBeLessThanOrEqual(0.001);
        } else {
          expect(rewardValue).toBe(0);
        }
      });
    }
  }, 30000);

  describe('ClmmPositionManager Unit Tests', () => {
    let positionManager: ClmmPositionManager;
    let poolManager: ClmmPoolManager;
    let testHelper: CLMMTestHelper;
    let mockPosition: ClmmPosition;
    let tx: Transaction;

    beforeEach(async () => {
      tx = new Transaction();
      testHelper = new CLMMTestHelper('testnet');
      poolManager = testHelper.getPoolManager();
      poolManager.tx(tx);
      positionManager = testHelper.getPositionManager();
      positionManager.tx(tx);

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

      await testHelper.getPoolManager().createPoolV2(pool);

      // Create a mock position for testing
      mockPosition = new ClmmPosition({
        owner: TEST_ADDRESS,
        pool: pool,
        tickLower: -3000,
        tickUpper: 3000,
        liquidity: new BN(1000000000),
        coinsOwedX: new BN(0),
        coinsOwedY: new BN(0),
        feeGrowthInsideXLast: new BN(0),
        feeGrowthInsideYLast: new BN(0),
        rewardInfos: [],
      });
    });

    describe('Constructor', () => {
      it('should create instance with correct network and pool manager', () => {
        expect(positionManager.network).toBe('testnet');
        expect(positionManager.poolManager).toBe(poolManager);
      });

      it('should default to mainnet if no network specified', () => {
        const manager = new ClmmPositionManager('mainnet', poolManager);
        expect(manager.network).toBe('mainnet');
      });
    });

    describe('openPosition', () => {
      it('should create a move call to open position', async () => {
        const position = positionManager.openPosition(mockPosition);
        tx.transferObjects([position], TEST_ADDRESS);

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });
    });

    describe('increaseLiquidity', () => {
      const options = {
        slippageTolerance: new Percent(1, 100),
        deadline: Date.now() + 3600 * 1000, // 1 hour from now
        createPosition: true,
      };

      it('should increase liquidity correctly', async () => {
        positionManager.increaseLiquidity(mockPosition, options);

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });

      it('should use provided coin inputs', async () => {
        const coinXIn = coinWithBalance({
          type: TEST_SUI_COIN,
          balance: BigInt(mockPosition.amountX.quotient.toString()),
          useGasCoin: true,
        })(tx);
        const coinYIn = coinWithBalance({
          type: TEST_USDC_COIN,
          balance: BigInt(mockPosition.amountY.quotient.toString()),
          useGasCoin: false,
        })(tx);
        positionManager.increaseLiquidity(mockPosition, {
          ...options,
          coinXIn,
          coinYIn,
        });

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });

      it('should increase liquidity with specific token amounts', async () => {
        const amountX = new BN('1000000000'); // 1 SUI (9 decimals)
        const amountY = new BN('1000000'); // 1 USDC (6 decimals)

        const positionFromAmounts = ClmmPosition.fromAmounts({
          owner: TEST_ADDRESS,
          pool: mockPosition.pool,
          tickLower: -3000,
          tickUpper: 3000,
          amountX: amountX,
          amountY: amountY,
          useFullPrecision: true,
        });

        positionManager.increaseLiquidity(positionFromAmounts, options);

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });

      it('should increase liquidity with only amountX (single-sided)', async () => {
        const amountX = new BN('2000000000'); // 2 SUI (9 decimals)

        const positionOnlyX = ClmmPosition.fromAmountX({
          owner: TEST_ADDRESS,
          pool: mockPosition.pool,
          tickLower: -3000,
          tickUpper: 3000,
          amountX: amountX,
          useFullPrecision: true,
        });
        expect(positionOnlyX.amountX.quotient.toString()).toEqual(
          amountX.sub(ONE).toString()
        );

        positionManager.increaseLiquidity(positionOnlyX, options);

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });

      it('should increase liquidity with only amountY (single-sided)', async () => {
        const amountY = new BN('2000000'); // 2 USDC (6 decimals)

        const positionOnlyY = ClmmPosition.fromAmountY({
          owner: TEST_ADDRESS,
          pool: mockPosition.pool,
          tickLower: -3000,
          tickUpper: 3000,
          amountY: amountY,
          useFullPrecision: true,
        });
        expect(positionOnlyY.amountY.quotient.toString()).toEqual(
          amountY.sub(ONE).toString()
        );

        positionManager.increaseLiquidity(positionOnlyY, options);

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });
    });

    describe('decreaseLiquidity', () => {
      const options = {
        slippageTolerance: new Percent(2, 100),
        deadline: Date.now() + 3600 * 1000, // 1 hour from now
        createPosition: true,
      };

      beforeEach(async () => {
        const createdPosition = positionManager.increaseLiquidity(
          mockPosition,
          {
            slippageTolerance: new Percent(2, 100),
            deadline: Date.now() + 3600 * 1000, // 1 hour from now
            createPosition: true,
          }
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockPosition as any)['id'] = createdPosition;
      });

      it('should decrease liquidity correctly', async () => {
        positionManager.decreaseLiquidity(mockPosition, options);

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });
    });

    describe('collect', () => {
      beforeEach(async () => {
        const createdPosition = positionManager.increaseLiquidity(
          mockPosition,
          {
            slippageTolerance: new Percent(2, 100),
            deadline: Date.now() + 3600 * 1000, // 1 hour from now
            createPosition: true,
          }
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mockPosition as any)['id'] = createdPosition;
      });

      const decreaseLiqOptions = {
        slippageTolerance: new Percent(2, 100),
        deadline: Date.now() + 3600 * 1000, // 1 hour from now
        createPosition: true,
      };

      const collectOptions = {
        expectedCoinOwedX: CoinAmount.fromRawAmount(testPool.coinX, '1000'),
        expectedCoinOwedY: CoinAmount.fromRawAmount(testPool.coinY, '2000'),
      };

      it('should collect coins correctly', async () => {
        positionManager.decreaseLiquidity(mockPosition, decreaseLiqOptions);
        const [collectedX, collectedY] = positionManager.collect(
          mockPosition,
          collectOptions
        ) as TransactionResult;
        tx.transferObjects([collectedX, collectedY], TEST_ADDRESS);

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });

      it('should transfer objects to recipient when provided', async () => {
        positionManager.decreaseLiquidity(mockPosition, decreaseLiqOptions);
        positionManager.collect(mockPosition, {
          ...collectOptions,
          recipient: TEST_ADDRESS,
        });

        const result = await testHelper.devInspectTransaction(tx, TEST_ADDRESS);
        expect(result.effects.status.status).toBe('success');
      });

      it('should validate recipient address', () => {
        const tx = new Transaction();
        positionManager.tx(tx);

        expect(() => {
          positionManager.collect(mockPosition, {
            ...collectOptions,
            recipient: 'invalid_address',
          });
        }).toThrow('RECIPIENT');
      });
    });
  });
});
