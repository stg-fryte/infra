const test = require('node:test');
const assert = require('node:assert/strict');
const {resolveDestination, selectDestination, mapLinks, isUpcoming, offsitePreview} = require('./venue-map');

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

test('events disappear at their end instant while ongoing and future events remain', () => {
 const now = Date.parse('2026-11-09T16:00:00Z'); // 9 AM Mountain Standard Time.
 assert.equal(isUpcoming({ends_at:'2026-11-09T15:59:59Z'},now),false);
 assert.equal(isUpcoming({ends_at:'2026-11-09T16:00:00Z'},now),false);
 assert.equal(isUpcoming({ends_at:'2026-11-09T16:00:01Z'},now),true);
 assert.equal(isUpcoming({ends_at:'2026-11-10T16:00:00Z'},now),true);
 assert.equal(isUpcoming({ends_at:'invalid'},now),false);
});

test('offsite preview uses verified OSM destinations and recognizes the two Meridien labels', () => {
 assert.deepEqual(offsitePreview('Hilton Salt Lake City Center, 255 S West Temple').center,[40.763903,-111.8932573]);
 assert.equal(offsitePreview('Le Méridien SLC Downtown').osm,'node/11032961093');
 assert.equal(offsitePreview('Le Méridien Salt Lake City Downtown, 131 S 300 W').osm,'node/11032961093');
 assert.equal(offsitePreview('Off-site'),null);
 assert.equal(offsitePreview('Unknown hotel'),null);
 assert.equal(offsitePreview('Hyatt Regency'),null);
});

test('PDF coordinates place upper-floor rooms on their own drawing', () => {
 const plans = require('./floor-plans');
 assert.deepEqual(plans.get('Salt Palace', 2).points({name: '250A'}), [[720,814],[745.5,814],[745.5,829.3333333333334],[720,829.3333333333334]]);
 assert.equal(plans.get('Salt Palace', 1).points({name: 'Unmapped room'}), null);
 assert.equal(plans.get('Missing venue', 1), null);
 const hotel = plans.get('Hyatt Regency', 4);
 const points = hotel.points({boundary: {coordinates: [[[-111.8949875,40.7660547],[-111.8942207,40.7651926]]]}});
 assert.deepEqual(points, [[50,446],[363,909]]);
});

test('event selection opens the interactive floor overview, even on the current floor', () => {
 const destination = resolveDestination(2, data);
 assert.deepEqual(destination.rooms.map(r => r.id), [2, 4]);
 assert.equal(selectDestination(current, destination).mode, 'floors');
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

test('rendered schedule opens event details without interpreting event titles as HTML', () => {
 const ui = require('./ui');
 const html = ui.scheduleHtml([{id:42,title:'<img src=x onerror=alert(1)>',date:'2026-11-09',start_time:'09:00',end_time:'10:00',venue:'Salt Palace',room:'151'}]);
 assert.match(html, /href="\/map\?event=42"/);
 assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(!html.includes('<img src=x'));
 assert.match(html, /href="\/bingo\/42"/);
});
