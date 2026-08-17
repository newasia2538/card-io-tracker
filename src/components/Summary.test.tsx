import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Summary } from './Summary'

describe('Summary', () => {
  it('shows BUY, SELL, and P/L with a THB/USD display switch', async () => {
    const user = userEvent.setup()
    const onDisplayCurrencyChange = vi.fn()

    render(
      <Summary
        displayCurrency="THB"
        exchangeRate={{
          base: 'USD',
          quote: 'THB',
          rate: '35.50',
          providerDate: '2026-08-17',
          stale: false,
        }}
        onDisplayCurrencyChange={onDisplayCurrencyChange}
        totals={{
          totalBuyTHB: '2800.00',
          totalSellTHB: '4000.00',
          profitLossTHB: '1200.00',
          totalBuyUSD: '78.87',
          totalSellUSD: '112.68',
          profitLossUSD: '33.81',
          profitLossStatus: 'profit',
        }}
      />,
    )

    expect(screen.getByText('BUY')).toBeInTheDocument()
    expect(screen.getByText('SELL')).toBeInTheDocument()
    expect(screen.getByText('P/L')).toBeInTheDocument()
    expect(screen.getByText('Profit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'THB' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Source: Frankfurter · 2026-08-17')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'USD' }))
    expect(onDisplayCurrencyChange).toHaveBeenCalledWith('USD')
  })

  it('shows negative totals with loss semantics and the minus sign', () => {
    render(
      <Summary
        displayCurrency="USD"
        exchangeRate={{
          base: 'USD',
          quote: 'THB',
          rate: '35.50',
          providerDate: '2026-08-17',
          stale: true,
        }}
        onDisplayCurrencyChange={vi.fn()}
        totals={{
          totalBuyTHB: '2800.00',
          totalSellTHB: '1000.00',
          profitLossTHB: '-1800.00',
          totalBuyUSD: '78.87',
          totalSellUSD: '28.17',
          profitLossUSD: '-50.70',
          profitLossStatus: 'loss',
        }}
      />,
    )

    expect(screen.getByText('Loss')).toBeInTheDocument()
    expect(screen.getByText('-$50.70')).toBeInTheDocument()
    expect(screen.getByText(/Cached rate/)).toBeInTheDocument()
  })
})
