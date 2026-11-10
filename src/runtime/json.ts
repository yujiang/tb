import type { DeepReadonly } from '../core/types';

/** Rejects values that JSON would silently discard or change. */
export function assertJson(value: unknown, path = '$', ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return;
  if (typeof value !== 'object' || value === null) throw new Error(`Invalid JSON value at ${path}`);
  if (ancestors.has(value)) throw new Error(`Cyclic JSON at ${path}`);
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    throw new Error(`Non-data object at ${path}`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertJson(value[i], `${path}[${i}]`, ancestors);
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error(`Reserved key at ${path}.${key}`);
      }
      assertJson(item, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function frozen<T>(value: T): DeepReadonly<T> {
  const result = clone(value);
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  };
  freeze(result);
  return result as DeepReadonly<T>;
}

export function canonical(value: unknown): string {
  assertJson(value);
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort((item as Record<string, unknown>)[key])]));
    }
    return item;
  };
  return JSON.stringify(sort(value));
}

/** Non-cryptographic content checksum. Exact canonical data is also checked on restore. */
export function checksum(value: unknown): string {
  const input = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export function integer(value: number, name: string, min = Number.MIN_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${name} must be a safe integer >= ${min}`);
}

export function identifier(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a nonempty string`);
}

export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
