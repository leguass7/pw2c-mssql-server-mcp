import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  transport: 'stdio' | 'sse';
  timeoutMs?: number;
  connectTimeoutMs?: number;
  connectionString?: string;
  connectionName?: string;
}

const asyncRequestContext = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = async <T>(context: RequestContext, fn: () => Promise<T>): Promise<T> => {
  return asyncRequestContext.run(context, fn);
};

export const getRequestContext = (): RequestContext | undefined => {
  return asyncRequestContext.getStore();
};
