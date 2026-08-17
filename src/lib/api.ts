import { ensureAuthSession } from './auth'
import type {
  AuthSession,
  ExchangeRate,
  TransactionAction,
  TransactionDraft,
  TransactionRecord,
} from '../types'

type FetchLike = typeof fetch

type RequestBody = Record<string, string | null>

type ApiTransaction = {
  id: string
  user_id: string
  action: TransactionAction
  card_type: string
  custom_card_type: string | null
  price: string
  currency: 'THB' | 'USD'
  price_thb: string
  exchange_rate_to_thb: string
  exchange_rate_date: string
  transaction_date: string
  created_at: string
  updated_at: string
}

type ApiExchangeRate = {
  base: 'THB' | 'USD'
  quote: 'THB' | 'USD'
  rate: string
  provider_date: string
  stale: boolean
}

type ApiErrorPayload = {
  code?: string
  error?: string
}

export class ApiError extends Error {
  status: number
  code: string

  constructor({
    status,
    code,
    message,
  }: {
    status: number
    code: string
    message: string
  }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface ApiClient {
  listTransactions(action?: TransactionAction): Promise<TransactionRecord[]>
  createTransaction(draft: TransactionDraft): Promise<TransactionRecord>
  updateTransaction(id: string, draft: TransactionDraft): Promise<TransactionRecord>
  deleteTransaction(id: string): Promise<void>
  getExchangeRate(): Promise<ExchangeRate>
}

export function createApiClient({
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
  getAuthSession = ensureAuthSession,
}: {
  fetch?: FetchLike
  getAuthSession?: () => Promise<AuthSession>
} = {}): ApiClient {
  return {
    async listTransactions(action) {
      const search = action ? `?action=${encodeURIComponent(action)}` : ''
      const payload = await requestJSON<{ transactions: ApiTransaction[] }>({
        fetchImpl,
        getAuthSession,
        path: `/api/transactions${search}`,
        method: 'GET',
      })
      return payload.transactions.map(mapTransaction)
    },

    async createTransaction(draft) {
      const payload = await requestJSON<{ transaction: ApiTransaction }>({
        fetchImpl,
        getAuthSession,
        path: '/api/transactions',
        method: 'POST',
        body: serializeDraft(draft),
      })
      return mapTransaction(payload.transaction)
    },

    async updateTransaction(id, draft) {
      const payload = await requestJSON<{ transaction: ApiTransaction }>({
        fetchImpl,
        getAuthSession,
        path: `/api/transactions/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body: serializeDraft(draft),
      })
      return mapTransaction(payload.transaction)
    },

    async deleteTransaction(id) {
      await requestJSON<void>({
        fetchImpl,
        getAuthSession,
        path: `/api/transactions/${encodeURIComponent(id)}`,
        method: 'DELETE',
      })
    },

    async getExchangeRate() {
      const payload = await requestJSON<ApiExchangeRate>({
        fetchImpl,
        getAuthSession,
        path: '/api/exchange-rate?from=USD&to=THB',
        method: 'GET',
      })
      return {
        base: payload.base,
        quote: payload.quote,
        rate: payload.rate,
        providerDate: payload.provider_date,
        stale: payload.stale,
      }
    },
  }
}

export const apiClient = createApiClient()

async function requestJSON<T>({
  fetchImpl,
  getAuthSession,
  path,
  method,
  body,
}: {
  fetchImpl: FetchLike
  getAuthSession: () => Promise<AuthSession>
  path: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: RequestBody
}): Promise<T> {
  const session = await getAuthSession()

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
  }

  let serializedBody: string | undefined
  if (body) {
    headers['Content-Type'] = 'application/json'
    serializedBody = JSON.stringify(body)
  }

  const response = await fetchImpl(path, {
    method,
    headers,
    body: serializedBody,
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

async function toApiError(response: Response): Promise<ApiError> {
  const fallbackMessage = `Request failed with status ${response.status}`
  const contentType = response.headers.get('Content-Type') ?? ''

  if (contentType.includes('application/json')) {
    let payload: ApiErrorPayload | null = null

    try {
      payload = (await response.json()) as ApiErrorPayload
    } catch {
      payload = null
    }

    return new ApiError({
      status: response.status,
      code: payload?.code ?? 'unknown_error',
      message: payload?.error ?? fallbackMessage,
    })
  }

  const text = await response.text()
  return new ApiError({
    status: response.status,
    code: 'unknown_error',
    message: text || fallbackMessage,
  })
}

function serializeDraft(draft: TransactionDraft): RequestBody {
  return {
    action: draft.action,
    card_type: draft.cardType,
    custom_card_type: draft.customCardType,
    price: draft.price,
    currency: draft.currency,
    transaction_date: draft.transactionDate,
  }
}

function mapTransaction(transaction: ApiTransaction): TransactionRecord {
  return {
    id: transaction.id,
    userId: transaction.user_id,
    action: transaction.action,
    cardType: transaction.card_type,
    customCardType: transaction.custom_card_type,
    price: transaction.price,
    currency: transaction.currency,
    priceThb: transaction.price_thb,
    exchangeRateToThb: transaction.exchange_rate_to_thb,
    exchangeRateDate: transaction.exchange_rate_date,
    transactionDate: transaction.transaction_date,
    createdAt: transaction.created_at,
    updatedAt: transaction.updated_at,
  }
}
