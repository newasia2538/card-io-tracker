import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { App } from './App'
import type { ApiClient } from './lib/api'
import type { AuthSession, ExchangeRate, TransactionRecord } from './types'

const anonymousSession: AuthSession = {
  accessToken: 'jwt-token',
  userId: 'user-1',
  isAnonymous: true,
}

const authenticatedSession: AuthSession = {
  accessToken: 'jwt-token',
  userId: 'user-1',
  isAnonymous: false,
}

const exchangeRate: ExchangeRate = {
  base: 'USD',
  quote: 'THB',
  rate: '35.50',
  providerDate: '2026-08-17',
  stale: false,
}

const buyTransactions: TransactionRecord[] = [
  {
    id: 'buy-1',
    userId: 'user-1',
    action: 'BUY',
    cardType: 'Sport card',
    customCardType: null,
    price: '1000.00',
    currency: 'THB',
    priceThb: '1000.00',
    exchangeRateToThb: '1.00',
    exchangeRateDate: '2026-08-17',
    transactionDate: '2026-08-17',
    createdAt: '2026-08-17T00:00:00Z',
    updatedAt: '2026-08-17T00:00:00Z',
  },
]

const sellTransactions: TransactionRecord[] = [
  {
    id: 'sell-1',
    userId: 'user-1',
    action: 'SELL',
    cardType: 'Pokemon card',
    customCardType: null,
    price: '100.00',
    currency: 'USD',
    priceThb: '3550.00',
    exchangeRateToThb: '35.50',
    exchangeRateDate: '2026-08-17',
    transactionDate: '2026-08-16',
    createdAt: '2026-08-16T00:00:00Z',
    updatedAt: '2026-08-16T00:00:00Z',
  },
]

