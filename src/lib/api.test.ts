import { describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient } from './api'
import type { TransactionDraft } from '../types'

describe('createApiClient', () => {
  const session = {
    accessToken: 'jwt-token',
    userId: 'user-123',
    isAnonymous: true,
  }

  it('sends bearer auth and parses transaction records', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          transactions: [
            {
              id: 'txn-1',
              user_id: 'user-123',
              action: 'BUY',
              card_type: 'Sport card',
              custom_card_type: null,
              price: '100.00',
              currency: 'USD',
              price_thb: '3550.00',
              exchange_rate_to_thb: '35.50',
              exchange_rate_date: '2026-08-17',
              transaction_date: '2026-08-17',
              created_at: '2026-08-17T00:00:00Z',
              updated_at: '2026-08-17T00:00:00Z',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const client = createApiClient({
      fetch: fetchMock,
      getAuthSession: vi.fn().mockResolvedValue(session),
    })

    await expect(client.listTransactions('BUY')).resolves.toEqual([
      {
        id: 'txn-1',
        userId: 'user-123',
        action: 'BUY',
        cardType: 'Sport card',
        customCardType: null,
        price: '100.00',
        currency: 'USD',
        priceThb: '3550.00',
        exchangeRateToThb: '35.50',
        exchangeRateDate: '2026-08-17',
        transactionDate: '2026-08-17',
        createdAt: '2026-08-17T00:00:00Z',
        updatedAt: '2026-08-17T00:00:00Z',
      },
    ])

    expect(fetchMock).toHaveBeenCalledWith('/api/transactions?action=BUY', {
      body: undefined,
      headers: {
        Authorization: 'Bearer jwt-token',
      },
      method: 'GET',
    })
  })

  it('serializes drafts for create and preserves original price fields only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          transaction: {
            id: 'txn-2',
            user_id: 'user-123',
            action: 'SELL',
            card_type: 'Others',
            custom_card_type: 'Promo',
            price: '100.00',
            currency: 'USD',
            price_thb: '3550.00',
            exchange_rate_to_thb: '35.50',
            exchange_rate_date: '2026-08-17',
            transaction_date: '2026-08-17',
            created_at: '2026-08-17T00:00:00Z',
            updated_at: '2026-08-17T00:00:00Z',
          },
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const client = createApiClient({
      fetch: fetchMock,
      getAuthSession: vi.fn().mockResolvedValue(session),
    })

    const draft = {
      action: 'SELL',
      cardType: 'Others',
      customCardType: 'Promo',
      price: '100.00',
      currency: 'USD',
      transactionDate: '2026-08-17',
      priceThb: '9999.99',
    } as TransactionDraft & { priceThb: string }

    await client.createTransaction(draft)

    expect(fetchMock).toHaveBeenCalledWith('/api/transactions', {
      body: JSON.stringify({
        action: 'SELL',
        card_type: 'Others',
        custom_card_type: 'Promo',
        price: '100.00',
        currency: 'USD',
        transaction_date: '2026-08-17',
      }),
      headers: {
        Authorization: 'Bearer jwt-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  })

  it('serializes update requests as PATCH bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          transaction: {
            id: 'txn-9',
            user_id: 'user-123',
            action: 'BUY',
            card_type: 'Pokemon card',
            custom_card_type: null,
            price: '2500.00',
            currency: 'THB',
            price_thb: '2500.00',
            exchange_rate_to_thb: '1.00',
            exchange_rate_date: '2026-08-17',
            transaction_date: '2026-08-18',
            created_at: '2026-08-17T00:00:00Z',
            updated_at: '2026-08-18T00:00:00Z',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const client = createApiClient({
      fetch: fetchMock,
      getAuthSession: vi.fn().mockResolvedValue(session),
    })

    await client.updateTransaction('txn-9', {
      action: 'BUY',
      cardType: 'Pokemon card',
      customCardType: null,
      price: '2500.00',
      currency: 'THB',
      transactionDate: '2026-08-18',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/transactions/txn-9', {
      body: JSON.stringify({
        action: 'BUY',
        card_type: 'Pokemon card',
        custom_card_type: null,
        price: '2500.00',
        currency: 'THB',
        transaction_date: '2026-08-18',
      }),
      headers: {
        Authorization: 'Bearer jwt-token',
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    })
  })

  it('sends delete requests without a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))

    const client = createApiClient({
      fetch: fetchMock,
      getAuthSession: vi.fn().mockResolvedValue(session),
    })

    await expect(client.deleteTransaction('txn-4')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith('/api/transactions/txn-4', {
      body: undefined,
      headers: {
        Authorization: 'Bearer jwt-token',
      },
      method: 'DELETE',
    })
  })

  it('parses exchange-rate responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          base: 'USD',
          quote: 'THB',
          rate: '35.50',
          provider_date: '2026-08-17',
          stale: true,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const client = createApiClient({
      fetch: fetchMock,
      getAuthSession: vi.fn().mockResolvedValue(session),
    })

    await expect(client.getExchangeRate()).resolves.toEqual({
      base: 'USD',
      quote: 'THB',
      rate: '35.50',
      providerDate: '2026-08-17',
      stale: true,
    })
  })

  it('throws structured API errors', async () => {
    const client = createApiClient({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'rate_unavailable',
            error: 'usd/thb rate unavailable',
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
      getAuthSession: vi.fn().mockResolvedValue(session),
    })

    await expect(client.getExchangeRate()).rejects.toEqual(
      new ApiError({
        status: 503,
        code: 'rate_unavailable',
        message: 'usd/thb rate unavailable',
      }),
    )
  })

  it('normalizes malformed or empty JSON error responses into ApiError fallbacks', async () => {
    const createErrorClient = (body: string) =>
      createApiClient({
        fetch: vi.fn().mockResolvedValue(
          new Response(body, {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
        getAuthSession: vi.fn().mockResolvedValue(session),
      })

    await expect(createErrorClient('{').getExchangeRate()).rejects.toEqual(
      new ApiError({
        status: 502,
        code: 'unknown_error',
        message: 'Request failed with status 502',
      }),
    )

    await expect(createErrorClient('').getExchangeRate()).rejects.toEqual(
      new ApiError({
        status: 502,
        code: 'unknown_error',
        message: 'Request failed with status 502',
      }),
    )
  })
})
