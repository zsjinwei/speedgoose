import Keyv from "keyv";
import Container from "typedi";
import {staticImplements} from "../types/decorators";
import {CachedResult, CacheNamespaces, GlobalDiContainerRegistryNames} from "../types/types";
import {addValueToInternalCachedSet, createInMemoryCacheClientWithNamespace} from "../utils/cacheClientUtils";
import {CommonCacheStrategyAbstract, CommonCacheStrategyStaticMethods} from "./commonCacheStrategyAbstract";

@staticImplements<CommonCacheStrategyStaticMethods>()
export class InMemoryStrategy extends CommonCacheStrategyAbstract {
    private resultsCacheClient: Keyv<CachedResult>
    private recordResultsSetsClient: Keyv<Set<string>>

    public static async register(): Promise<void> {
        const strategy = new InMemoryStrategy()
        await strategy.init()

        Container.set<InMemoryStrategy>(GlobalDiContainerRegistryNames.CACHE_CLIENT_GLOBAL_ACCESS, strategy)
    }

    public async getValueFromCache(namespace: string, key: string): Promise<CachedResult> {
        const keyWithNamespace = `${namespace}:${key}`

        const result = await this.resultsCacheClient.get(keyWithNamespace) as CachedResult

        return result
    }

    public async addValueToCache<T extends CachedResult>(namespace: string, key: string, value: T, ttl?: number): Promise<void> {
        const keyWithNamespace = `${namespace}:${key}`

        await this.resultsCacheClient.set(keyWithNamespace, value, ttl)
    }

    public async addValueToCacheSet<T extends string | number>(namespace: string, value: T): Promise<void> {
        await addValueToInternalCachedSet(this.recordResultsSetsClient, namespace, value)
    }

    public async addValueToManyCachedSets<T extends string | number>(namespaces: string[], value: T): Promise<void> {
        await Promise.all(
            namespaces.map(namespace => addValueToInternalCachedSet(this.recordResultsSetsClient, namespace, value))
        )
    }

    public async removeKeyForCache(namespace: string, key: string): Promise<void> {
        await this.resultsCacheClient.delete(`${namespace}:${key}`)
    }

    public async clearResultsCacheWithSet<T>(namespace: string): Promise<void> {
        const keys = await this.getValuesFromCachedSet(namespace)
        if (keys?.length > 0) {
            await this.resultsCacheClient.delete(keys.map(key => `${CacheNamespaces.RESULTS_NAMESPACE}:${key}`))
            await this.clearCachedSet(namespace)
        }
    }

    private async clearCachedSet(namespace: string): Promise<void> {
        await this.recordResultsSetsClient.delete(namespace)
    }

    private async getValuesFromCachedSet(namespace: string): Promise<string[] | number[]> {
        const setMembers = await this.recordResultsSetsClient.get(namespace)

        return setMembers ? Array.from(setMembers) : []
    }

    private setClients(): void {
        this.resultsCacheClient = createInMemoryCacheClientWithNamespace(CacheNamespaces.RESULTS_NAMESPACE)
        this.recordResultsSetsClient = createInMemoryCacheClientWithNamespace(CacheNamespaces.RECORD_RESULTS_SETS)
    }

    private async init(): Promise<void> {
        this.setClients()
    }
}
