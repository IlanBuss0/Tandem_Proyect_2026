import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarEventsFromConfigs, parseEmotionsFromConfigs } from '../src/modules/usage/config-parsing.js';

test('parseCalendarEventsFromConfigs: ignora claves que no son de calendario', () => {
  const configs = [{ clave: 'routines.mi-dia', valor: '{}' }, { clave: 'emotion:2026-08-01T00:00:00.000Z', valor: '{}' }];
  assert.deepEqual(parseCalendarEventsFromConfigs(configs), []);
});

test('parseCalendarEventsFromConfigs: extrae fecha y tipo de un evento valido', () => {
  const configs = [{ id: 9, clave: 'calendar.event:ce-1', valor: JSON.stringify({ id: 'ce-1', date: '2026-08-01', type: 'medico', title: 'Turno' }) }];
  const events = parseCalendarEventsFromConfigs(configs);
  assert.deepEqual(events, [{ id: 'ce-1', date: '2026-08-01', type: 'medico' }]);
});

test('parseCalendarEventsFromConfigs: ignora JSON invalido sin romper', () => {
  const configs = [{ clave: 'calendar.event:bad', valor: '{not json' }];
  assert.deepEqual(parseCalendarEventsFromConfigs(configs), []);
});

test('parseCalendarEventsFromConfigs: lee tambien el formato bulk legacy calendar.events', () => {
  const configs = [{
    id: 11,
    clave: 'calendar.events',
    valor: JSON.stringify([
      { id: 'ce-1', date: '2026-08-01', type: 'medico' },
      { id: 'ce-2', date: '2026-08-02', type: 'escuela' },
    ]),
  }];
  const events = parseCalendarEventsFromConfigs(configs);
  assert.deepEqual(events, [
    { id: 'ce-1', date: '2026-08-01', type: 'medico' },
    { id: 'ce-2', date: '2026-08-02', type: 'escuela' },
  ]);
});

test('parseCalendarEventsFromConfigs: combina bulk legacy y filas individuales sin duplicar', () => {
  const configs = [
    { id: 11, clave: 'calendar.events', valor: JSON.stringify([{ id: 'ce-1', date: '2026-08-01', type: 'medico' }]) },
    { id: 23, clave: 'calendar.event:ce-2', valor: JSON.stringify({ id: 'ce-2', date: '2026-08-02', type: 'escuela' }) },
  ];
  const events = parseCalendarEventsFromConfigs(configs);
  assert.equal(events.length, 2);
  assert.ok(events.some((e) => e.id === 'ce-1'));
  assert.ok(events.some((e) => e.id === 'ce-2'));
});

test('parseCalendarEventsFromConfigs: bulk legacy con JSON invalido no rompe el resto', () => {
  const configs = [
    { clave: 'calendar.events', valor: '{not an array' },
    { clave: 'calendar.event:ce-2', valor: JSON.stringify({ id: 'ce-2', date: '2026-08-02', type: 'escuela' }) },
  ];
  const events = parseCalendarEventsFromConfigs(configs);
  assert.deepEqual(events, [{ id: 'ce-2', date: '2026-08-02', type: 'escuela' }]);
});

test('parseEmotionsFromConfigs: extrae fecha y emocion', () => {
  const configs = [{ clave: 'emotion:2026-08-01T10:00:00.000Z', valor: JSON.stringify({ emotion: 'Ansioso', date: '2026-08-01' }) }];
  assert.deepEqual(parseEmotionsFromConfigs(configs), [{ date: '2026-08-01', emotion: 'Ansioso' }]);
});

test('parseEmotionsFromConfigs: ignora filas sin emocion o sin fecha', () => {
  const configs = [{ clave: 'emotion:x', valor: JSON.stringify({ date: '2026-08-01' }) }];
  assert.deepEqual(parseEmotionsFromConfigs(configs), []);
});
