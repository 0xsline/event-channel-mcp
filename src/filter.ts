/**
 * Event filtering: match items against configured filter rules.
 * All rules must match (AND logic).
 */

import type { FilterRule } from './types.js'

/** Check if an item matches all filter rules. */
export function matchesFilter(item: Record<string, unknown>, rules: FilterRule[]): boolean {
  return rules.every(rule => matchesRule(item, rule))
}

function matchesRule(item: Record<string, unknown>, rule: FilterRule): boolean {
  const value = getNestedValue(item, rule.field)

  switch (rule.op) {
    case 'exists':
      return value !== undefined && value !== null

    case 'not_exists':
      return value === undefined || value === null

    case 'equals':
      return String(value) === String(rule.value)

    case 'contains':
      return typeof value === 'string' && typeof rule.value === 'string'
        && value.toLowerCase().includes(rule.value.toLowerCase())

    case 'matches':
      if (typeof value !== 'string' || typeof rule.value !== 'string') return false
      try {
        return new RegExp(rule.value, 'i').test(value)
      } catch {
        return false
      }

    case 'gt':
      return typeof value === 'number' && typeof rule.value === 'number' && value > rule.value

    case 'lt':
      return typeof value === 'number' && typeof rule.value === 'number' && value < rule.value

    default:
      return true
  }
}

/** Get a nested value from an object using dot notation (e.g. "user.name"). */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
