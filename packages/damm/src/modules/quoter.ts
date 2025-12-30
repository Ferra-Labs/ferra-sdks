import { IModule } from "../interfaces/IModule"
import { FerraDammSDK } from "../sdk"
import { CachedContent } from "../utils/cached-content"

export class QuoterModule implements IModule {
    protected _sdk: FerraDammSDK

    private readonly _cache: Record<string, CachedContent> = {}

    constructor(sdk: FerraDammSDK) {
        this._sdk = sdk
    }

    get sdk() {
        return this._sdk
    }

}