import { describe, it, expect } from 'vitest'
import { applyTransform } from './transform.js'

describe('applyTransform', () => {
  const item = {
    title: 'New Release',
    author: 'alice',
    url: 'https://example.com',
    score: 42,
    nested: { tag: 'important' },
  }

  it('returns null when no rule', () => {
    expect(applyTransform(item)).toBeNull()
  })

  it('returns null when rule has no template or fields', () => {
    expect(applyTransform(item, {})).toBeNull()
  })

  it('template: replaces {{field}} placeholders', () => {
    const result = applyTransform(item, { template: '{{title}} by {{author}}' })
    expect(result).toBe('New Release by alice')
  })

  it('template: handles missing fields as empty string', () => {
    const result = applyTransform(item, { template: '{{title}} - {{missing}}' })
    expect(result).toBe('New Release -')
  })

  it('template: supports nested fields', () => {
    const result = applyTransform(item, { template: '[{{nested.tag}}] {{title}}' })
    expect(result).toBe('[important] New Release')
  })

  it('fields: picks specific fields', () => {
    const result = applyTransform(item, { fields: ['title', 'url'] })
    expect(result).toBe('title: New Release\nurl: https://example.com')
  })

  it('fields: skips missing fields', () => {
    const result = applyTransform(item, { fields: ['title', 'missing'] })
    expect(result).toBe('title: New Release')
  })

  it('fields: returns null if all fields missing', () => {
    const result = applyTransform(item, { fields: ['missing1', 'missing2'] })
    expect(result).toBeNull()
  })
})
