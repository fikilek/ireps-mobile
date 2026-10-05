import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeviceCaptureTimes } from './deviceCaptureTimes.js';

test('new capture records one instant before upload', () => {
  assert.deepEqual(buildDeviceCaptureTimes({}, '2026-10-05T10:00:00.000Z'), {
    createdOnDevice: '2026-10-05T10:00:00.000Z', updatedOnDevice: '2026-10-05T10:00:00.000Z',
  });
});
test('successive offline draft edits retain original capture and advance only update time', () => {
  const first = buildDeviceCaptureTimes({}, '2026-10-01T10:00:00.000Z');
  const second = buildDeviceCaptureTimes(first, '2026-10-02T11:00:00.000Z');
  const third = buildDeviceCaptureTimes(second, '2026-10-03T12:00:00.000Z');
  assert.equal(third.createdOnDevice, first.createdOnDevice);
  assert.equal(third.updatedOnDevice, '2026-10-03T12:00:00.000Z');
  assert.equal(first.updatedOnDevice, first.createdOnDevice);
});
test('legacy phone metadata retains its recorded capture date on edit', () => {
  const result = buildDeviceCaptureTimes({ createdAt: '2026-10-01T10:00:00.000Z' }, '2026-10-05T10:00:00.000Z');
  assert.equal(result.createdOnDevice, '2026-10-01T10:00:00.000Z');
});
test('explicit device capture wins over legacy metadata', () => {
  const result = buildDeviceCaptureTimes({ createdOnDevice: '2026-10-01T10:00:00.000Z', createdAt: '2026-10-04T10:00:00.000Z' }, '2026-10-05T10:00:00.000Z');
  assert.equal(result.createdOnDevice, '2026-10-01T10:00:00.000Z');
});
