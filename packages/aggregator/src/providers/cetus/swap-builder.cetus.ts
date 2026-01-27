import {
  AggregatorClient,
  RouterDataV3,
  FlattenedPath,
  processFlattenRoutes,
} from "@cetusprotocol/aggregator-sdk";
import { Transaction, TransactionObjectArgument } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { SwapCustomizableOutput } from "../../interfaces/IAggSwapV2";

/**
 * Ferra protocol configuration
 */
interface FerraConfig {
  packageId: string;
  configId: string;
}

/**
 * CetusSwapBuilder - Build swap transactions using Cetus aggregator routes
 * wrapped with Ferra protocol for fee collection
 *
 * Flow:
 * 1. Process RouterDataV3 to get FlattenedPath[] (required by Cetus SDK)
 * 2. Extract Pyth price IDs from paths' extendedDetails
 * 3. Update Pyth price feeds (required for some DEXes)
 * 4. Ferra start_swap() - Initialize swap context, lock input coin
 * 5. Cetus dexRouter.swap() - Execute actual swaps through DEX pools
 * 6. Ferra confirm_swap() - Validate output, deduct fee, return coin
 */
export class CetusSwapBuilder {
  private cetusClient: AggregatorClient;
  private ferraConfig: FerraConfig;

  /**
   * Initialize CetusSwapBuilder
   * @param params.suiClient - Sui RPC client
   * @param params.signer - Wallet address for signing
   * @param params.ferraPackageId - Ferra protocol package ID
   * @param params.ferraConfigId - Ferra protocol config object ID
   * @param params.apiKey - Optional Cetus API key
   */
  constructor(params: {
    suiClient: SuiClient;
    signer: string;
    ferraPackageId: string;
    ferraConfigId: string;
    apiKey?: string;
  }) {
    this.cetusClient = new AggregatorClient({
      client: params.suiClient as any,
      signer: params.signer,
      env: 0, // 0 = mainnet
    });

    this.ferraConfig = {
      packageId: params.ferraPackageId,
      configId: params.ferraConfigId,
    };
  }

