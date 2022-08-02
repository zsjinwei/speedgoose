import Keyv from "keyv";
import {Container} from 'typedi'
import KeyvRedis from "@keyv/redis"
import {Mongoose, Document} from "mongoose"
import {CacheClients, CachedResult, CacheNamespaces, SpeedGooseCacheLayerConfig} from "./types/types"
import listenForChanges from "./plugin/SpeedGooseCacheAutoCleaner";
import {addCachingToQuery} from "./extendQuery";
import {addCachingToAggregate} from "./extendAggregate";
import {objectDeserializer, objectSerializer} from "./utils";
import {SPEEDGOOSE_CACHE_LAYER_GLOBAL_ACCESS} from "./constants";

const registerGlobalCacheAccess = (cacheClients: CacheClients): void => {
    Container.set<CacheClients>(SPEEDGOOSE_CACHE_LAYER_GLOBAL_ACCESS, cacheClients)
}

const clearCacheOnClients = (cacheClients: CacheClients): Promise<void[]> =>
    Promise.all(Object.values(cacheClients).map(client => client.clear()))

const prepareCacheClients = async (config: SpeedGooseCacheLayerConfig): Promise<CacheClients> => {
    const keyvRedis = new KeyvRedis(config.redisUri);

    const clients: CacheClients = {
        resultsCache: new Keyv<CachedResult, any>({namespace: CacheNamespaces.RESULTS_NAMESPACE, store: keyvRedis}),
        recordsKeyCache: new Keyv<string[], any>({namespace: CacheNamespaces.KEY_RELATIONS_NAMESPACE, store: keyvRedis}),
        modelsKeyCache: new Keyv<string[], any>({namespace: CacheNamespaces.MODELS_KEY_NAMESPACE, store: keyvRedis}),
        singleRecordsCache: new Keyv<Document, any>({namespace: CacheNamespaces.SINGLE_RECORDS_NAMESPACE, serialize: objectSerializer, deserialize: objectDeserializer}),
        singleRecordsKeyCache: new Keyv<string[], any>({namespace: CacheNamespaces.SINGLE_RECORDS_KEY_NAMESPACE})
    }

    await clearCacheOnClients(clients)

    return clients
}

export const applySpeedGooseCacheLayer = async (mongose: Mongoose, config: SpeedGooseCacheLayerConfig): Promise<void> => {
    const cacheClients = await prepareCacheClients(config)
    registerGlobalCacheAccess(cacheClients)
    listenForChanges(mongose, cacheClients)
    addCachingToQuery(mongose, cacheClients)
    addCachingToAggregate(mongose, cacheClients)
}