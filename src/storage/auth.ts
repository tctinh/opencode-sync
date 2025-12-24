/**
 * Auth storage for GitHub token and encryption passphrase
 * Uses file-based storage with encryption
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { paths, ensureSyncDir } from "../utils/paths.js";
import { encrypt, decrypt, type EncryptedData } from "../core/crypto.js";

/**
 * Auth credentials structure
 */
export interface AuthCredentials {
  /** GitHub Personal Access Token */
  githubToken: string;
  /** Encryption passphrase for sync data */
  passphrase: string;
  /** Gist ID for sync storage (set after first push) */
  gistId?: string;
}

/**
 * Stored auth structure (passphrase stored in plaintext, token encrypted with it)
 */
interface StoredAuth {
  /** Encrypted GitHub token */
  encryptedToken: EncryptedData;
  /** Passphrase stored as-is (user must remember it for other devices) */
  passphrase: string;
  /** Gist ID */
  gistId?: string;
  /** Version for migrations */
  version: 1;
}

/**
 * Machine-specific key for additional obfuscation
 */
function getMachineKey(): string {
  // Use a combination of factors for machine-specific key
  const factors = [
    process.env.USER || process.env.USERNAME || "user",
    process.platform,
    process.arch,
    "opencodesync-v1",
  ];
  return factors.join("-");
}

/**
 * Save auth credentials
 */
export function saveAuth(credentials: AuthCredentials): void {
  ensureSyncDir();
  
  // Encrypt the token using the passphrase + machine key
  const encryptionKey = credentials.passphrase + getMachineKey();
  const encryptedToken = encrypt(credentials.githubToken, encryptionKey);
  
  const stored: StoredAuth = {
    encryptedToken,
    passphrase: credentials.passphrase,
    gistId: credentials.gistId,
    version: 1,
  };
  
  writeFileSync(paths.authFile, JSON.stringify(stored, null, 2), "utf8");
}

/**
 * Load auth credentials
 * @returns Credentials if found, null otherwise
 */
export function loadAuth(): AuthCredentials | null {
  if (!existsSync(paths.authFile)) {
    return null;
  }
  
  try {
    const content = readFileSync(paths.authFile, "utf8");
    const stored: StoredAuth = JSON.parse(content);
    
    if (stored.version !== 1) {
      console.warn(`Unknown auth version: ${stored.version}`);
      return null;
    }
    
    // Decrypt the token
    const encryptionKey = stored.passphrase + getMachineKey();
    const githubToken = decrypt(stored.encryptedToken, encryptionKey);
    
    return {
      githubToken,
      passphrase: stored.passphrase,
      gistId: stored.gistId,
    };
  } catch (error) {
    console.warn("Failed to load auth:", error);
    return null;
  }
}

/**
 * Update gist ID in stored auth
 */
export function updateGistId(gistId: string): void {
  const auth = loadAuth();
  if (!auth) {
    throw new Error("No auth credentials found. Run 'opencodesync init' first.");
  }
  
  saveAuth({ ...auth, gistId });
}

/**
 * Check if auth is configured
 */
export function isAuthConfigured(): boolean {
  return existsSync(paths.authFile);
}

/**
 * Clear auth credentials
 */
export function clearAuth(): void {
  if (existsSync(paths.authFile)) {
    unlinkSync(paths.authFile);
  }
}

/**
 * Get just the passphrase (for encryption operations)
 */
export function getPassphrase(): string | null {
  const auth = loadAuth();
  return auth?.passphrase ?? null;
}

/**
 * Get just the GitHub token (for API operations)
 */
export function getGithubToken(): string | null {
  const auth = loadAuth();
  return auth?.githubToken ?? null;
}

/**
 * Get the gist ID (for sync operations)
 */
export function getGistId(): string | null {
  const auth = loadAuth();
  return auth?.gistId ?? null;
}
