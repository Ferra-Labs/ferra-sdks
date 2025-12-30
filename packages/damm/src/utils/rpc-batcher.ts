export type QueryResult<T> = {
  data: T[]
  nextCursor: string | null
  hasNextPage: boolean
}

export type RpcBatcherKey = string | string[]

export type RpcBatcherArgs<T> = {
  key: RpcBatcherKey
  callback: (cursor: any, limit: number) => Promise<QueryResult<T>>
  version: string
  updater?: (value: any) => any
}

export type RpcBatcherCache = {
  data: any
  version: string
  updater?: (value: any) => any
}

export type RpcBatcherCallback<T> = (cursor: any, limit: number) => Promise<QueryResult<T>>

export class RpcBatcher<T> {
  #cursor: string | null = null
  #limit = 50
  #key: string | null
  #version: string
  #callback: (cursor: any, limit: number) => Promise<QueryResult<T>>
  #updater?: (value: any) => [any, version: string]

  static #cache: Record<string, RpcBatcherCache | undefined> = {}

  constructor(callback: RpcBatcherCallback<T>)
  constructor(config: RpcBatcherArgs<T>)
  constructor(config: RpcBatcherArgs<T> | RpcBatcherCallback<T>) {
    if (typeof config === 'function') {
      this.#callback = config
      this.#key = null
      this.#version = ''
    } else {
      this.#callback = config.callback
      this.#key = Array.isArray(config.key) ? config.key.join('_') : config.key
      this.#version = config.version
      this.#updater = config.updater
    }
  }

  private async cache(cursor: string | null, limit: number) {
    const key = this.#key ? `${this.#key}_${cursor}_${limit}` : null
    const dataCached = key !== null ? RpcBatcher.#cache[key] : null
    if (dataCached && key !== null) {
      if (dataCached.version == this.#version) {
        return dataCached.data
      } else if (dataCached.updater) {
        try {
          const [res, version] = await dataCached.updater(dataCached)
          RpcBatcher.#cache[key] = {
            data: res,
            version,
            updater: dataCached.updater,
          }

          return res
        } catch (error) {}
      }
      delete RpcBatcher.#cache[key] //remove old key if not has updater
    }

    const data = await this.#callback(this.#cursor, this.#limit)
    
    if (data && key) {
      RpcBatcher.#cache[key] = {
        data,
        version: this.#version,
        updater: this.#updater,
      }
    }

    return data
  }

  async fetchOne(condition: (value: T) => boolean): Promise<T | null> {
    try {
      while (true) {
        const res = await this.cache(this.#cursor, this.#limit)

        if (res.data.length) {
          const data = res.data.find(condition)

          if (data) {
            return data
          }
        } else {
          break
        }

        if (!res.nextCursor || !res.hasNextPage) {
          break
        } else {
          this.#cursor = res.nextCursor
        }
      }

      return null
    } finally {
      this.#cursor = null
    }
  }

  async fetchAll(): Promise<T[]> {
    try {
      let data: T[] = []
      while (true) {
        const res = await this.cache(this.#cursor, this.#limit)

        if (res.data.length) {
          data.push(...res.data)
        } else {
          break
        }

        if (!res.nextCursor || !res.hasNextPage) {
          break
        } else {
          this.#cursor = res.nextCursor
        }
      }

      return data
    } finally {
      this.#cursor = null
    }
  }
}
