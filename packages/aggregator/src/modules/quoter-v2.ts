import { IModuleV2 } from "../interfaces/IModuleV2"
import { FerraAggregatorV2SDK } from "../sdk"
import { CachedContent } from "../utils/cached-content"
import { MetaAg, MetaQuote, MetaQuoteOptions, MetaSimulationOptions } from "@7kprotocol/sdk-ts";

export class QuoterV2Module implements IModuleV2 {
  protected _sdk: FerraAggregatorV2SDK

  /**
   * Initialize the pair module with SDK instance
   * @param sdk - FerraAggregatorSDK instance
   */
  constructor(sdk: FerraAggregatorV2SDK) {
    this._sdk = sdk
    this.getBestQuotes = this.getBestQuotes.bind(this)
  }

  /**
   * Get the SDK instance
   * @returns FerraAggregatorSDK instance
   */
  get sdk() {
    return this._sdk
  }

  /**
   * QuoterV2Module - Module for fetching swap quotes from a pre-configured DEX aggregator
   *
   * This module uses 7K Protocol's MetaAg as a wrapper to query a single,
   * pre-configured aggregator provider (e.g., Cetus, FlowX, Bluefin).
   *
   * Note: Unlike typical meta-aggregators that compare multiple providers,
   * this implementation queries only ONE provider per request based on
   * SDK configuration. This is intentional for Ferra's routing strategy.
   *
   * @param options - Quote request parameters
   * @param options.coinTypeIn - Input coin type (e.g., "0x2::sui::SUI")
   * @param options.coinTypeOut - Output coin type
   * @param options.amountIn - Amount of input coin (in smallest unit)
   * @param simulation - Simulation options for accurate quote
   * @param simulation.sender - Sender address for simulation context
   * @returns Best quote from available providers, or undefined if no routes found
   *
   */
  async getBestQuotes(
    options: MetaQuoteOptions,
    simulation?: MetaSimulationOptions
  ): Promise<MetaQuote | null> {

    const _7kMeta: MetaAg = this._sdk.sdk
    const quotes = await _7kMeta.quote(options, simulation)

    // Validate quotes exist
    if (!quotes || quotes.length === 0) {
      return null
    }

    const bestQuote = quotes.sort(
      (a, b) =>
        Number(b.simulatedAmountOut || b.amountOut) -
        Number(a.simulatedAmountOut || a.amountOut),
    )[0];

    return bestQuote
  }

}
