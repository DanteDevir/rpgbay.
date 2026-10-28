export const SCOPES: readonly string[];
export interface Event {
  id: string;
  origin: string;
  at: number;
  payload: string;
  mac: string;
}
export function signEvent(
  payload: unknown,
  secret: string,
  origin: string,
  options?: { crypto?: Crypto; now?: number },
): Promise<Event>;
export function authenticateEvent(
  event: Event,
  secret: string,
  options?: { crypto?: Crypto; now?: number; seen?: Map<string, number> },
): Promise<unknown>;
export function allowedActorUpdate(
  payload: unknown,
  actor: unknown,
  pairing: unknown,
): Record<string, number>;
