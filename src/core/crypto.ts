/**
 * AES-256-GCM Encryption for sync data
 * Uses PBKDF2 for key derivation from passphrase
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
} from "node:crypto";

// Crypto constants
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = "sha256";

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  /** Base64-encoded encrypted content */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  tag: string;
  /** Base64-encoded salt for key derivation */
  salt: string;
  /** Version for future compatibility */
  version: 1;
}

/**
 * Derive encryption key from passphrase using PBKDF2
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    PBKDF2_DIGEST
  );
}

/**
 * Encrypt plaintext with passphrase
 * 
 * @param plaintext - Text to encrypt
 * @param passphrase - User's encryption passphrase
 * @returns Encrypted data structure
 */
export function encrypt(plaintext: string, passphrase: string): EncryptedData {
  // Generate random salt and IV
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  
  // Derive key from passphrase
  const key = deriveKey(passphrase, salt);
  
  // Create cipher and encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    salt: salt.toString("base64"),
    version: 1,
  };
}

/**
 * Decrypt encrypted data with passphrase
 * 
 * @param data - Encrypted data structure
 * @param passphrase - User's encryption passphrase
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (wrong passphrase or corrupted data)
 */
export function decrypt(data: EncryptedData, passphrase: string): string {
  // Validate version
  if (data.version !== 1) {
    throw new Error(`Unsupported encryption version: ${data.version}`);
  }
  
  // Decode from base64
  const ciphertext = Buffer.from(data.ciphertext, "base64");
  const iv = Buffer.from(data.iv, "base64");
  const tag = Buffer.from(data.tag, "base64");
  const salt = Buffer.from(data.salt, "base64");
  
  // Derive key from passphrase
  const key = deriveKey(passphrase, salt);
  
  // Create decipher and decrypt
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error("Decryption failed: invalid passphrase or corrupted data");
  }
}

/**
 * Encrypt an object as JSON
 */
export function encryptObject<T>(obj: T, passphrase: string): EncryptedData {
  const json = JSON.stringify(obj);
  return encrypt(json, passphrase);
}

/**
 * Decrypt to an object from JSON
 */
export function decryptObject<T>(data: EncryptedData, passphrase: string): T {
  const json = decrypt(data, passphrase);
  return JSON.parse(json) as T;
}

/**
 * Check if data is encrypted (has the expected structure)
 */
export function isEncrypted(data: unknown): data is EncryptedData {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.ciphertext === "string" &&
    typeof obj.iv === "string" &&
    typeof obj.tag === "string" &&
    typeof obj.salt === "string" &&
    obj.version === 1
  );
}

/**
 * Generate a random passphrase (for suggestions)
 */
export function generatePassphrase(wordCount = 4): string {
  // Simple word list for generating memorable passphrases
  const words = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
    "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
    "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey",
    "xray", "yankee", "zulu", "red", "blue", "green", "black", "white",
    "orange", "purple", "silver", "golden", "cosmic", "thunder", "shadow",
    "crystal", "phoenix", "dragon", "falcon", "tiger", "eagle", "wolf",
  ];
  
  const result: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const index = Math.floor(Math.random() * words.length);
    result.push(words[index]);
  }
  return result.join("-");
}
