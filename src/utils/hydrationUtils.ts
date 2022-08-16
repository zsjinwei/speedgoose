import {Query} from "mongoose"
import {Document, Model, SchemaType} from "mongoose"
import {CacheClients, CachedDocument, CachedResult, SpeedGooseCacheOperationParams} from "../types/types"
import {setKeyInHydrationCaches} from "./cacheClientUtils"
import {generateCacheKeyForSingleDocument} from "./cacheKeyUtils"
import {getValueFromDocument, isResultWithIds, getMongooseModelForName, setValueOnDocument} from "./mongooseUtils"
 
type FieldWithRefferenceModel = {
    path: string,
    referenceModelName: string
}

const getReferenceModelNameFromSchema = (schema: SchemaType): string => {
        if (schema.options.ref) {
            return schema.options.ref as string 
        }
        if (Array.isArray(schema?.options?.type)) {
            return schema?.options?.type[0].ref
        }
    }

const getFieldsToHydrate = <T>(model: Model<T>): FieldWithRefferenceModel[] =>
    Object.entries<SchemaType>({
        ...model?.schema?.paths ?? {},
        //@ts-expect-error singleNestedPaths might be not avaliable in some of mongoose versions
        ...model?.schema?.singleNestedPaths ?? {}
    }).map(([path, schemaFieldType]) => ({path, referenceModelName: getReferenceModelNameFromSchema(schemaFieldType)}))
        .filter(schemaPaths => schemaPaths.referenceModelName)

const getHydratedDocuments = <T>(query: Query<T, T>, params: SpeedGooseCacheOperationParams, results: Document<T>[], cacheClients: CacheClients): Promise<Document<T>[]> =>
    Promise.all(results.map(record => getHydratedDocument(query, params, record, cacheClients)))

const getHydratedDocument = async <T>(query: Query<T, T>, params: SpeedGooseCacheOperationParams, result: Document, cacheClients: CacheClients): Promise<Document<T>> => {
    const cacheKey = generateCacheKeyForSingleDocument(query, result)
    const cachedValue = await cacheClients.singleRecordsCache.get(cacheKey)

    if (cachedValue) return cachedValue

    const hydratedDocument = hydrateDocument(query, result)
    await setKeyInHydrationCaches(cacheKey, hydratedDocument, params, cacheClients)

    return hydratedDocument
}

const hydrateDocument = <T>(query: Query<T, T>, record: Document<T>): Document<T> => deepHydrate(query.model, record)       

const deepHydrate = <T>(
    model: Model<T>, record: Document<T>
): Document<T> => {
    const hydratedRootDocument = model.hydrate(record) as Document<T>;

    for (const field of getFieldsToHydrate(model)) {

        if (field.referenceModelName) {
            const value = getValueFromDocument(field.path, record);

            if (!isResultWithIds(value)) continue;

            if (!Array.isArray(value)) {
                const hydratedValue = deepHydrate(getMongooseModelForName(field.referenceModelName), value as Document);
                setValueOnDocument(field.path, hydratedValue, hydratedRootDocument);
            } else {
                const hydratedValue = value.map(valueToHydrate => deepHydrate(getMongooseModelForName(field.referenceModelName), valueToHydrate), hydratedRootDocument);
                setValueOnDocument(field.path, hydratedValue, hydratedRootDocument);
            }
        }
    }

    return hydratedRootDocument;
}

export const hydrateResults = <T extends CachedResult>(
    query: Query<T, T>,
    params: SpeedGooseCacheOperationParams,
    result: CachedDocument,
    cacheClients: CacheClients
): Promise<CachedDocument | CachedDocument[]> =>
    Array.isArray(result) ? getHydratedDocuments(query, params, result, cacheClients) : getHydratedDocument(query, params, result, cacheClients);