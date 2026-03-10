import { IModule } from "../interfaces/IModule.js"
import { FerraDlmmSDK } from "../sdk.js"
import { CachedContent } from "../utils/cached-content.js"

export class QuoterModule implements IModule {
    protected _sdk: FerraDlmmSDK

    private readonly _cache: Record<string, CachedContent> = {}

    constructor(sdk: FerraDlmmSDK) {
        this._sdk = sdk
    }

    get sdk() {
        return this._sdk
    }

}