import { describe, expect, it } from 'vitest'

describe('frontend test harness', () => {
  it('loads the configured DOM environment', () => {
    const element = document.createElement('div')
    document.body.append(element)
    expect(element).toBeInTheDocument()
  })
})
