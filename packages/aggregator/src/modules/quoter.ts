import { AggPairsError, RouterErrorCode } from "../errors/errors"
import { InputFindBestQuotesParams, TradingRoute } from "../interfaces"
import { IModule } from "../interfaces/IModule"
import { FerraAggregatorSDK } from "../sdk"
import { CachedContent } from "../utils/cached-content"

export class QuoterModule implements IModule {
  protected _sdk: FerraAggregatorSDK

  /**
   * Cache storage for pair data
   */
  private readonly _cache: Record<string, CachedContent> = {}

  /**
   * Initialize the pair module with SDK instance
   * @param sdk - FerraAggregatorSDK instance
   */
  constructor(sdk: FerraAggregatorSDK) {
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


  async getBestQuotes(params: InputFindBestQuotesParams): Promise<TradingRoute[]> {
    const { quoterUrl } = this._sdk.sdkOptions
    if (!quoterUrl) {
      return []
    }

    let apiResponse

    const slippageTolerance = (params.slippageTolerance === null || params.slippageTolerance === undefined)? "": `&slippageTolerance=${params.slippageTolerance}`
    const quoteUrlApi = `${quoterUrl}?from=${params.from}&to=${params.to}&amount=${params.amount}` +  slippageTolerance
    try {
      apiResponse = await fetch(quoteUrlApi)
    } catch (fetchError) {
      throw new AggPairsError(`Failed to get pool list with liquidity from ${quoteUrlApi}.`, RouterErrorCode.InvalidQuoteUrl)
    }

    let responseData
    try {
      responseData = await apiResponse.json()
    } catch (parseError) {
      throw new AggPairsError(`Failed to parse response from ${quoteUrlApi}.`, RouterErrorCode.InvalidQuoteUrl)
    }

    if (responseData.code !== 200) {
      throw new AggPairsError(
        `Failed to get pool list from ${quoteUrlApi}. Status code is ${responseData.code}.`,
        RouterErrorCode.InvalidQuoteUrl
      )
    }

    return responseData?.data as TradingRoute[]
  }

}
