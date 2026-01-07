# CLMM (Concentrated Liquidity Market Maker) SDK

The CLMM SDK provides a comprehensive set of tools for interacting with FlowX Finance's Concentrated Liquidity Market Maker protocol on the Sui blockchain. This SDK enables developers to manage liquidity pools, positions, and perform advanced DeFi operations.

## Installation

```bash
npm install @flowx-finance/sdk
```

## Quick Start

### Initialize Managers

```typescript
const network: NETWORK = 'mainnet'; // or 'testnet'
const poolManager = new ClmmPoolManager(network);
const positionManager = new ClmmPositionManager(network, poolManager);
```

### Creating a Pool

```typescript
// Define pool parameters
const coinX = new Coin('0x2::sui::SUI');
const coinY = new Coin('0xe5ef003af44e4a3340bb3296e6c3da23cd4088bc27585d37a01a60f2391964cc::usdc::USDC');
const fee = FeeAmount.MEDIUM; // 0.3%
const sqrtPriceX64 = '18446744073709551616'; // Initial sqrt price

const pool = new ClmmPool(
  '', // objectId (empty for new pools)
  [coinX, coinY],
  [], // poolRewards
  [0, 0], // reserves
  fee,
  sqrtPriceX64,
  0, // tickCurrent
  0, // liquidity
  0, // feeGrowthGlobalX
  0 // feeGrowthGlobalY
);

// Create pool transaction
const tx = new Transaction();
poolManager.tx(tx);
await poolManager.createPoolV2(pool);
```

### Opening a Position

```typescript
import { ClmmPosition, CoinAmount, Percent, BN } from '@flowx-finance/sdk';
import { TransactionResult } from '@mysten/sui/transactions';

// Define MaxU64 constant for convenience
const MaxU64 = new BN('18446744073709551615');

// Method 1: Create position with specific liquidity amount
const tickLower = -3000; // Lower price tick (must be divisible by tick spacing: 60 for MEDIUM fee)
const tickUpper = 3000; // Upper price tick (must be divisible by tick spacing: 60 for MEDIUM fee)
const liquidity = new BN(1000);

const position = new ClmmPosition({
  owner: '0x...', // Your address
  pool: pool,
  tickLower,
  tickUpper,
  liquidity,
  coinsOwedX: 0,
  coinsOwedY: 0,
  feeGrowthInsideXLast: 0,
  feeGrowthInsideYLast: 0,
  rewardInfos: [],
});

// Method 2: Create position with specific token amounts
const amountX = new BN('1000000000'); // 1 SUI (9 decimals)
const amountY = new BN('1000000'); // 1 USDC (6 decimals)

const positionFromAmounts = ClmmPosition.fromAmounts({
  owner: '0x...', // Your address
  pool: pool,
  tickLower: -3000,
  tickUpper: 3000,
  amountX: amountX,
  amountY: amountY,
  useFullPrecision: true, // Use full precision for liquidity calculation
});

// Method 3: Create position with only amountX (single-sided liquidity)
const positionOnlyX = ClmmPosition.fromAmountX({
  owner: '0x...', // Your address
  pool: pool,
  tickLower: -3000,
  tickUpper: 3000,
  amountX: amountX, // Only provide amountX
  useFullPrecision: true,
});

// Method 4: Create position with only amountY (single-sided liquidity)
const positionOnlyY = ClmmPosition.fromAmountY({
  owner: '0x...', // Your address
  pool: pool,
  tickLower: -3000,
  tickUpper: 3000,
  amountY: amountY, // Only provide amountY
  useFullPrecision: true,
});

// Create position with liquidity
const tx = new Transaction();
positionManager.tx(tx);
const options = {
  slippageTolerance: new Percent(1, 100), // 1% slippage
  deadline: Date.now() + 3600 * 1000, // 1 hour from now
  createPosition: true,
};

const createdPosition = positionManager.increaseLiquidity(position, options);
tx.transferObjects([createdPosition], recipient);
```

