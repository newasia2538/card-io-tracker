import { describe, expect, it } from 'vitest'

import {
  getDefaultCurrency,
  getProfitLossStatus,
  summarizeTransactions,
  toThb,
} from './currency'
import type { TransactionRecord } from '../types'

describe('getDefaultCurrency', () => {
  it('defaults Thai locales to THB', () => {
    expect(getDefaultCurrency('th-TH')).toBe('THB')
  })

  it('defaults non-Thai locales to USD', () => {
    expect(getDefaultCurrency('en-US')).toBe('USD')
  })
})

describe('toThb', () => {
  it('converts USD amounts using exact decimal math', () => {
    expect(toThb('100.00', 'USD', '35.50')).toBe('3550.00')
  })
})

describe('summarizeTransactions', () => {
  const transactions: TransactionRecord[] = [
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
      transactionDate: '2026-08-10',
      createdAt: '2026-08-10T10:00:00Z',
      updatedAt: '2026-08-10T10:00:00Z',
    },
    {
      id: 'buy-2',
      userId: 'user-1',
      action: 'BUY',
      cardType: 'Pokemon card',
      customCardType: null,
      price: '50.00',
      currency: 'USD',
      priceThb: '1800.00',
      exchangeRateToThb: '36.00',
      exchangeRateDate: '2026-08-17',
      transactionDate: '2026-08-12',
      createdAt: '2026-08-12T10:00:00Z',
      updatedAt: '2026-08-12T10:00:00Z',
    },
    {
      id: 'sell-1',
      userId: 'user-1',
      action: 'SELL',
      cardType: 'One Piece Card',
      customCardType: null,
      price: '100.00',
      currency: 'USD',
      priceThb: '4000.00',
      exchangeRateToThb: '40.00',
      exchangeRateDate: '2026-08-17',
      transactionDate: '2026-08-15',
      createdAt: '2026-08-15T10:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z',
    },
  ]

  it('aggregates totals in THB and USD from canonical THB values', () => {
    expect(summarizeTransactions(transactions, '40.00')).toEqual({
      totalBuyTHB: '2800.00',
      totalSellTHB: '4000.00',
      profitLossTHB: '1200.00',
      totalBuyUSD: '70.00',
      totalSellUSD: '100.00',
      profitLossUSD: '30.00',
      profitLossStatus: 'profit',
    })
  })
})

describe('getProfitLossStatus', () => {
  it('marks positive P/L as profit', () => {
    expect(getProfitLossStatus('0.01')).toBe('profit')
  })

  it('marks negative P/L as loss', () => {
    expect(getProfitLossStatus('-0.01')).toBe('loss')
  })

  it('marks zero P/L as neutral', () => {
    expect(getProfitLossStatus('0.00')).toBe('neutral')
  })
})
