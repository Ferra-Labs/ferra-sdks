import { Transaction, TransactionObjectArgument, TransactionResult } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";
import { FlowxQuoteResponse } from "@7kprotocol/sdk-ts";
import { TradeBuilder } from "./flowx-sdk/src";

/**
 * Ferra protocol configuration
 */
interface FerraConfig {
    packageId: string;
    configId: string;
}

/**
 * FlowX protocol shared objects (Mainnet)
 */
export interface FlowXSharedObjects {
    treasury: string;
    tradeIdTracker: string;
    partnerRegistry: string;
    versioned: string;
}

/**
 * Default FlowX shared objects for Mainnet
 */
const FLOWX_MAINNET_OBJECTS: FlowXSharedObjects = {
    treasury: "0x25db8128dc9ccbe5fcd15e5700fea555c6b111a8c8a1f20c426b696caac2bea4",
    tradeIdTracker: "0x9ab469842f85fd2a1bac9ba695d867adb1caa7d5705809737922b5cee552eb6f",
    partnerRegistry: "0x29e6c1c2176485dc045a2e39eb8844b4ca1cf8452d964447c11202f84a76cb1a",
    versioned: "0xada98dd9e028db64e206dd81fdecb3dbc8b4c16be08d9f175550032bfdcf56f3",
};

/**
 * FlowXSwapBuilder - Build swap transactions using FlowX aggregator routes
 * wrapped with Ferra protocol for fee collection
 *
 * Transaction Flow:
 * 1. ferra::start_swap     → Creates (SwapRequest, Trade) via universal_router::build
 * 2. swapRoutes            → Execute routing (start_routing, swaps, finish_routing)
 * 3. ferra::confirm_swap   → Settle trade, validate slippage, deduct fee
 */
export class FlowXSwapBuilder {
    private suiClient: SuiClient;
    private signer: string;
    private ferraConfig: FerraConfig;
    private network: "mainnet" | "testnet";

    // FlowX shared objects - set these via setSharedObjects()
    private static sharedObjects: FlowXSharedObjects | null = null;

    constructor(params: {
        suiClient: SuiClient;
        signer: string;
        ferraPackageId: string;
        ferraConfigId: string;
        network?: "mainnet" | "testnet";
    }) {
        this.suiClient = params.suiClient;
        this.signer = params.signer;
        this.ferraConfig = {
            packageId: params.ferraPackageId,
            configId: params.ferraConfigId,
        };
        this.network = params.network ?? "mainnet";

        // Auto-set mainnet objects if network is mainnet and not already set
        if (this.network === "mainnet" && !FlowXSwapBuilder.sharedObjects) {
            FlowXSwapBuilder.sharedObjects = FLOWX_MAINNET_OBJECTS;
        }
    }

    /**
     * Set FlowX shared objects (must be called before building swaps)
     */
    static setSharedObjects(objects: FlowXSharedObjects): void {
        FlowXSwapBuilder.sharedObjects = objects;
    }

    /**
     * Get cached shared objects
     */
    static getSharedObjects(): FlowXSharedObjects | null {
        return FlowXSwapBuilder.sharedObjects
            ? { ...FlowXSwapBuilder.sharedObjects }
            : null;
    }

    /**
     * Clear cached objects
     */
    static clearCache(): void {
        FlowXSwapBuilder.sharedObjects = null;
    }

    /**
     * Build swap transaction with Ferra wrapper
     *
     * Flow:
     * 1. ferra::start_swap → (SwapRequest, Trade)
     * 2. tradeObj.swapRoutes() → routing commands (start_routing, swaps, finish_routing)
     * 3. ferra::confirm_swap → settle and deduct fee
     */
    async buildSwapWithRoute(params: {
        tx: Transaction;
        sender: string;
        fromType: string;
        targetType: string;
        coinIn: TransactionObjectArgument;
        routeData: FlowxQuoteResponse;
        slippageBps: number;
        deadlineMs?: number;
    }): Promise<Transaction> {
        const {
            tx,
            sender,
            fromType,
            targetType,
            coinIn,
            routeData,
            slippageBps,
            deadlineMs,
        } = params;

        // Validate shared objects are set
        if (!FlowXSwapBuilder.sharedObjects) {
            throw new Error(
                "FlowX shared objects not set. Call FlowXSwapBuilder.setSharedObjects() first."
            );
        }

        const flowxObjects = FlowXSwapBuilder.sharedObjects;

        // Calculate amounts
        const amountOut = routeData.amountOut.toString();
        const minAmountOut = this.calculateMinAmountOut(amountOut, slippageBps);
        const deadline = deadlineMs ?? Date.now() + 30 * 60 * 1000; // +30 minutes
        const routeAmounts = routeData.routes.map((r) => r.amountIn.toString());

        // Step 1: Ferra start_swap
        // Returns (SwapRequest, Trade<CoinIn, CoinOut>)
        const [swapRequest, trade] = tx.moveCall({
            target: `${this.ferraConfig.packageId}::flowx::start_swap`,
            typeArguments: [fromType, targetType],
            arguments: [
                tx.object(this.ferraConfig.configId),
                tx.object(flowxObjects.treasury),
                tx.object(flowxObjects.tradeIdTracker),
                tx.object(flowxObjects.partnerRegistry),
                coinIn,
                tx.pure.u64(minAmountOut),      // amount_out_limit - min after Ferra fee
                tx.pure.u64(amountOut),         // amount_out_expected - for FlowX
                tx.pure.u64(slippageBps),       // slippage in basis points
                tx.pure.u64(deadline),          // deadline in milliseconds
                tx.pure.vector("u64", routeAmounts),
                tx.object(flowxObjects.versioned),
            ],
        });

        // Step 2: Execute all routes using SDK's swapRoutes
        // This handles start_routing, individual swaps, and finish_routing
        const tradeObj = TradeBuilder.fromRoutes(routeData.routes as any)
            .slippage(slippageBps)
            .build();

        await tradeObj.swapRoutes({
            tx,
            tradeObject: trade as any,
            client: this.suiClient,
        });

        // Step 3: Ferra confirm_swap
        // Calls settle(), validates slippage, deducts fee
        const [coinOut] = tx.moveCall({
            target: `${this.ferraConfig.packageId}::flowx::confirm_swap`,
            typeArguments: [fromType, targetType],
            arguments: [
                tx.object(this.ferraConfig.configId),
                swapRequest,
                trade,
                tx.object(flowxObjects.treasury),
                tx.object(flowxObjects.partnerRegistry),
                tx.object(flowxObjects.versioned),
                tx.object("0x6"), // Clock
            ],
        });

        // Step 4: Transfer output to sender
        tx.transferObjects([coinOut], sender);

        return tx;
    }

    /**
     * Calculate minimum amount out based on slippage
     */
    private calculateMinAmountOut(amountOut: string, slippageBps: number): string {
        const amount = BigInt(amountOut);
        const slippage = (amount * BigInt(slippageBps)) / BigInt(10000);
        return (amount - slippage).toString();
    }
}