### Decreasing Liquidity

```typescript
// Example 1: Remove 50% of liquidity
const positionId = '0x...'; // Position object ID
const position = await positionManager.getPosition(positionId);
const liquidityToRemove = position.liquidity.div(new BN(2));

const positionWillBeDecreased = new ClmmPosition({
  owner: position.owner,
  pool: position.pool,
  tickLower: position.tickLower,
  tickUpper: position.tickUpper,
  liquidity: liquidityToRemove,
  coinsOwedX: 0,
  coinsOwedY: 0,
  feeGrowthInsideXLast: 0,
  feeGrowthInsideYLast: 0,
  rewardInfos: [],
});

const burnAmounts = {
  amountX: positionWillBeDecreased.amountX,
  amountY: positionWillBeDecreased.amountY,
};

const decreaseOptions = {
  slippageTolerance: new Percent(1, 100),
  deadline: Date.now() + 3600 * 1000, // 1 hour from now
  collectOptions: {
    expectedCoinOwedX: CoinAmount.fromRawAmount(coinX, burnAmounts.amountX),
    expectedCoinOwedY: CoinAmount.fromRawAmount(coinY, burnAmounts.amountY),
  },
};

const tx = new Transaction();
positionManager.tx(tx);
positionManager.decreaseLiquidity(position, decreaseOptions);

// Example 2: Remove all liquidity and close position
const positionToClose = await positionManager.getPosition(positionId);

const closeOptions = {
  slippageTolerance: new Percent(1, 100),
  deadline: Date.now() + 3600 * 1000, // 1 hour from now
  collectOptions: {
    // Use MaxU64 to ensure we collect all available fees regardless of fee growth during processing
    expectedCoinOwedX: CoinAmount.fromRawAmount(coinX, MaxU64),
    expectedCoinOwedY: CoinAmount.fromRawAmount(coinY, MaxU64),
  },
};

const closeTx = new Transaction();
positionManager.tx(closeTx);

// Remove all liquidity and collect fees
positionManager.decreaseLiquidity(positionToClose, closeOptions);

// Get all available rewards before closing
const rewards = await positionToClose.getRewards();

// Collect all available rewards
for (let i = 0; i < rewards.length; i++) {
  if (rewards[i].gt(new BN(0))) {
    const collectRewardOptions = {
      expectedRewardOwed: CoinAmount.fromRawAmount(
        positionToClose.pool.poolRewards[i].coin,
        MaxU64 // Use MaxU64 for rewards as well
      ),
      recipient: '0x...', // Optional recipient
    };

    positionManager.collectPoolReward(positionToClose, i, collectRewardOptions);
  }
}

// Close the position (burn the NFT)
positionManager.closePosition(positionToClose, closeTx);
```

### Collecting Fees and Rewards

```typescript
// Example 1: Collect accumulated fees only
const positionId = '0x...'; // Position object ID
const position = await positionManager.getPosition(positionId);

// Get current fees
const fees = await position.getFees();

if (fees.amountX.gt(new BN(0)) || fees.amountY.gt(new BN(0))) {
  const collectFeeOptions = {
    expectedCoinOwedX: CoinAmount.fromRawAmount(coinX, MaxU64),
    expectedCoinOwedY: CoinAmount.fromRawAmount(coinY, MaxU64),
    recipient: '0x...', // Optional recipient
  };

  const tx = new Transaction();
  positionManager.tx(tx);

  // Collect returns the collected coin objects
  const [collectedX, collectedY] = positionManager.collect(position, collectFeeOptions) as TransactionResult;

  // Transfer to recipient if not specified in collectFeeOptions
  if (!collectFeeOptions.recipient) {
    tx.transferObjects([collectedX, collectedY], position.owner);
  }
}

// Example 2: Collect specific reward tokens
const rewards = await position.getRewards();

for (let i = 0; i < rewards.length; i++) {
  if (rewards[i].gt(new BN(0))) {
    const collectRewardOptions = {
      expectedRewardOwed: CoinAmount.fromRawAmount(position.pool.poolRewards[i].coin, MaxU64),
      recipient: '0x...', // Optional recipient
    };

    const tx = new Transaction();
    positionManager.tx(tx);
    positionManager.collectPoolReward(position, i, collectRewardOptions);
  }
}
```

