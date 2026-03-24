import { describe, it, expect } from 'vitest'
import { matchesFilter } from './filter.js'
import type { FilterRule } from './types.js'

describe('matchesFilter', () => {
  const item = {
    title: 'Breaking News: AI advances',
    score: 150,
    author: 'john',
    tags: 'tech',
    nested: { level: 3 },
  }

  it('returns true when no rules', () => {
    expect(matchesFilter(item, [])).toBe(true)
  })

  it('contains: matches substring (case-insensitive)', () => {
    expect(matchesFilter(item, [{ field: 'title', op: 'contains', value: 'ai' }])).toBe(true)
    expect(matchesFilter(item, [{ field: 'title', op: 'contains', value: 'crypto' }])).toBe(false)
  })

  it('equals: exact match', () => {
    expect(matchesFilter(item, [{ field: 'author', op: 'equals', value: 'john' }])).toBe(true)
    expect(matchesFilter(item, [{ field: 'author', op: 'equals', value: 'jane' }])).toBe(false)
  })

  it('matches: regex match', () => {
    expect(matchesFilter(item, [{ field: 'title', op: 'matches', value: 'Breaking.*AI' }])).toBe(true)
    expect(matchesFilter(item, [{ field: 'title', op: 'matches', value: '^crypto' }])).toBe(false)
  })

  it('gt / lt: numeric comparison', () => {
    expect(matchesFilter(item, [{ field: 'score', op: 'gt', value: 100 }])).toBe(true)
    expect(matchesFilter(item, [{ field: 'score', op: 'gt', value: 200 }])).toBe(false)
    expect(matchesFilter(item, [{ field: 'score', op: 'lt', value: 200 }])).toBe(true)
  })

  it('exists / not_exists', () => {
    expect(matchesFilter(item, [{ field: 'author', op: 'exists' }])).toBe(true)
    expect(matchesFilter(item, [{ field: 'missing', op: 'exists' }])).toBe(false)
    expect(matchesFilter(item, [{ field: 'missing', op: 'not_exists' }])).toBe(true)
  })

  it('supports nested fields with dot notation', () => {
    expect(matchesFilter(item, [{ field: 'nested.level', op: 'gt', value: 2 }])).toBe(true)
    expect(matchesFilter(item, [{ field: 'nested.level', op: 'gt', value: 5 }])).toBe(false)
  })

  it('AND logic: all rules must match', () => {
    const rules: FilterRule[] = [
      { field: 'score', op: 'gt', value: 100 },
      { field: 'title', op: 'contains', value: 'AI' },
    ]
    expect(matchesFilter(item, rules)).toBe(true)

    const failRules: FilterRule[] = [
      { field: 'score', op: 'gt', value: 100 },
      { field: 'title', op: 'contains', value: 'crypto' },
    ]
    expect(matchesFilter(item, failRules)).toBe(false)
  })

  it('handles invalid regex gracefully', () => {
    expect(matchesFilter(item, [{ field: 'title', op: 'matches', value: '[invalid' }])).toBe(false)
  })
})
