import { EventEmitter } from 'events';

/**
 * In-memory event bus for notifying connected clients of DB changes.
 * Singleton — shared across all API routes within a single Next.js process.
 *
 * Limitations:
 * - Single-process only — will NOT propagate across serverless function instances
 *   or multiple Node.js workers. For multi-instance deployments, replace with
 *   Postgres LISTEN/NOTIFY or an external pub/sub system.
 * - Capped at 100 concurrent listeners (one per open SSE connection / browser tab).
 */
const globalForEvents = globalThis as unknown as { __dbEvents?: EventEmitter };
export const dbEvents = globalForEvents.__dbEvents ??= new EventEmitter();
dbEvents.setMaxListeners(100);
