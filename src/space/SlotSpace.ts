import { identifier, integer } from '../runtime/json';

export class SlotSpace {
  static validate(positions: readonly { side: string; slot: number }[]): void {
    const used = new Set<string>();
    for (const position of positions) {
      identifier(position.side, 'position.side');
      integer(position.slot, 'position.slot', 0);
      const key = JSON.stringify([position.side, position.slot]);
      if (used.has(key)) throw new Error(`Occupied position: ${key}`);
      used.add(key);
    }
  }
}
