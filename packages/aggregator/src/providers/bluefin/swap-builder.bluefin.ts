import { SuiClient } from "@mysten/sui/client";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { FerraConfig, SwapCustomizableOutput } from "../../interfaces/IAggSwapV2";
import { Config } from "./bluefin-sdk/src/config";
import { QuoteResponse } from "./bluefin-sdk/src/types/aggregator";
import { buildTxWithoutSettle } from "./bluefin-sdk/src/features/swap";
import { _7K_CONFIG, _7K_VAULT } from "./bluefin-sdk/src/constants/_7k";

/**
 * Bluefin7kSwapBuilder - Build swap transactions using Bluefin7k aggregator routes
 * wrapped with Ferra protocol for fee collection
 *
 * Transaction Flow:
 * 1. ferra::bluefin::start_swap → (SwapRequest, coinForSwap)
 * 2. buildTxWithoutSettle (SDK) → execute routing
 * 3. ferra::bluefin::confirm_swap → validate slippage, deduct fee
 */
export class Bluefin7kSwapBuilder {

  private ferraConfig: FerraConfig;

  constructor(params: {
    suiClient: SuiClient;
    ferraPackageId: string;
    ferraConfigId: string;
  }) {

    this.ferraConfig = {
      packageId: params.ferraPackageId,
      configId: params.ferraConfigId,
    };

    Config.setSuiClient(params.suiClient);
  }

  /**
   * Build swap transaction with Ferra wrapper
   *
   * Flow:
   * 1. ferra::bluefin::start_swap → (SwapRequest, coinForSwap)
   * 2. buildTxWithoutSettle (SDK) → execute routing
   * 3. ferra::bluefin::confirm_swap → settle and deduct fee
   */
  async buildSwapWithRoute(params: {
    tx: Transaction;
    sender: string;
    fromType: string;
    targetType: string;
    coinIn: TransactionObjectArgument;
    routeData: QuoteResponse;
    slippageBps: number;
  }): Promise<Transaction> {
    const {
      tx,
      sender,
      fromType,
      targetType,
      coinIn,
      routeData,
      slippageBps,
    } = params;

    // Calculate min amount out
    const amountOut = routeData.returnAmountWithDecimal;
    const minAmountOut = this.calculateMinAmountOut(amountOut, slippageBps);

    // Step 1: Ferra start_swap
    const [swapRequest, coinForSwap] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::bluefin::start_swap`,
      typeArguments: [fromType, targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        coinIn,
        tx.pure.u64(minAmountOut),
      ],
    });

    // Step 2: Execute routing using Bluefin7k SDK (without settle)
    const { coinOut: swappedCoinOut } = await buildTxWithoutSettle({
      quoteResponse: routeData,
      accountAddress: sender,
      commission: {
        commissionBps: 0,
        partner: sender,
      },
      slippage: slippageBps / 10000,
      extendTx: {
        tx,
        coinIn: coinForSwap,
      },
    });

    if (!swappedCoinOut) {
      throw new Error("Bluefin7k swap failed: no coin output");
    }

    // Step 3: Ferra confirm_swap
    const [coinOut] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::bluefin::confirm_swap`,
      typeArguments: [fromType, targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        swapRequest,
        tx.object(_7K_CONFIG),
        tx.object(_7K_VAULT),
        swappedCoinOut,
      ],
    });

    // Step 4: Transfer output to sender
    tx.transferObjects([coinOut], sender);

    return tx;
  }

  async buildSwapWithCoinOut(params: {
    tx: Transaction;
    sender: string;
    fromType: string;
    targetType: string;
    coinIn: TransactionObjectArgument;
    routeData: QuoteResponse;
    slippageBps: number;
  }): Promise<SwapCustomizableOutput> {
    const {
      tx,
      sender,
      fromType,
      targetType,
      coinIn,
      routeData,
      slippageBps,
    } = params;

    // Calculate min amount out
    const amountOut = routeData.returnAmountWithDecimal;
    const minAmountOut = this.calculateMinAmountOut(amountOut, slippageBps);

    // Step 1: Ferra start_swap
    const [swapRequest, coinForSwap] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::bluefin::start_swap`,
      typeArguments: [fromType, targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        coinIn,
        tx.pure.u64(minAmountOut),
      ],
    });

    // Step 2: Execute routing using Bluefin7k SDK (without settle)
    const { coinOut: swappedCoinOut } = await buildTxWithoutSettle({
      quoteResponse: routeData,
      accountAddress: sender,
      commission: {
        commissionBps: 0,
        partner: sender,
      },
      slippage: slippageBps / 10000,
      extendTx: {
        tx,
        coinIn: coinForSwap,
      },
    });

    if (!swappedCoinOut) {
      throw new Error("Bluefin7k swap failed: no coin output");
    }

    // Step 3: Ferra confirm_swap
    const [_coinOut] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::bluefin::confirm_swap`,
      typeArguments: [fromType, targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        swapRequest,
        tx.object(_7K_CONFIG),
        tx.object(_7K_VAULT),
        swappedCoinOut,
      ],
    });

    return {tx, coinOut: _coinOut};
  }

  private calculateMinAmountOut(amountOut: string, slippageBps: number): string {
    const amount = BigInt(amountOut);
    const slippage = (amount * BigInt(slippageBps)) / BigInt(10000);
    return (amount - slippage).toString();
  }
}