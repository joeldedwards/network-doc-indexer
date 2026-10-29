import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { DirectoryTestInput, DirectoryTestResult, Document, DocumentPreview, DocumentSearchResponse, DocumentStats, EmailDispatchResult, EmailDocumentInput, HealthStatus, IndexStartResult, IndexStatus, IndexerConfig, IndexerConfigInput, IndexerConfigResponse, SearchDocumentsParams } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * Returns server health status
 * @summary Health check
 */
export declare const healthCheck: (options?: Parameters<typeof customFetch>[1]) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetIndexerConfigUrl: () => string;
/**
 * @summary Get the configured document directory and indexing rules
 */
export declare const getIndexerConfig: (options?: Parameters<typeof customFetch>[1]) => Promise<IndexerConfigResponse>;
export declare const getGetIndexerConfigQueryKey: () => readonly ["/api/documents/config"];
export declare const getGetIndexerConfigQueryOptions: <TData = Awaited<ReturnType<typeof getIndexerConfig>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getIndexerConfig>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getIndexerConfig>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetIndexerConfigQueryResult = NonNullable<Awaited<ReturnType<typeof getIndexerConfig>>>;
export type GetIndexerConfigQueryError = ErrorType<unknown>;
/**
 * @summary Get the configured document directory and indexing rules
 */
export declare function useGetIndexerConfig<TData = Awaited<ReturnType<typeof getIndexerConfig>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getIndexerConfig>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSaveIndexerConfigUrl: () => string;
/**
 * @summary Save the directory target and indexing rules
 */
export declare const saveIndexerConfig: (indexerConfigInput: IndexerConfigInput, options?: Parameters<typeof customFetch>[1]) => Promise<IndexerConfig>;
export declare const getSaveIndexerConfigMutationKey: () => readonly ["saveIndexerConfig"];
export declare const getSaveIndexerConfigMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof saveIndexerConfig>>, TError, SaveIndexerConfigMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof saveIndexerConfig>>, TError, SaveIndexerConfigMutationVariables, TContext>;
export type SaveIndexerConfigMutationResult = NonNullable<Awaited<ReturnType<typeof saveIndexerConfig>>>;
export type SaveIndexerConfigMutationBody = BodyType<IndexerConfigInput>;
export type SaveIndexerConfigMutationError = ErrorType<unknown>;
export type SaveIndexerConfigMutationVariables = {
    data: BodyType<IndexerConfigInput>;
};
/**
* @summary Save the directory target and indexing rules
*/
export declare const useSaveIndexerConfig: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof saveIndexerConfig>>, TError, SaveIndexerConfigMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof saveIndexerConfig>>, TError, SaveIndexerConfigMutationVariables, TContext>;
export declare const getTestDirectoryTargetUrl: () => string;
/**
 * @summary Check read access to a directory target
 */
export declare const testDirectoryTarget: (directoryTestInput: DirectoryTestInput, options?: Parameters<typeof customFetch>[1]) => Promise<DirectoryTestResult>;
export declare const getTestDirectoryTargetMutationKey: () => readonly ["testDirectoryTarget"];
export declare const getTestDirectoryTargetMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof testDirectoryTarget>>, TError, TestDirectoryTargetMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof testDirectoryTarget>>, TError, TestDirectoryTargetMutationVariables, TContext>;
export type TestDirectoryTargetMutationResult = NonNullable<Awaited<ReturnType<typeof testDirectoryTarget>>>;
export type TestDirectoryTargetMutationBody = BodyType<DirectoryTestInput>;
export type TestDirectoryTargetMutationError = ErrorType<unknown>;
export type TestDirectoryTargetMutationVariables = {
    data: BodyType<DirectoryTestInput>;
};
/**
* @summary Check read access to a directory target
*/
export declare const useTestDirectoryTarget: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof testDirectoryTarget>>, TError, TestDirectoryTargetMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof testDirectoryTarget>>, TError, TestDirectoryTargetMutationVariables, TContext>;
export declare const getStartDocumentIndexUrl: () => string;
/**
 * @summary Start an asynchronous directory crawl and index
 */
export declare const startDocumentIndex: (options?: Parameters<typeof customFetch>[1]) => Promise<IndexStartResult>;
export declare const getStartDocumentIndexMutationKey: () => readonly ["startDocumentIndex"];
export declare const getStartDocumentIndexMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startDocumentIndex>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startDocumentIndex>>, TError, void, TContext>;
export type StartDocumentIndexMutationResult = NonNullable<Awaited<ReturnType<typeof startDocumentIndex>>>;
export type StartDocumentIndexMutationError = ErrorType<unknown>;
/**
* @summary Start an asynchronous directory crawl and index
*/
export declare const useStartDocumentIndex: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startDocumentIndex>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startDocumentIndex>>, TError, void, TContext>;
export declare const getGetDocumentIndexStatusUrl: () => string;
/**
 * @summary Get current indexing progress
 */
export declare const getDocumentIndexStatus: (options?: Parameters<typeof customFetch>[1]) => Promise<IndexStatus>;
export declare const getGetDocumentIndexStatusQueryKey: () => readonly ["/api/documents/index/status"];
export declare const getGetDocumentIndexStatusQueryOptions: <TData = Awaited<ReturnType<typeof getDocumentIndexStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentIndexStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDocumentIndexStatus>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDocumentIndexStatusQueryResult = NonNullable<Awaited<ReturnType<typeof getDocumentIndexStatus>>>;
export type GetDocumentIndexStatusQueryError = ErrorType<unknown>;
/**
 * @summary Get current indexing progress
 */
export declare function useGetDocumentIndexStatus<TData = Awaited<ReturnType<typeof getDocumentIndexStatus>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentIndexStatus>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDocumentStatsUrl: () => string;
/**
 * @summary Get indexed document totals and file-type counts
 */
