/**
 * Event transformation: customize notification content using templates.
 */

import type { TransformRule } from './types.js'

/**
 * Apply transform rule to an item, producing formatted content.
 * Returns null to use default formatting.
 */
export function applyTransform(item: Record<string, unknown>, rule?: TransformRule): string | null {
  if (!rule) return null

  // Template-based transform: "{{title}} by {{author}}"
  if (rule.template) {
    return rule.template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
      const value = getNestedValue(item, path)
      return value !== undefined && value !== null ? String(value) : ''
    }).trim()
  }

  // Fields-based transform: pick specific fields
  if (rule.fields && rule.fields.length > 0) {
    const parts: string[] = []
    for (const field of rule.fields) {
      const value = getNestedValue(item, field)
      if (value !== undefined && value !== null) {
        parts.push(`${field}: ${String(value)}`)
      }
    }
    return parts.join('\n') || null
  }

  return null
}

/** Get a nested value using dot notation. */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