  /**
   * Build swap transaction with pre-fetched route data
   * @param params.tx - Transaction to append swap calls
   * @param params.sender - Recipient address for output coin
   * @param params.fromType - Input coin type (e.g., "0x2::sui::SUI")
   * @param params.targetType - Output coin type
   * @param params.coinIn - Input coin object argument
   * @param params.routerData - Route data from Cetus findRouters()
   * @param params.slippageBps - Slippage tolerance in basis points (100 = 1%)
   * @returns Transaction with swap calls appended
   */
  async buildSwapWithRoute(params: {
    tx: Transaction;
    sender: string;
    fromType: string;
    targetType: string;
    coinIn: TransactionObjectArgument;
    routerData: RouterDataV3;
    slippageBps: number;
  }): Promise<Transaction> {
    const { tx, sender, fromType, targetType, coinIn, routerData, slippageBps } = params;

    // Calculate minimum acceptable output with slippage protection
    const amountOut = routerData.amountOut.toString();
    const minAmountOut = this.calculateMinAmountOut(amountOut, slippageBps);

    // Step 1: Process routes to get FlattenedPath[]
    // This is required by Cetus SDK's dexRouter.swap()
    const processedData = processFlattenRoutes(routerData);

    if (!processedData.flattenedPaths || processedData.flattenedPaths.length === 0) {
      throw new Error("No swap paths found after processing routerData");
    }

    // Step 2: Extract Pyth price IDs from paths and update on-chain
    const pythPriceIDs = await this.getPythPriceIDs(tx, processedData.flattenedPaths);

    // Step 3: Initialize Ferra swap context
    // Returns swapRequest (for tracking) and swapCtx (passed to DEX routers)
    const [swapRequest, swapCtx] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::cetus::start_swap`,
      typeArguments: [fromType, targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        tx.pure.string(processedData.quoteID || ""),
        tx.pure.u64(minAmountOut),
        tx.pure.u64(amountOut),
        coinIn,
      ],
    });

    // Step 4: Execute swaps through Cetus DEX routers
    this.buildDexRouterSwaps(tx, swapCtx, processedData.flattenedPaths, pythPriceIDs);

    // Step 5: Finalize swap, validate output, collect fee
    const [coinOut] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::cetus::confirm_swap`,
      typeArguments: [targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        swapRequest,
        swapCtx,
      ],
    });

    // Step 6: Transfer output coin to sender
    tx.transferObjects([coinOut], sender);

    return tx;
  }

  async buildSwapWithCoinOut(params: {
    tx: Transaction;
    sender: string;
    fromType: string;
    targetType: string;
    coinIn: TransactionObjectArgument;
    routerData: RouterDataV3;
    slippageBps: number;
  }): Promise<SwapCustomizableOutput> {
    const { tx, sender, fromType, targetType, coinIn, routerData, slippageBps } = params;

    // Calculate minimum acceptable output with slippage protection
    const amountOut = routerData.amountOut.toString();
    const minAmountOut = this.calculateMinAmountOut(amountOut, slippageBps);

    // Step 1: Process routes to get FlattenedPath[]
    // This is required by Cetus SDK's dexRouter.swap()
    const processedData = processFlattenRoutes(routerData);

    if (!processedData.flattenedPaths || processedData.flattenedPaths.length === 0) {
      throw new Error("No swap paths found after processing routerData");
    }

    // Step 2: Extract Pyth price IDs from paths and update on-chain
    const pythPriceIDs = await this.getPythPriceIDs(tx, processedData.flattenedPaths);

    // Step 3: Initialize Ferra swap context
    // Returns swapRequest (for tracking) and swapCtx (passed to DEX routers)
    const [swapRequest, swapCtx] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::cetus::start_swap`,
      typeArguments: [fromType, targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        tx.pure.string(processedData.quoteID || ""),
        tx.pure.u64(minAmountOut),
        tx.pure.u64(amountOut),
        coinIn,
      ],
    });

    // Step 4: Execute swaps through Cetus DEX routers
    this.buildDexRouterSwaps(tx, swapCtx, processedData.flattenedPaths, pythPriceIDs);

    // Step 5: Finalize swap, validate output, collect fee
    const [_coinOut] = tx.moveCall({
      target: `${this.ferraConfig.packageId}::cetus::confirm_swap`,
      typeArguments: [targetType],
      arguments: [
        tx.object(this.ferraConfig.configId),
        swapRequest,
        swapCtx,
      ],
    });

    return { tx, coinOut: _coinOut };
  }

  /**
   * Extract Pyth price IDs from FlattenedPaths and update on-chain
   * Required for DEXes that use Pyth oracle (Cetus CLMM, Turbos, Haedal, etc.)
   * @param tx - Transaction to append Pyth update calls
   * @param flattenedPaths - Processed paths containing extendedDetails
   * @returns Map of coin type to Pyth price object ID
   */
  private async getPythPriceIDs(
    tx: Transaction,
    flattenedPaths: FlattenedPath[]
  ): Promise<Map<string, string>> {
    // Collect all unique price seed IDs from extendedDetails
    const priceSeeds = new Set<string>();

    for (const flattenedPath of flattenedPaths) {
      const details = flattenedPath.path.extendedDetails;
      if (!details) continue;

      // Extract all pyth price seed fields from various DEX providers
      const seedFields = [
        // Haedal PMM
        details.haedal_pmm_base_price_seed,
        details.haedal_pmm_quote_price_seed,
        // Haedal HMM V2
        details.haedalhmmv2_base_price_seed,
        // Steamm
        details.steamm_oracle_pyth_price_seed_a,
        details.steamm_oracle_pyth_price_seed_b,
        // Metastable
        details.metastable_price_seed,
        details.metastable_eth_price_seed,
        // Obric
        details.obric_coin_a_price_seed,
        details.obric_coin_b_price_seed,
        // 7K
        details.sevenk_coin_a_price_seed,
        details.sevenk_coin_b_price_seed,
      ];

      for (const seed of seedFields) {
        if (seed) {
          priceSeeds.add(seed);
        }
      }
    }

    // If no Pyth prices needed, return empty map
    if (priceSeeds.size === 0) {
      return new Map<string, string>();
    }

    // Update Pyth price feeds on-chain and get object IDs
    const priceIDs = Array.from(priceSeeds);
    const pythPriceIDs = await this.cetusClient.updatePythPriceIDs(priceIDs, tx as any);

    return pythPriceIDs;
  }

  /**
   * Build DEX router swap calls for each FlattenedPath
   * Uses Cetus SDK's dexRouter to generate correct move calls per DEX
   * @param tx - Transaction to append swap calls
   * @param swapCtx - Swap context from Ferra start_swap
   * @param flattenedPaths - Processed paths from processFlattenRoutes()
   * @param pythPriceIDs - Pyth price object IDs for oracle-dependent DEXes
   */
  private buildDexRouterSwaps(
    tx: Transaction,
    swapCtx: TransactionObjectArgument,
    flattenedPaths: FlattenedPath[],
    pythPriceIDs: Map<string, string>
  ): void {
    // Cache dexRouters by provider to reuse across paths
    const dexRouters = new Map<string, any>();

    // Iterate through each flattened swap path
    for (const flattenedPath of flattenedPaths) {
      const provider = flattenedPath.path.provider;

      // Get or create dexRouter for this provider (Cetus, DeepBook, Turbos, etc.)
      if (!dexRouters.has(provider)) {
        const dexRouter = this.cetusClient.newDexRouterV3(provider, pythPriceIDs);
        dexRouters.set(provider, dexRouter);
      }

      const dexRouter = dexRouters.get(provider);

      // Execute swap call for this path
      // Note: Pass FlattenedPath, not Path - this is required by Cetus SDK
      dexRouter.swap(tx, flattenedPath, swapCtx, { pythPriceIDs });
    }
  }

  /**
   * Calculate minimum output amount with slippage tolerance
   * @param amountOut - Expected output amount
   * @param slippageBps - Slippage in basis points (100 = 1%)
   * @returns Minimum acceptable output amount
   */
  private calculateMinAmountOut(amountOut: string, slippageBps: number): string {
    const amount = BigInt(amountOut);
    const slippage = (amount * BigInt(slippageBps)) / BigInt(10000);
    return (amount - slippage).toString();
  }
}