describe('App', () => {
  it('calls ensureAuthSession before loading data and shows anonymous-only upgrade controls', async () => {
    const authLoader = vi.fn().mockResolvedValue(anonymousSession)
    const apiClient = createApiClientDouble()

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={authLoader}
        locale="th-TH"
      />,
    )

    expect(screen.getByText('Loading your ledger…')).toBeInTheDocument()

    await screen.findByRole('heading', { name: 'CardIO' })

    expect(authLoader.mock.invocationCallOrder[0]).toBeLessThan(
      (apiClient.listTransactions as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    )
    expect(apiClient.listTransactions).toHaveBeenCalledWith('BUY')
    expect(apiClient.listTransactions).toHaveBeenCalledWith('SELL')
    expect(screen.getByRole('button', { name: 'Upgrade account' })).toBeInTheDocument()
  })

  it('shows CardIO branding and lets users switch day/night and language', async () => {
    const user = userEvent.setup()

    render(
      <App
        apiClient={createApiClientDouble()}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="en-US"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })
    expect(screen.getByText('Your card transaction tracker')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Plain layout, compact controls, and one table for all activity. Newest transactions appear first by default.',
      ),
    ).not.toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'NIGHT' }))
    expect(screen.getByRole('main')).toHaveAttribute('data-theme', 'night')

    await user.click(screen.getByRole('button', { name: 'ไทย' }))
    expect(screen.getByRole('main')).toHaveAttribute('data-language', 'th')
    expect(document.documentElement.lang).toBe('th')
    expect(screen.getByRole('heading', { name: 'เพิ่มธุรกรรม' })).toBeInTheDocument()
  })

  it('places the open Upgrade account panel before the transaction form', async () => {
    const user = userEvent.setup()

    render(
      <App
        apiClient={createApiClientDouble()}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="en-US"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })
    await user.click(screen.getByRole('button', { name: 'Upgrade account' }))

    const upgradePanel = screen.getByRole('region', { name: 'Upgrade account' })
    const transactionForm = screen.getByRole('region', { name: 'Transaction form' })

    expect(upgradePanel.compareDocumentPosition(transactionForm)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it.each([
    ['05:59:59', 'night'],
    ['06:00:00', 'day'],
    ['17:59:59', 'day'],
    ['18:00:00', 'night'],
  ] as const)('defaults to %s theme at %s local time', (time, expectedTheme) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`2026-08-18T${time}`))

    try {
      render(
        <App
          apiClient={createApiClientDouble()}
          authClient={createAuthClientDouble()}
          authLoader={vi.fn().mockResolvedValue(anonymousSession)}
          locale="en-US"
        />,
      )

      expect(screen.getByRole('main')).toHaveAttribute('data-theme', expectedTheme)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshes after save and keeps the active tab plus display currency', async () => {
    const user = userEvent.setup()
    const apiClient = createApiClientDouble({
      listTransactions: vi
        .fn()
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? buyTransactions : sellTransactions,
        )
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? buyTransactions : sellTransactions,
        )
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY'
            ? buyTransactions
            : [
                {
                  ...sellTransactions[0],
                  id: 'sell-2',
                  cardType: 'One Piece Card',
                  price: '120.00',
                  priceThb: '4260.00',
                },
                ...sellTransactions,
              ],
        )
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY'
            ? buyTransactions
            : [
                {
                  ...sellTransactions[0],
                  id: 'sell-2',
                  cardType: 'One Piece Card',
                  price: '120.00',
                  priceThb: '4260.00',
                },
                ...sellTransactions,
              ],
        ),
    })

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })

    await user.click(screen.getByRole('button', { name: 'Sell (1)' }))
    await user.click(screen.getByRole('button', { name: 'USD' }))
    await user.click(screen.getByLabelText('SELL'))
    await user.selectOptions(screen.getByLabelText('Card Type'), 'One Piece Card')
    await user.selectOptions(screen.getByLabelText('Currency'), 'USD')
    await user.type(screen.getByLabelText('Price'), '120')
    await user.clear(screen.getByLabelText('Transaction date'))
    await user.type(screen.getByLabelText('Transaction date'), '2026-08-17')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => {
      expect(apiClient.createTransaction).toHaveBeenCalledWith({
        action: 'SELL',
        cardType: 'One Piece Card',
        customCardType: null,
        price: '120',
        currency: 'USD',
        transactionDate: '2026-08-17',
      })
    })

    expect(screen.getByRole('button', { name: 'Sell (2)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'USD' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Transaction saved.')).toBeInTheDocument()
  })

  it('fills the form from edit, updates the row, and only deletes after confirmation', async () => {
    const user = userEvent.setup()
    const apiClient = createApiClientDouble({
      listTransactions: vi
        .fn()
        .mockImplementation(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? buyTransactions : sellTransactions,
        ),
    })

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })

    await user.click(screen.getByRole('button', { name: 'Sell (1)' }))
    await user.click(screen.getByRole('button', { name: 'Edit Pokemon card' }))
    expect(screen.getByRole('button', { name: 'UPDATE' })).toBeInTheDocument()
    expect(screen.getByLabelText('Card Type')).toHaveDisplayValue('Pokemon card')

    await user.clear(screen.getByLabelText('Price'))
    await user.type(screen.getByLabelText('Price'), '125')
    await user.click(screen.getByRole('button', { name: 'UPDATE' }))

    await waitFor(() => {
      expect(apiClient.updateTransaction).toHaveBeenCalledWith('sell-1', {
        action: 'SELL',
        cardType: 'Pokemon card',
        customCardType: null,
        price: '125',
        currency: 'USD',
        transactionDate: '2026-08-16',
      })
    })

    await user.click(screen.getByRole('button', { name: 'Delete Pokemon card' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(apiClient.deleteTransaction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete Pokemon card' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => {
      expect(apiClient.deleteTransaction).toHaveBeenCalledWith('sell-1')
    })
  })

  it('clears edit mode after deleting the transaction currently being edited', async () => {
    const user = userEvent.setup()
    const apiClient = createApiClientDouble({
      listTransactions: vi
        .fn()
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? buyTransactions : sellTransactions,
        )
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? buyTransactions : sellTransactions,
        )
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') => (action === 'BUY' ? buyTransactions : []))
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') => (action === 'BUY' ? buyTransactions : [])),
    })

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })

    await user.click(screen.getByRole('button', { name: 'Sell (1)' }))
    await user.click(screen.getByRole('button', { name: 'Edit Pokemon card' }))
    expect(screen.getByRole('button', { name: 'UPDATE' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete Pokemon card' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    await waitFor(() => {
      expect(apiClient.deleteTransaction).toHaveBeenCalledWith('sell-1')
    })

    expect(screen.getByRole('button', { name: 'SAVE' })).toBeInTheDocument()
    expect(screen.getByLabelText('BUY')).toBeChecked()
    expect(screen.getByLabelText('Price')).toHaveValue('')
    expect(screen.getByText('No SELL transactions yet.')).toBeInTheDocument()
  })

  it('shows a retry button for initial bootstrap failures and retries loading from the button', async () => {
    const user = userEvent.setup()
    const authLoader = vi
      .fn<() => Promise<AuthSession>>()
      .mockRejectedValueOnce(new Error('Auth temporarily unavailable'))
      .mockResolvedValueOnce(anonymousSession)
    const apiClient = createApiClientDouble()

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={authLoader}
        locale="th-TH"
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Auth temporarily unavailable')
    })

    await user.click(screen.getByRole('button', { name: 'Retry loading ledger' }))

    await waitFor(() => {
      expect(authLoader).toHaveBeenCalledTimes(2)
    })

    expect(apiClient.listTransactions).toHaveBeenCalledWith('BUY')
    expect(apiClient.listTransactions).toHaveBeenCalledWith('SELL')
    expect(screen.getByText('Ledger ready.')).toBeInTheDocument()
  })

  it('shows a retry button when bootstrap data loading fails after auth succeeds and retries successfully', async () => {
    const user = userEvent.setup()
    const authLoader = vi.fn().mockResolvedValue(authenticatedSession)
    const listTransactions = vi.fn(async (action?: 'BUY' | 'SELL') => {
      if (action === 'BUY' && listTransactions.mock.calls.length === 1) {
        throw new Error('Transactions temporarily unavailable')
      }

      return action === 'BUY' ? buyTransactions : sellTransactions
    })
    const apiClient = createApiClientDouble({
      listTransactions,
    })

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={authLoader}
        locale="th-TH"
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Transactions temporarily unavailable')
    })

    await user.click(screen.getByRole('button', { name: 'Retry loading ledger' }))

    await waitFor(() => {
      expect(listTransactions).toHaveBeenCalledWith('BUY')
      expect(listTransactions).toHaveBeenCalledWith('SELL')
    })

    expect(screen.getByText('Ledger ready.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry loading ledger' })).not.toBeInTheDocument()
  })

  it('ignores stale bootstrap refresh results after a rerender starts a new bootstrap', async () => {
    const firstBuy = createDeferred<TransactionRecord[]>()
    const firstSell = createDeferred<TransactionRecord[]>()
    const firstRate = createDeferred<ExchangeRate>()
    const secondSellTransactions: TransactionRecord[] = [
      {
        ...sellTransactions[0],
        id: 'sell-2',
        cardType: 'One Piece Card',
        price: '120.00',
        priceThb: '4260.00',
      },
      sellTransactions[0],
    ]

    const firstClient = createApiClientDouble({
      listTransactions: vi.fn().mockImplementation((action?: 'BUY' | 'SELL') => {
        return action === 'BUY' ? firstBuy.promise : firstSell.promise
      }),
      getExchangeRate: vi.fn().mockImplementation(() => firstRate.promise),
    })
    const secondClient = createApiClientDouble({
      listTransactions: vi
        .fn()
        .mockImplementation(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? [] : secondSellTransactions,
        ),
      getExchangeRate: vi.fn().mockResolvedValue({
        ...exchangeRate,
        rate: '36.00',
      }),
    })

    const { rerender } = render(
      <App
        apiClient={firstClient}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await waitFor(() => {
      expect(firstClient.listTransactions).toHaveBeenCalledWith('BUY')
      expect(firstClient.listTransactions).toHaveBeenCalledWith('SELL')
    })

    rerender(
      <App
        apiClient={secondClient}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('button', { name: 'Sell (2)' })
    expect(screen.getByRole('button', { name: 'Buy (0)' })).toBeInTheDocument()

    firstBuy.resolve(buyTransactions)
    firstSell.resolve(sellTransactions)
    firstRate.resolve(exchangeRate)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sell (2)' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Buy (0)' })).toBeInTheDocument()
  })

  it('clears the visible USD summary rate when a refresh starts and keeps it cleared if the rate refresh fails', async () => {
    const user = userEvent.setup()
    const refreshedBuy = createDeferred<TransactionRecord[]>()
    const refreshedSell = createDeferred<TransactionRecord[]>()
    const refreshedRate = createDeferred<ExchangeRate>()
    const apiClient = createApiClientDouble({
      listTransactions: vi
        .fn()
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? buyTransactions : sellTransactions,
        )
        .mockImplementationOnce(async (action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? buyTransactions : sellTransactions,
        )
        .mockImplementationOnce((action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? refreshedBuy.promise : refreshedSell.promise,
        )
        .mockImplementationOnce((action?: 'BUY' | 'SELL') =>
          action === 'BUY' ? refreshedBuy.promise : refreshedSell.promise,
        ),
      getExchangeRate: vi
        .fn()
        .mockResolvedValueOnce(exchangeRate)
        .mockImplementationOnce(() => refreshedRate.promise),
    })

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })

    await user.click(screen.getByRole('button', { name: 'USD' }))
    expect(screen.queryByText('Source: Frankfurter · 2026-08-17')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Price'), '2500')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => {
      expect(screen.getByText('USD summary unavailable until exchange rate loads.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Source: Frankfurter · 2026-08-17')).not.toBeInTheDocument()

    refreshedRate.reject(new Error('Rate unavailable'))
    refreshedBuy.resolve(buyTransactions)
    refreshedSell.resolve(sellTransactions)

    await waitFor(() => {
      expect(screen.getByText('Transaction saved.')).toBeInTheDocument()
    })
    expect(screen.getByText('USD summary unavailable until exchange rate loads.')).toBeInTheDocument()
    expect(screen.queryByText('Source: Frankfurter · 2026-08-17')).not.toBeInTheDocument()
  })

  it('closes the upgrade flow only when the verified session keeps the same user id', async () => {
    const user = userEvent.setup()
    const updateUser = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'verified-token',
            user: {
              id: anonymousSession.userId,
              is_anonymous: false,
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'verified-token',
            user: {
              id: anonymousSession.userId,
              is_anonymous: false,
            },
          },
        },
        error: null,
      })

    render(
      <App
        apiClient={createApiClientDouble()}
        authClient={{
          getSession,
          updateUser,
        }}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })

    await user.click(screen.getByRole('button', { name: 'Upgrade account' }))
    await user.type(screen.getByLabelText('Email'), 'collector@example.com')
    await user.click(screen.getByRole('button', { name: 'Send verification email' }))
    await user.click(screen.getByRole('button', { name: "I've verified my email" }))
    await user.type(screen.getByLabelText('Password'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: 'Set password' }))

    await waitFor(() => {
      expect(screen.getByText('Account upgraded.')).toBeInTheDocument()
    })

    expect(screen.queryByRole('region', { name: 'Upgrade account' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Upgrade account' })).not.toBeInTheDocument()
  })

  it('shows an error and keeps the anonymous session when the upgraded session user id changes', async () => {
    const user = userEvent.setup()
    const updateUser = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'verified-token',
            user: {
              id: anonymousSession.userId,
              is_anonymous: false,
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'verified-token',
            user: {
              id: 'user-2',
              is_anonymous: false,
            },
          },
        },
        error: null,
      })

    render(
      <App
        apiClient={createApiClientDouble()}
        authClient={{
          getSession,
          updateUser,
        }}
        authLoader={vi.fn().mockResolvedValue(anonymousSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })

    await user.click(screen.getByRole('button', { name: 'Upgrade account' }))
    await user.type(screen.getByLabelText('Email'), 'collector@example.com')
    await user.click(screen.getByRole('button', { name: 'Send verification email' }))
    await user.click(screen.getByRole('button', { name: "I've verified my email" }))
    await user.type(screen.getByLabelText('Password'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: 'Set password' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The upgraded session did not match the current anonymous account. Please try again with the same account.',
      )
    })

    expect(screen.getByRole('heading', { name: 'Upgrade account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upgrade account' })).toBeInTheDocument()
  })

  it('shows request failures through aria-live feedback and hides upgrade for non-anonymous users', async () => {
    const user = userEvent.setup()
    const apiClient = createApiClientDouble({
      createTransaction: vi.fn().mockRejectedValue(new Error('Network unavailable')),
    })

    render(
      <App
        apiClient={apiClient}
        authClient={createAuthClientDouble()}
        authLoader={vi.fn().mockResolvedValue(authenticatedSession)}
        locale="th-TH"
      />,
    )

    await screen.findByRole('heading', { name: 'CardIO' })
    expect(screen.queryByRole('button', { name: 'Upgrade account' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Price'), '2500')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
    })
  })
})

function createApiClientDouble(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listTransactions: vi
      .fn()
      .mockImplementation(async (action?: 'BUY' | 'SELL') =>
        action === 'BUY' ? buyTransactions : sellTransactions,
      ),
    createTransaction: vi.fn().mockResolvedValue(sellTransactions[0]),
    updateTransaction: vi.fn().mockResolvedValue(sellTransactions[0]),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    getExchangeRate: vi.fn().mockResolvedValue(exchangeRate),
    ...overrides,
  }
}

function createAuthClientDouble() {
  return {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: null,
      },
      error: null,
    }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    reject,
    resolve,
  }
}
