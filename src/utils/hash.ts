/**
 * Content hashing utility for change detection
 * Uses SHA-256 for reliable content comparison
 */

import { createHash } from "node:crypto";

/**
 * Generate SHA-256 hash of content
 */
export function hashContent(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Generate hash of multiple contents combined
 */
export function hashMultiple(contents: (string | Buffer)[]): string {
  const hash = createHash("sha256");
  for (const content of contents) {
    hash.update(content);
    hash.update("\0"); // Separator to prevent collision
  }
  return hash.digest("hex");
}

/**
 * Generate hash of an object (JSON serialized)
 */
export function hashObject(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as object).sort());
  return hashContent(json);
}

/**
 * Compare two hashes for equality
 */
export function hashEquals(hash1: string, hash2: string): boolean {
  // Constant-time comparison to prevent timing attacks
  if (hash1.length !== hash2.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < hash1.length; i++) {
    result |= hash1.charCodeAt(i) ^ hash2.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Truncate a hash for display purposes
 */
export function shortHash(hash: string, length = 8): string {
  return hash.substring(0, length);
}
