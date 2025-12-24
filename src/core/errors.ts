/**
 * Error handling utilities
 * Provides consistent error handling across CLI and plugin
 */

/**
 * Error codes for sync operations
 */
export enum ErrorCode {
  // Auth errors
  AUTH_NOT_CONFIGURED = "AUTH_NOT_CONFIGURED",
  AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN",
  AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED",
  AUTH_MISSING_SCOPE = "AUTH_MISSING_SCOPE",
  
  // Encryption errors
  ENCRYPTION_FAILED = "ENCRYPTION_FAILED",
  DECRYPTION_FAILED = "DECRYPTION_FAILED",
  INVALID_PASSPHRASE = "INVALID_PASSPHRASE",
  
  // Network errors
  NETWORK_ERROR = "NETWORK_ERROR",
  GIST_NOT_FOUND = "GIST_NOT_FOUND",
  GIST_PERMISSION_DENIED = "GIST_PERMISSION_DENIED",
  RATE_LIMITED = "RATE_LIMITED",
  
  // Storage errors
  STORAGE_READ_ERROR = "STORAGE_READ_ERROR",
  STORAGE_WRITE_ERROR = "STORAGE_WRITE_ERROR",
  CONTEXT_NOT_FOUND = "CONTEXT_NOT_FOUND",
  CONTEXT_LIMIT_REACHED = "CONTEXT_LIMIT_REACHED",
  
  // Sync errors
  SYNC_CONFLICT = "SYNC_CONFLICT",
  SYNC_NO_CHANGES = "SYNC_NO_CHANGES",
  SYNC_VERSION_MISMATCH = "SYNC_VERSION_MISMATCH",
  
  // Generic errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Sync error with code and context
 */
export class SyncError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SyncError";
  }
  
  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case ErrorCode.AUTH_NOT_CONFIGURED:
        return "Sync not configured. Run 'opencodesync init' to set up.";
      case ErrorCode.AUTH_INVALID_TOKEN:
        return "Invalid GitHub token. Please run 'opencodesync init' to reconfigure.";
      case ErrorCode.AUTH_TOKEN_EXPIRED:
        return "GitHub token has expired. Please create a new token and run 'opencodesync init'.";
      case ErrorCode.AUTH_MISSING_SCOPE:
        return "GitHub token is missing 'gist' scope. Please create a new token with gist permissions.";
      case ErrorCode.ENCRYPTION_FAILED:
        return "Failed to encrypt data. Please try again.";
      case ErrorCode.DECRYPTION_FAILED:
      case ErrorCode.INVALID_PASSPHRASE:
        return "Decryption failed. Please check your passphrase is correct.";
      case ErrorCode.NETWORK_ERROR:
        return "Network error. Please check your internet connection.";
      case ErrorCode.GIST_NOT_FOUND:
        return "Sync data not found. It may have been deleted or the Gist ID is incorrect.";
      case ErrorCode.GIST_PERMISSION_DENIED:
        return "Permission denied. Please check your GitHub token has gist access.";
      case ErrorCode.RATE_LIMITED:
        return "GitHub API rate limit exceeded. Please try again later.";
      case ErrorCode.STORAGE_READ_ERROR:
        return "Failed to read local data. Please check file permissions.";
      case ErrorCode.STORAGE_WRITE_ERROR:
        return "Failed to write local data. Please check disk space and permissions.";
      case ErrorCode.CONTEXT_NOT_FOUND:
        return "Context not found. Use /context-list to see available contexts.";
      case ErrorCode.CONTEXT_LIMIT_REACHED:
        return "Context limit reached (max 20). Use /context-prune to remove old contexts.";
      case ErrorCode.SYNC_CONFLICT:
        return "Sync conflict detected. Use --force to overwrite or resolve manually.";
      case ErrorCode.SYNC_NO_CHANGES:
        return "No changes to sync.";
      case ErrorCode.SYNC_VERSION_MISMATCH:
        return "Sync data version mismatch. Please update opencodesync.";
      default:
        return this.message || "An unknown error occurred.";
    }
  }
  
  /**
   * Get recovery suggestions
   */
  getRecoverySuggestions(): string[] {
    switch (this.code) {
      case ErrorCode.AUTH_NOT_CONFIGURED:
        return ["Run: opencodesync init"];
      case ErrorCode.AUTH_INVALID_TOKEN:
      case ErrorCode.AUTH_TOKEN_EXPIRED:
      case ErrorCode.AUTH_MISSING_SCOPE:
        return [
          "1. Go to: https://github.com/settings/tokens/new",
          "2. Create a token with 'gist' scope",
          "3. Run: opencodesync init --force",
        ];
      case ErrorCode.INVALID_PASSPHRASE:
        return [
          "Ensure you're using the same passphrase as on your other devices.",
          "If forgotten, you'll need to start fresh with 'opencodesync init --force'",
        ];
      case ErrorCode.NETWORK_ERROR:
        return [
          "Check your internet connection",
          "Try again in a few moments",
        ];
      case ErrorCode.RATE_LIMITED:
        return [
          "Wait a few minutes before trying again",
          "GitHub API limits: 60 requests/hour for unauthenticated, 5000 for authenticated",
        ];
      case ErrorCode.CONTEXT_LIMIT_REACHED:
        return [
          "Delete old contexts: /context-prune <name>",
          "Or delete all: /context-prune --all",
        ];
      case ErrorCode.SYNC_CONFLICT:
        return [
          "Use 'opencodesync pull --force' to overwrite local changes",
          "Or 'opencodesync push --force' to overwrite remote",
        ];
      default:
        return [];
    }
  }
}