## Advanced Features

### Rebalancing Positions

```typescript
import { Rebalancer } from '@flowx-finance/sdk';

const rebalancer = new Rebalancer(network);

// Define rebalancing parameters
const rebalanceParams = {
  position: position,
  newTickLower: -2000,
  newTickUpper: 2000,
  slippageTolerance: new Percent(1, 100),
};

const tx = new Transaction();
await rebalancer.rebalance(rebalanceParams, tx);
```

## Fee Tiers

The CLMM protocol supports multiple fee tiers:

```typescript
import { FeeAmount } from '@flowx-finance/sdk';

const FeeTiers = {
  [FeeAmount.ZERO]: '0%', // 0 bps
  [FeeAmount.VERY_LOWEST]: '0.001%', // 1 bps
  [FeeAmount.LOWEST]: '0.01%', // 10 bps
  [FeeAmount.LOW]: '0.05%', // 50 bps
  [FeeAmount.MEDIUM]: '0.3%', // 300 bps
  [FeeAmount.HIGH]: '1%', // 1000 bps
};

// Example: Create pool with specific fee tier
const pool = new ClmmPool(
  '', // objectId
  [coinX, coinY],
  [], // poolRewards
  [0, 0], // reserves
  FeeAmount.LOW, // 0.05% fee tier
  sqrtPriceX64,
  0, // tickCurrent
  0, // liquidity
  0, // feeGrowthGlobalX
  0 // feeGrowthGlobalY
);
```

## API Reference

### ClmmPoolManager

- `createPool(pool, tx)` - Create a new liquidity pool
- `createPoolV2(pool)` - Create pool with metadata (recommended)
- `getPoolDetail(poolId)` - Retrieve detailed pool information
- `tx(transaction)` - Set transaction context for pool operations

### ClmmPositionManager

- `openPosition(position)` - Open a new liquidity position (returns position object)
- `closePosition(position, tx)` - Close an existing position
- `increaseLiquidity(position, options)` - Add liquidity to position
- `decreaseLiquidity(position, options)` - Remove liquidity from position
- `collect(position, options)` - Collect accumulated fees (returns [coinX, coinY] array)
- `collectPoolReward(position, rewardIndex, options)` - Collect reward tokens
- `getPosition(positionId)` - Retrieve position details
- `tx(transaction)` - Set transaction context for position operations

### ClmmPosition

- `amountX` / `amountY` - Current token amounts in position
- `mintAmounts` - Required amounts for minting liquidity
- `mintAmountsWithSlippage(tolerance)` - Minimum amounts with slippage protection
- `burnAmountsWithSlippage(tolerance)` - Maximum amounts with slippage protection for burning
- `getFees()` - Get accumulated fees (async)
- `getRewards()` - Get accumulated rewards (async)
- `priceLower` / `priceUpper` - Price bounds of the position
- `fromAmounts(params)` - Static method to create position from token amounts

### ClmmPool

- `coinXPrice` / `coinYPrice` - Current exchange rates
- `priceOf(coin)` - Get price of specific coin in the pool
- `getInputAmount(outputAmount, inputCoin)` - Calculate required input for desired output
- `getOutputAmount(inputAmount, outputCoin)` - Calculate expected output for given input
- `coins` - Array of pool coins [coinX, coinY]
- `fee` - Pool fee tier
- `sqrtPriceX64` - Current sqrt price
- `tickCurrent` - Current tick
- `liquidity` - Total pool liquidity
