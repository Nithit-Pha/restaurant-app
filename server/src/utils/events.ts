import { EventEmitter } from 'events';

/**
 * Live updates for staff screens (floor view, kitchen, orders), sent over
 * Server-Sent Events by /api/events. Events only say *what* changed; the
 * screens then reload that data through the normal API, so nothing secret
 * travels here and a missed event is fixed by the next reload.
 * In-process: fine for one restaurant on one server.
 */
export type LiveEvent =
  | { type: 'order'; orderId: string; tableId?: string | null }
  | { type: 'table'; tableId: string | null }
  | { type: 'floor' }
  | { type: 'stock' }; // quantities changed: stock page, low-stock count, sold-out dishes

const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per connected staff screen

export function publish(event: LiveEvent): void {
  bus.emit('event', event);
}

export function subscribe(listener: (event: LiveEvent) => void): () => void {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}
