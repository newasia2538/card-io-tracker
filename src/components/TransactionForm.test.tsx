import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TransactionForm } from './TransactionForm'
import type { ExchangeRate, TransactionRecord } from '../types'

const freshRate: ExchangeRate = {
  base: 'USD',
  quote: 'THB',
  rate: '35.50',
  providerDate: '2026-08-17',
  stale: false,
}

describe('TransactionForm', () => {
  it('defaults to BUY with the required card type and currency options', () => {
    renderForm()

    expect(screen.getByLabelText('BUY')).toBeChecked()
    expect(screen.getByLabelText('SELL')).not.toBeChecked()
    expect(screen.getByLabelText('Card Type')).toHaveDisplayValue('Sport card')
    expect(screen.getByLabelText('Currency')).toHaveDisplayValue('THB')
    expect(screen.getByLabelText('Transaction date')).toHaveValue(getToday())

    const cardTypeSelect = screen.getByLabelText('Card Type')
    expect(screen.getByRole('option', { name: 'Sport card' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pokemon card' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'One Piece Card' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'JH Card' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Others' })).toBeInTheDocument()
    expect(cardTypeSelect).not.toHaveDisplayValue('Others')
  })

  it('shows a custom card type input only when Others is selected', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.queryByLabelText('Custom card type')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Card Type'), 'Others')
    expect(screen.getByLabelText('Custom card type')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Card Type'), 'JH Card')
    expect(screen.queryByLabelText('Custom card type')).not.toBeInTheDocument()
  })

  it('shows the live USD preview with provider date and stale attribution', async () => {
    const user = userEvent.setup()
    let requestCount = 0
    const getExchangeRate = vi.fn<() => Promise<ExchangeRate>>().mockImplementation(async () => {
      requestCount += 1
      return requestCount === 1
        ? freshRate
        : {
            ...freshRate,
            stale: true,
          }
    })

    renderForm({ getExchangeRate })

    await user.selectOptions(screen.getByLabelText('Currency'), 'USD')
    await user.type(screen.getByLabelText('Price'), '100')

    await waitFor(() => {
      expect(getExchangeRate).toHaveBeenCalled()
    })

    expect(screen.getByText('1 USD = ฿35.50 THB')).toBeInTheDocument()
    expect(screen.getByText('≈ ฿3550.00 THB')).toBeInTheDocument()
    expect(screen.getByText('Provider date: 2026-08-17')).toBeInTheDocument()
    expect(screen.getByText('Source: Frankfurter')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Price'))
    await user.type(screen.getByLabelText('Price'), '200')

    await waitFor(() => {
      expect(screen.getByText('Cached rate')).toBeInTheDocument()
    })
  })

  it('validates required fields before saving', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    renderForm({ onSubmit })

    await user.selectOptions(screen.getByLabelText('Card Type'), 'Others')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Price is required.')).toBeInTheDocument()
    expect(screen.getByText('Custom card type is required.')).toBeInTheDocument()
  })

  it('submits the original draft and clears entered values in create mode', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    renderForm({ onSubmit })

    await user.click(screen.getByLabelText('SELL'))
    await user.selectOptions(screen.getByLabelText('Card Type'), 'Pokemon card')
    await user.type(screen.getByLabelText('Price'), '2500')
    await user.clear(screen.getByLabelText('Transaction date'))
    await user.type(screen.getByLabelText('Transaction date'), '2026-08-16')
    await user.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        action: 'SELL',
        cardType: 'Pokemon card',
        customCardType: null,
        price: '2500',
        currency: 'THB',
        transactionDate: '2026-08-16',
      })
    })

    await user.click(screen.getByRole('button', { name: 'CLEAR' }))
    expect(screen.getByLabelText('BUY')).toBeChecked()
    expect(screen.getByLabelText('Price')).toHaveValue('')
    expect(screen.getByLabelText('Transaction date')).toHaveValue(getToday())
  })

  it('fills edit mode from the selected row and uses UPDATE', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    renderForm({
      editingTransaction: {
        id: 'txn-9',
        userId: 'user-1',
        action: 'SELL',
        cardType: 'Others',
        customCardType: 'Promo',
        price: '100.00',
        currency: 'USD',
        priceThb: '3550.00',
        exchangeRateToThb: '35.50',
        exchangeRateDate: '2026-08-17',
        transactionDate: '2026-08-16',
        createdAt: '2026-08-16T00:00:00Z',
        updatedAt: '2026-08-16T00:00:00Z',
      },
      onSubmit,
    })

    expect(screen.getByRole('button', { name: 'UPDATE' })).toBeInTheDocument()
    expect(screen.getByLabelText('SELL')).toBeChecked()
    expect(screen.getByLabelText('Card Type')).toHaveDisplayValue('Others')
    expect(screen.getByLabelText('Custom card type')).toHaveValue('Promo')
    expect(screen.getByLabelText('Currency')).toHaveDisplayValue('USD')
    expect(screen.getByLabelText('Transaction date')).toHaveValue('2026-08-16')

    await user.clear(screen.getByLabelText('Price'))
    await user.type(screen.getByLabelText('Price'), '125')
    await user.click(screen.getByRole('button', { name: 'UPDATE' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        action: 'SELL',
        cardType: 'Others',
        customCardType: 'Promo',
        price: '125',
        currency: 'USD',
        transactionDate: '2026-08-16',
      })
    })
  })
})

function renderForm({
  getExchangeRate = vi.fn().mockResolvedValue(freshRate),
  onSubmit = vi.fn().mockResolvedValue(undefined),
  editingTransaction = null,
}: {
  getExchangeRate?: () => Promise<ExchangeRate>
  onSubmit?: (draft: {
    action: 'BUY' | 'SELL'
    cardType: string
    customCardType: string | null
    price: string
    currency: 'THB' | 'USD'
    transactionDate: string
  }) => Promise<void>
  editingTransaction?: TransactionRecord | null
} = {}) {
  return render(
    <TransactionForm
      defaultCurrency="THB"
      editingTransaction={editingTransaction}
      getExchangeRate={getExchangeRate}
      onSubmit={onSubmit}
      onClearEdit={vi.fn()}
      resetSignal={0}
    />,
  )
}

function getToday(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = `${today.getMonth() + 1}`.padStart(2, '0')
  const day = `${today.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
