# FlowX SDK Universal Router

## Overview

The FlowX SDK Universal Router is a comprehensive swap aggregation system built for the Sui blockchain ecosystem. It provides a unified interface for executing trades across multiple DEXs (Decentralized Exchanges) and protocols, optimizing for the best prices and routes while handling complex multi-hop swaps seamlessly.

## Usage Examples

#### Swaps

```typescript
// Swap without commission
const swap = async (tx: Transaction) => {
  const routes = await quoter.getRoutes({
    sender,
    tokenIn: normalizeStructTag(SUI_TYPE_ARG),
    tokenOut: normalizeStructTag('0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'),
    amountIn: 1e9, // 1 SUI
    slippage,
    commission,
  });

  const coinOut = await TradeBuilder.fromRoutes(routes.routes).sender(sender).slippage(slippage).recipient(sender).build().swap({ client, tx });

  return coinOut;
};

// Swap with commission on input token
const swapWithInputCommission = async (tx: Transaction) => {
  const commission = new Commission(
    '0x...', // Commission recipient
    new Coin(normalizeStructTag(SUI_TYPE_ARG)), // Commission on SUI
    CommissionType.PERCENTAGE,
    1000 // 0.1% commission
  );

  const routes = await quoter.getRoutes({
    sender,
    tokenIn: normalizeStructTag(SUI_TYPE_ARG),
    tokenOut: normalizeStructTag('0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'),
    amountIn: 1e9, // 1 SUI
    slippage,
    commission,
  });

  const coinOut = await TradeBuilder.fromRoutes(routes.routes).sender(sender).slippage(slippage).recipient(sender).commission(commission).build().swap({ client, tx });

  return coinOut;
};

// Swap with commission on output token
const swapWithOutputCommission = async () => {
  const commission = new Commission(
    '0x...', // Commission recipient
    new Coin(normalizeStructTag('0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC')), // Commission on USDC
    CommissionType.FLAT,
    1000000 // 1 USDC flat commission
  );

  const routes = await quoter.getRoutes({
    sender,
    tokenIn: normalizeStructTag(SUI_TYPE_ARG),
    tokenOut: normalizeStructTag('0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'),
    amountIn: 1e9, // 1 SUI
    slippage,
    commission,
  });

  const coinOut = await TradeBuilder.fromRoutes(routes.routes).sender(sender).slippage(slippage).recipient(sender).commission(commission).build().swap({ client, tx });

  return coinOut;
};
```

## Adding New Protocol Support

The FlowX SDK Universal Router is designed with extensibility in mind, allowing developers to easily integrate new DEX protocols and trading mechanisms. This section provides a comprehensive guide on how to implement support for a new protocol.

### Step-by-Step Implementation Guide

#### 1. **Define Protocol Enum and Constants**

#### 2. **Create Protocol-Specific Swap Implementation**

Create a new swap class that inherits from the base `Swap` class:

```typescript
// src/universal-router/entities/protocols/YourNewProtocolSwap.ts
export class YourNewProtocolSwap extends Swap<Coin, Coin, any, any> {
  public swap =
    (routeObject: TransactionResult, slippage: Percent, pythMap: Record<string, string>) =>
    (tx: Transaction): void => {
      // Implement the protocol-specific swap logic
    };
}
```

#### 3. **Update AggregatorQuoter buildPath Method**

Add your protocol case to the `buildPath` method:

```typescript
// src/universal-router/quoters/AggregatorQuoter.ts

private buildPath(path: Path, protocolConfig: any) {
  switch (path.source) {
    // ...existing cases...

    case Protocol.YOUR_NEW_PROTOCOL: {
      const extra = path.extra as YourNewProtocolExtra;
      return new YourNewProtocolSwap({
        network: this.network,
        pool: new ObjectId(path.poolId),
        input: new Coin(path.tokenIn),
        output: new Coin(path.tokenOut),
        amountIn: path.amountIn.toString(),
        amountOut: path.amountOut.toString(),
        swapXToY: !!extra.swapXToY,
        feeRate: extra.feeRate,
        // Map other protocol-specific parameters
        protocolConfig,
      });
    }

    // ...other cases...
  }
}
```