export declare const getDocumentStats: (options?: Parameters<typeof customFetch>[1]) => Promise<DocumentStats>;
export declare const getGetDocumentStatsQueryKey: () => readonly ["/api/documents/stats"];
export declare const getGetDocumentStatsQueryOptions: <TData = Awaited<ReturnType<typeof getDocumentStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDocumentStats>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDocumentStatsQueryResult = NonNullable<Awaited<ReturnType<typeof getDocumentStats>>>;
export type GetDocumentStatsQueryError = ErrorType<unknown>;
/**
 * @summary Get indexed document totals and file-type counts
 */
export declare function useGetDocumentStats<TData = Awaited<ReturnType<typeof getDocumentStats>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentStats>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSearchDocumentsUrl: (params?: SearchDocumentsParams) => string;
/**
 * @summary Search indexed document names or full text
 */
export declare const searchDocuments: (params?: SearchDocumentsParams, options?: Parameters<typeof customFetch>[1]) => Promise<DocumentSearchResponse>;
export declare const getSearchDocumentsQueryKey: (params?: SearchDocumentsParams) => readonly ["/api/documents/search", ...SearchDocumentsParams[]];
export declare const getSearchDocumentsQueryOptions: <TData = Awaited<ReturnType<typeof searchDocuments>>, TError = ErrorType<unknown>>(params?: SearchDocumentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof searchDocuments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof searchDocuments>>, TError, TData> & {
    queryKey: QueryKey;
};
export type SearchDocumentsQueryResult = NonNullable<Awaited<ReturnType<typeof searchDocuments>>>;
export type SearchDocumentsQueryError = ErrorType<unknown>;
/**
 * @summary Search indexed document names or full text
 */
export declare function useSearchDocuments<TData = Awaited<ReturnType<typeof searchDocuments>>, TError = ErrorType<unknown>>(params?: SearchDocumentsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof searchDocuments>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDocumentUrl: (id: string) => string;
/**
 * @summary Get indexed document metadata
 */
export declare const getDocument: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<Document>;
export declare const getGetDocumentQueryKey: (id: string) => readonly [`/api/documents/${string}`];
export declare const getGetDocumentQueryOptions: <TData = Awaited<ReturnType<typeof getDocument>>, TError = ErrorType<void>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocument>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDocument>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDocumentQueryResult = NonNullable<Awaited<ReturnType<typeof getDocument>>>;
export type GetDocumentQueryError = ErrorType<void>;
/**
 * @summary Get indexed document metadata
 */
export declare function useGetDocument<TData = Awaited<ReturnType<typeof getDocument>>, TError = ErrorType<void>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocument>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDocumentPreviewUrl: (id: string) => string;
/**
 * @summary Read a document preview
 */
export declare const getDocumentPreview: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<DocumentPreview>;
export declare const getGetDocumentPreviewQueryKey: (id: string) => readonly [`/api/documents/${string}/preview`];
export declare const getGetDocumentPreviewQueryOptions: <TData = Awaited<ReturnType<typeof getDocumentPreview>>, TError = ErrorType<void>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentPreview>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDocumentPreview>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDocumentPreviewQueryResult = NonNullable<Awaited<ReturnType<typeof getDocumentPreview>>>;
export type GetDocumentPreviewQueryError = ErrorType<void>;
/**
 * @summary Read a document preview
 */
export declare function useGetDocumentPreview<TData = Awaited<ReturnType<typeof getDocumentPreview>>, TError = ErrorType<void>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentPreview>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDocumentContentUrl: (id: string) => string;
/**
 * @summary Stream the raw document content for inline PDF viewing or downloading
 */
export declare const getDocumentContent: (id: string, options?: Parameters<typeof customFetch>[1]) => Promise<Blob>;
export declare const getGetDocumentContentQueryKey: (id: string) => readonly [`/api/documents/${string}/content`];
export declare const getGetDocumentContentQueryOptions: <TData = Awaited<ReturnType<typeof getDocumentContent>>, TError = ErrorType<void>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentContent>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDocumentContent>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDocumentContentQueryResult = NonNullable<Awaited<ReturnType<typeof getDocumentContent>>>;
export type GetDocumentContentQueryError = ErrorType<void>;
/**
 * @summary Stream the raw document content for inline PDF viewing or downloading
 */
export declare function useGetDocumentContent<TData = Awaited<ReturnType<typeof getDocumentContent>>, TError = ErrorType<void>>(id: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDocumentContent>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getEmailDocumentUrl: (id: string) => string;
/**
 * @summary Email an indexed document as an attachment or internal link
 */
export declare const emailDocument: (id: string, emailDocumentInput: EmailDocumentInput, options?: Parameters<typeof customFetch>[1]) => Promise<EmailDispatchResult>;
export declare const getEmailDocumentMutationKey: () => readonly ["emailDocument"];
export declare const getEmailDocumentMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emailDocument>>, TError, EmailDocumentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof emailDocument>>, TError, EmailDocumentMutationVariables, TContext>;
export type EmailDocumentMutationResult = NonNullable<Awaited<ReturnType<typeof emailDocument>>>;
export type EmailDocumentMutationBody = BodyType<EmailDocumentInput>;
export type EmailDocumentMutationError = ErrorType<void>;
export type EmailDocumentMutationVariables = {
    id: string;
    data: BodyType<EmailDocumentInput>;
};
/**
* @summary Email an indexed document as an attachment or internal link
*/
export declare const useEmailDocument: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof emailDocument>>, TError, EmailDocumentMutationVariables, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof emailDocument>>, TError, EmailDocumentMutationVariables, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map