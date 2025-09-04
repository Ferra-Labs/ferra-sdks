import { IModule } from "../interfaces/IModule"
import { FerraDlmmSDK } from "../sdk"
import { CachedContent } from "../utils/cached-content"

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