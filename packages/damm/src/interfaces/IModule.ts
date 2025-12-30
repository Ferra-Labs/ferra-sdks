import { FerraDammSDK } from '../sdk'

export interface IModule {
  readonly sdk: FerraDammSDK
}

export type Paginate<T> = {
  data: T[],
  pageToken: Uint8Array | undefined
}