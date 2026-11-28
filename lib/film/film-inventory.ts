import type { FilmData } from '@gravllift/halo-helpers/film-data';
import type {
  InventorySnapshot,
  SlotAmmo,
} from '@gravllift/halo-helpers/film-types';
import {
  WEAPON_FAMILY_NAMES,
  isGrenadeFamily,
  EQUIPMENT_TAG_NAMES as equipmentNames,
} from '@gravllift/halo-film-ui/film/core/weapon-catalog';
import { eventOfType, field, items, number, tagNumber } from './film-json';

interface InventoryLife {
  playerId: number;
  slot: number;
  startMs: number;
  endMs: number;
}

interface InventoryChange {
  timeMs: number;
  weaponSlot?: number;
  family?: number;
  drawnSlot?: number;
  ammo?: Partial<SlotAmmo>;
  grenades?: number[];
  equipment?: string;
}

export function projectInventories(
  data: Pick<FilmData, 'events' | 'states'>,
  lives: readonly InventoryLife[],
): InventorySnapshot[] {
  const changes = new Map<number, InventoryChange[]>();
  const add = (player: number | undefined, change: InventoryChange) => {
    if (player === undefined) return;
    const own = changes.get(player) ?? [];
    own.push(change);
    changes.set(player, own);
  };
  for (const timed of data.events) {
    const tick = number(field(timed, 'tick'));
    if (tick === undefined) continue;
    const timeMs = (tick * 1000) / 60;
    const event = field(timed, 'event');
    for (const kind of ['shot', 'pickup']) {
      const value = eventOfType(event, kind);
      const tag = tagNumber(field(value, kind === 'shot' ? 'weapon' : 'item'));
      if (tag === undefined) continue;
      const player = number(field(value, 'player'));
      if (WEAPON_FAMILY_NAMES.has(tag) && !isGrenadeFamily(tag)) {
        add(player, {
          timeMs,
          family: tag,
          weaponSlot:
            kind === 'pickup' ? number(field(value, 'slot')) : undefined,
        });
      } else if (kind === 'pickup' && equipmentNames.has(tag)) {
        add(player, { timeMs, equipment: equipmentNames.get(tag) });
      }
    }
    const action = eventOfType(event, 'action');
    const drawnSlot = number(
      field(field(field(action, 'kind'), 'weapon_switch'), 'slot'),
    );
    if (drawnSlot !== undefined)
      add(number(field(action, 'player')), { timeMs, drawnSlot });
  }
  for (const entry of data.states) {
    if (typeof entry.playerId !== 'number') continue;
    for (const kind of ['ammo', 'energy', 'heat', 'grenades']) {
      for (const value of items(field(entry.state, kind))) {
        const tick = number(field(value, 'tick'));
        if (tick === undefined) continue;
        const timeMs = (tick * 1000) / 60;
        if (kind === 'grenades') {
          const counts = items(field(value, 'counts')).flatMap((count) =>
            typeof count === 'number' && Number.isInteger(count) && count >= 0
              ? [count]
              : [],
          );
          if (counts.length === 4)
            add(entry.playerId, { timeMs, grenades: counts });
          continue;
        }
        const weaponSlot = number(field(value, 'slot'));
        if (
          weaponSlot === undefined ||
          !Number.isInteger(weaponSlot) ||
          weaponSlot < 0 ||
          weaponSlot > 3
        )
          continue;
        if (kind === 'ammo') {
          const loaded = number(field(value, 'loaded'));
          const reserve = number(field(value, 'reserve'));
          add(entry.playerId, {
            timeMs,
            weaponSlot,
            ammo: {
              mag: loaded !== undefined && loaded >= 0 ? loaded : undefined,
              reserve:
                reserve !== undefined && reserve >= 0 ? reserve : undefined,
            },
          });
        } else if (kind === 'energy') {
          const percent = number(field(value, 'percent'));
          if (percent !== undefined && percent >= 0)
            add(entry.playerId, {
              timeMs,
              weaponSlot,
              ammo: { gauge: 1 - Math.min(percent, 100) / 100, mag: undefined },
            });
        } else {
          add(entry.playerId, {
            timeMs,
            weaponSlot,
            ammo: {
              overheat: number(field(value, 'percent')) ?? 0,
              flags: number(field(value, 'flags')) ?? 0,
            },
          });
        }
      }
    }
  }
  for (const own of changes.values())
    own.sort((first, second) => first.timeMs - second.timeMs);
  const snapshots = new Map<string, InventorySnapshot>();
  for (const life of lives) {
    const own = changes.get(life.playerId) ?? [];
    const weapons = new Map<number, number>();
    const ammo = new Map<number, SlotAmmo>();
    let grenades: number[] | undefined;
    let equipment: string | undefined;
    let drawnSlot = 0;
    const apply = (change: InventoryChange, live: boolean) => {
      if (change.grenades) grenades = change.grenades;
      if (change.ammo && change.weaponSlot !== undefined) {
        ammo.set(change.weaponSlot, {
          flags: 0,
          overheat: 0,
          ...ammo.get(change.weaponSlot),
          ...change.ammo,
        });
      }
      if (!live) return;
      if (change.equipment !== undefined) equipment = change.equipment;
      if (change.drawnSlot !== undefined && change.drawnSlot <= 1)
        drawnSlot = change.drawnSlot;
      if (change.family !== undefined) {
        const knownSlot = [...weapons].find(
          ([, family]) => family === change.family,
        )?.[0];
        const slot =
          change.weaponSlot !== undefined && change.weaponSlot <= 1
            ? change.weaponSlot
            : (knownSlot ?? drawnSlot);
        if (slot < 0 || slot > 1) return;
        if (
          change.weaponSlot !== undefined &&
          knownSlot !== undefined &&
          knownSlot !== slot
        )
          weapons.delete(knownSlot);
        if (
          change.weaponSlot !== undefined &&
          weapons.get(slot) !== change.family
        )
          ammo.delete(slot);
        weapons.set(slot, change.family);
        drawnSlot = slot;
      }
    };
    const save = (timeMs: number) => {
      if (weapons.size === 0 && ammo.size === 0 && !grenades && !equipment)
        return;
      const selected = ammo.get(drawnSlot);
      snapshots.set(`${life.slot}:${timeMs}`, {
        timeMs,
        slot: life.slot,
        drawnSlot,
        weapons: Array.from(
          { length: Math.max(-1, ...weapons.keys()) + 1 },
          (_, slot) => weapons.get(slot) ?? 0,
        ),
        ammo: Array.from(
          { length: Math.max(-1, ...ammo.keys()) + 1 },
          (_, slot) => ({ flags: 0, overheat: 0, ...ammo.get(slot) }),
        ),
        ammoKnown: selected?.mag !== undefined || selected?.gauge !== undefined,
        grenades: grenades?.slice(),
        equipment,
      });
    };
    for (const change of own) {
      if (change.timeMs >= life.startMs) break;
      apply(change, false);
    }
    save(life.startMs - 0.001);
    for (const change of own) {
      if (change.timeMs < life.startMs) continue;
      if (change.timeMs > life.endMs) break;
      apply(change, true);
      save(change.timeMs);
    }
  }
  return [...snapshots.values()].sort(
    (first, second) => first.timeMs - second.timeMs,
  );
}
