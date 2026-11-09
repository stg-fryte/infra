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

test('schedule shows Bingo link only when the session has the bingo game', () => {
 const ui = require('./ui');
 const event = {id:42,title:'Talk',starts_at:'2026-11-09T16:00:00Z',ends_at:'2026-11-09T17:00:00Z',games:['bingo']};
 assert.match(ui.scheduleHtml([event]), /href="\/bingo\/42"/);
 const without = ui.scheduleHtml([{...event,games:[]}]);
 assert.ok(!without.includes('/bingo/'));
 assert.ok(without.includes('data-save'));
});

test('South Entrance is a named point on the first floor, without a made-up room boundary', () => {
 const plans = require('./floor-plans');
 const entrance = {id:99,venue:'Salt Palace',floor:1,name:'South Entrance',boundary:{type:'Point',coordinates:[-111.89597777568913,40.76749822983771]}};
 const destination = resolveDestination(1, {...data,rooms:[...data.rooms,entrance]}, [99]);
 assert.equal(destination.kind,'indoor');
 assert.deepEqual(selectDestination(current,destination),{mode:'floors',venue:'Salt Palace',floor:1});
 const plan = plans.get('Salt Palace',1);
 const [point] = plan.points(entrance);
 assert.ok(Math.abs(point[0]-486.343) < .001);
 assert.ok(Math.abs(point[1]-698.09) < .01);
 assert.equal(plans.get('Salt Palace',2).points(entrance),null);
 const svg = plans.svg(plan,[entrance]);
 assert.ok(svg.includes('<circle '));
 assert.ok(!svg.includes('fill-opacity=".5"'));
});

test('event room assignments override shared location rooms, including an empty assignment', () => {
 assert.deepEqual(resolveDestination(2, data, [4]).rooms.map(r => r.id), [4]);
 assert.deepEqual(resolveDestination(2, data, [2]).rooms.map(r => r.id), [2]);
 assert.equal(resolveDestination(2, data, []).kind, 'unavailable');
 assert.deepEqual(resolveDestination(2, data).rooms.map(r => r.id), [2, 4]);
});

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
 const html = ui.scheduleHtml([{id:42,title:'<img src=x onerror=alert(1)>',date:'2026-11-09',start_time:'09:00',end_time:'10:00',starts_at:'2026-11-09T16:00:00Z',ends_at:'2026-11-09T17:00:00Z',venue:'Salt Palace',room:'151',games:['bingo']}],Date.parse('2026-11-09T16:00:00Z'));
 assert.match(html, /href="\/map\?event=42"/);
 assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert.ok(!html.includes('<img src=x'));
 assert.match(html, /href="\/bingo\/42"/);
 assert.ok(html.includes('session-bingo-action'));
});

test('rendered schedule hides bingo links for sessions without the bingo game', () => {
 const html = require('./ui').scheduleHtml([{id:43,title:'Plain talk',date:'2026-11-09',start_time:'09:00',end_time:'10:00',venue:'Salt Palace',room:'151',games:[]}]);
 assert.ok(!html.includes('/bingo/43'));
 assert.ok(html.includes('data-save'));
});

test('room mapping links open the event assignment rather than its shared location', () => {
 const html = require('./ui').roomMappings([{id:42,location_id:2,title:'Talk',day:'Monday',time:'09:00 AM',location:'Salt Palace | Level 2',resolved_rooms:'250A'}], {team:'test',version:'test',user:{username:'test'}});
 assert.match(html, /href="\/map\?event=42"/);
 assert.ok(!html.includes('/map?location=2'));
});
test('new outdoor destinations use organizer map coordinates and name their precision', () => {
 assert.deepEqual(offsitePreview('Edison House, 335 S 200 W').center,[40.7617511,-111.8963346]);
 const lobby = resolveDestination(20,{rooms:[],locations:[{id:20,venue:'Hyatt Regency Lobby',room_ids:[]}]});
 assert.equal(lobby.kind,'external');
 assert.deepEqual(lobby.preview.center,[40.7656411,-111.8943473]);
 assert.match(lobby.preview.label,/building pin/i);
 assert.match(lobby.preview.label,/lobby/i);
 assert.equal(offsitePreview('Hyatt Regency'),null);
});

test('foyer and mezzanine area pins stay on their own floor drawings', () => {
 const plans = require('./floor-plans');
 const foyer = {venue:'Salt Palace',floor:1,name:'North Grand Ballroom Foyer',boundary:{type:'Point',coordinates:[-111.895,40.767]}};
 const mezzanine = {...foyer,floor:2,name:'Upper Mezzanine'};
 assert.deepEqual(plans.get('Salt Palace',1).points(foyer),[[395,850]]);
 assert.deepEqual(plans.get('Salt Palace',2).points(mezzanine),[[911,480]]);
 assert.equal(plans.get('Salt Palace',1).points(mezzanine),null);
 assert.equal(plans.get('Salt Palace',2).points(foyer),null);
 assert.ok(plans.svg(plans.get('Salt Palace',2),[mezzanine]).includes('<circle '));
});
