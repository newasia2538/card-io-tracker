import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TransactionList } from './TransactionList'
import type { TransactionRecord } from '../types'

describe('TransactionList', () => {
  const buyTransactions: TransactionRecord[] = [
    {
      id: 'buy-new',
      userId: 'user-1',
      action: 'BUY',
      cardType: 'Pokemon card',
      customCardType: null,
      price: '2500.00',
      currency: 'THB',
      priceThb: '2500.00',
      exchangeRateToThb: '1.00',
      exchangeRateDate: '2026-08-17',
      transactionDate: '2026-08-16',
      createdAt: '2026-08-16T12:00:00Z',
      updatedAt: '2026-08-16T12:00:00Z',
    },
    {
      id: 'buy-old',
      userId: 'user-1',
      action: 'BUY',
      cardType: 'Sport card',
      customCardType: null,
      price: '100.00',
      currency: 'USD',
      priceThb: '3550.00',
      exchangeRateToThb: '35.50',
      exchangeRateDate: '2026-08-17',
      transactionDate: '2026-08-10',
      createdAt: '2026-08-10T12:00:00Z',
      updatedAt: '2026-08-10T12:00:00Z',
    },
  ]

  const sellTransactions: TransactionRecord[] = [
    {
      id: 'sell-1',
      userId: 'user-1',
      action: 'SELL',
      cardType: 'Others',
      customCardType: 'Promo',
      price: '150.00',
      currency: 'USD',
      priceThb: '5325.00',
      exchangeRateToThb: '35.50',
      exchangeRateDate: '2026-08-17',
      transactionDate: '2026-08-17',
      createdAt: '2026-08-17T12:00:00Z',
      updatedAt: '2026-08-17T12:00:00Z',
    },
  ]

  it('shows BUY and SELL tab counts and preserves latest-first order', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()

    render(
      <TransactionList
        activeTab="BUY"
        buyTransactions={buyTransactions}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onTabChange={onTabChange}
        sellTransactions={sellTransactions}
      />,
    )

    expect(screen.getByRole('button', { name: 'Buy (2)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sell (1)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'USD' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Original Currency' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Action' })).not.toBeInTheDocument()
    expect(screen.queryByText('All transactions, newest first.')).not.toBeInTheDocument()

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Pokemon card')).toBeInTheDocument()
    expect(within(rows[1]).getByText('$100.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sell (1)' }))
    expect(onTabChange).toHaveBeenCalledWith('SELL')
  })

  it('shows all transactions by default sorted by latest transaction date', () => {
    render(
      <TransactionList
        activeTab="ALL"
        buyTransactions={[buyTransactions[1]]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onTabChange={vi.fn()}
        sellTransactions={[sellTransactions[0], buyTransactions[0]]}
      />,
    )

    expect(screen.getByRole('button', { name: 'All (3)' })).toHaveAttribute('aria-pressed', 'true')

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveClass('transaction-row--sell')
    expect(rows[1]).toHaveClass('transaction-row--buy')
    expect(rows[2]).toHaveClass('transaction-row--buy')
    expect(within(rows[0]).getByText('Promo')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Pokemon card')).toBeInTheDocument()
    expect(within(rows[2]).getByText('$100.00')).toBeInTheDocument()
  })

  it('shows edit plus confirm/cancel delete actions for each row', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <TransactionList
        activeTab="SELL"
        buyTransactions={buyTransactions}
        onDelete={onDelete}
        onEdit={onEdit}
        onTabChange={vi.fn()}
        sellTransactions={sellTransactions}
      />,
    )

    const row = screen.getAllByRole('row').slice(1)[0]

    expect(within(row).getByText('EDIT')).toBeInTheDocument()
    expect(within(row).getByText('DELETE')).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Edit Promo' }))
    expect(onEdit).toHaveBeenCalledWith(sellTransactions[0])

    await user.click(within(row).getByRole('button', { name: 'Delete Promo' }))
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(within(row).getByRole('button', { name: 'Delete Promo' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(onDelete).toHaveBeenCalledWith('sell-1')
  })

  it('shows an empty state for tabs with no transactions', () => {
    render(
      <TransactionList
        activeTab="SELL"
        buyTransactions={buyTransactions}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onTabChange={vi.fn()}
        sellTransactions={[]}
      />,
    )

    expect(screen.getByText('No SELL transactions yet.')).toBeInTheDocument()
  })
})
