const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveDestination, selectDestination, mapLinks} = require('./venue-map');

const room = (id, venue, floor) => ({id, venue, floor, name: `Room ${id}`});
const data = {
 rooms: [room(1, 'Salt Palace', 1), room(2, 'Salt Palace', 2), room(3, 'Hyatt Regency', 2), room(4, 'Salt Palace', 2)],
 locations: [
  {id: 1, venue: 'Salt Palace', level: 'Level 1', room_ids: [1]},
  {id: 2, venue: 'Salt Palace', level: 'Level 2', room_ids: [2, 4]},
  {id: 3, venue: 'Hyatt Regency', level: 'Level 2', room_ids: [3]},
  {id: 4, venue: 'Salt Palace', room_ids: []},
  {id: 5, venue: 'Hilton Salt Lake City Center, 255 S West Temple', room_ids: []},
  {id: 6, venue: 'Off-site', room_ids: []},
  {id: 7, venue: 'Salt Palace', room_ids: [1, 2]},
 ],
};
const current = {venue: 'Salt Palace', floor: 2};

test('same floor highlights directly and preserves all mapped rooms', () => {
 const destination = resolveDestination(2, data);
 assert.deepEqual(destination.rooms.map(r => r.id), [2, 4]);
 assert.equal(selectDestination(current, destination).mode, 'top-down');
});
test('another floor or venue opens the floor stack without mutating current view', () => {
 assert.equal(selectDestination(current, resolveDestination(1, data)).mode, 'floors');
 assert.equal(selectDestination(current, resolveDestination(3, data)).mode, 'floors');
 assert.deepEqual(current, {venue: 'Salt Palace', floor: 2});
});
test('multi-floor events show a stack; direct location links open their first floor', () => {
 const destination = resolveDestination(7, data);
 assert.equal(selectDestination(current, destination).mode, 'floors');
 assert.deepEqual(selectDestination(current, destination, true), {mode: 'top-down', venue: 'Salt Palace', floor: 1});
});
test('missing indoor mappings and unknown IDs cannot retain an old room highlight', () => {
 for (const id of [4, 999, null]) {
  const destination = resolveDestination(id, data);
  assert.equal(destination.kind, 'unavailable');
  assert.deepEqual(destination.rooms, []);
  assert.equal(selectDestination(current, destination).mode, 'unavailable');
 }
});
test('specific offsite venues get encoded provider links; generic offsite does not', () => {
 const destination = resolveDestination(5, data);
 assert.equal(destination.kind, 'external');
 assert.equal(new URL(destination.links.google).searchParams.get('query'), 'Hilton Salt Lake City Center, 255 S West Temple, Salt Lake City, Utah');
 assert.equal(new URL(destination.links.apple).searchParams.get('q'), 'Hilton Salt Lake City Center, 255 S West Temple, Salt Lake City, Utah');
 assert.deepEqual(mapLinks({venue: 'Off-site'}), null);
 assert.deepEqual(mapLinks({venue: ''}), null);
 assert.deepEqual(mapLinks({venue: 'Salt Palace'}), null);
 assert.equal(resolveDestination(6, data).kind, 'unavailable');
});
