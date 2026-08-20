import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')

function styleBlock(selector) {
  return styles.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('responsive layout styles', () => {
  it('wraps panel headers and keeps the transaction viewport within its parent', () => {
    expect(styleBlock('\\.app-hero')).not.toContain('border-bottom')
    expect(styleBlock('\\.panel-header')).toContain('flex-wrap: wrap')
    expect(styleBlock('\\.transaction-table-wrap')).toContain('max-width: 100%')
  })

  it('uses visible DAY colors for BUY and SELL transaction rows', () => {
    expect(styles).toContain('--buy-row: #d9f2e8')
    expect(styles).toContain('--sell-row: #fde0dc')
  })

  it('defines a mobile breakpoint for full-width controls and a two-column summary', () => {
    expect(styles).toContain('@media (max-width: 720px)')
    expect(styles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.app-hero__side\s*\{[^}]*width: 100%/,
    )
    expect(styles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.summary-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    )
    expect(styles).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.transaction-table tbody tr:last-child td\s*\{[^}]*border-bottom: 1px solid var\(--line\)/,
    )
    expect(styles).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?\.transaction-table tbody tr:last-child td:last-child\s*\{[^}]*border-bottom: 0/,
    )
  })

  it('keeps account identity and sign-in panel inside narrow screens', () => {
    expect(styleBlock('\\.account-email')).toContain('max-width')
    expect(styleBlock('\\.account-email')).toContain('text-overflow: ellipsis')
    expect(styleBlock('\\.sign-in-panel')).toContain('min-width: 0')
  })
})
