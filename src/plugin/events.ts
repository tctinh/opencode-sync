/**
 * Event hooks for OpenCode integration
 * Listens for session events and provides reminders
 */

/**
 * Event types that can trigger hooks
 */
export type EventType = 
  | "session.compacted"
  | "session.ended"
  | "context.exported"
  | "context.imported";

/**
 * Event payload types
 */
export interface SessionCompactedEvent {
  sessionId: string;
  messageCount: number;
  compactedAt: string;
}

export interface SessionEndedEvent {
  sessionId: string;
  duration: number;
  messageCount: number;
}

export interface ContextExportedEvent {
  contextId: string;
  contextName: string;
  size: number;
}

export interface ContextImportedEvent {
  contextIds: string[];
  contextNames: string[];
}

/**
 * Event handler function type
 */
export type EventHandler<T> = (event: T) => void | Promise<void>;

/**
 * Event registry
 */
const handlers: Map<EventType, EventHandler<unknown>[]> = new Map();

/**
 * Register an event handler
 */
export function on<T>(event: EventType, handler: EventHandler<T>): () => void {
  const eventHandlers = handlers.get(event) || [];
  eventHandlers.push(handler as EventHandler<unknown>);
  handlers.set(event, eventHandlers);
  
  // Return unsubscribe function
  return () => {
    const current = handlers.get(event) || [];
    handlers.set(event, current.filter(h => h !== handler));
  };
}

/**
 * Emit an event
 */
export async function emit<T>(event: EventType, payload: T): Promise<void> {
  const eventHandlers = handlers.get(event) || [];
  
  for (const handler of eventHandlers) {
    try {
      await handler(payload);
    } catch (error) {
      console.error(`Error in event handler for ${event}:`, error);
    }
  }
}

/**
 * Toast notification interface
 */
export interface ToastOptions {
  message: string;
  type: "info" | "success" | "warning" | "error";
  duration?: number;
  action?: {
    label: string;
    callback: () => void;
  };
}

/**
 * Toast notification function (to be provided by OpenCode)
 */
let showToast: ((options: ToastOptions) => void) | null = null;

/**
 * Set the toast notification function
 */
export function setToastHandler(handler: (options: ToastOptions) => void): void {
  showToast = handler;
}

/**
 * Show a toast notification
 */
export function toast(options: ToastOptions): void {
  if (showToast) {
    showToast(options);
  } else {
    // Fallback to console
    console.log(`[${options.type.toUpperCase()}] ${options.message}`);
  }
}

/**
 * Default handler for session compaction
 */
export function handleSessionCompacted(_event: SessionCompactedEvent): void {
  toast({
    message: "Session compacted. Export context for sync?",
    type: "info",
    duration: 10000,
    action: {
      label: "Use /context-export",
      callback: () => {
        // This would trigger the export command in OpenCode
        console.log("Export context triggered");
      },
    },
  });
}

/**
 * Default handler for context export
 */
export function handleContextExported(event: ContextExportedEvent): void {
  toast({
    message: `Context "${event.contextName}" saved. Run 'opencodesync push' to sync.`,
    type: "success",
    duration: 8000,
  });
}

/**
 * Initialize default event handlers
 */
export function initializeEventHandlers(): void {
  on<SessionCompactedEvent>("session.compacted", handleSessionCompacted);
  on<ContextExportedEvent>("context.exported", handleContextExported);
}

/**
 * Create hook configuration for OpenCode plugin
 */
export function createEventHooks() {
  return {
    onSessionCompacted: (callback: EventHandler<SessionCompactedEvent>) => {
      return on("session.compacted", callback);
    },
    onSessionEnded: (callback: EventHandler<SessionEndedEvent>) => {
      return on("session.ended", callback);
    },
    onContextExported: (callback: EventHandler<ContextExportedEvent>) => {
      return on("context.exported", callback);
    },
    onContextImported: (callback: EventHandler<ContextImportedEvent>) => {
      return on("context.imported", callback);
    },
    setToastHandler,
    toast,
    emit,
  };
}