/**
 * Wrap a function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: (error: SyncError) => void
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args) as ReturnType<T>;
    } catch (error) {
      const syncError = toSyncError(error);
      
      if (errorHandler) {
        errorHandler(syncError);
      } else {
        console.error(syncError.getUserMessage());
        const suggestions = syncError.getRecoverySuggestions();
        if (suggestions.length > 0) {
          console.log("\nSuggestions:");
          suggestions.forEach(s => console.log(`  ${s}`));
        }
      }
      
      throw syncError;
    }
  }) as T;
}

/**
 * Convert unknown error to SyncError
 */
export function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) {
    return error;
  }
  
  if (error instanceof Error) {
    // Try to detect error type from message
    const message = error.message.toLowerCase();
    
    if (message.includes("enotfound") || message.includes("network")) {
      return new SyncError(ErrorCode.NETWORK_ERROR, error.message);
    }
    if (message.includes("401") || message.includes("unauthorized")) {
      return new SyncError(ErrorCode.AUTH_INVALID_TOKEN, error.message);
    }
    if (message.includes("403") || message.includes("forbidden")) {
      return new SyncError(ErrorCode.GIST_PERMISSION_DENIED, error.message);
    }
    if (message.includes("404") || message.includes("not found")) {
      return new SyncError(ErrorCode.GIST_NOT_FOUND, error.message);
    }
    if (message.includes("rate limit")) {
      return new SyncError(ErrorCode.RATE_LIMITED, error.message);
    }
    if (message.includes("decrypt")) {
      return new SyncError(ErrorCode.DECRYPTION_FAILED, error.message);
    }
    
    return new SyncError(ErrorCode.UNKNOWN_ERROR, error.message);
  }
  
  return new SyncError(ErrorCode.UNKNOWN_ERROR, String(error));
}

/**
 * Format error for CLI display
 */
export function formatError(error: SyncError): string {
  let output = `\n✗ Error: ${error.getUserMessage()}\n`;
  
  const suggestions = error.getRecoverySuggestions();
  if (suggestions.length > 0) {
    output += "\nSuggestions:\n";
    suggestions.forEach(s => {
      output += `  ${s}\n`;
    });
  }
  
  return output;
}
