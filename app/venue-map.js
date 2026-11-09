(function(root) {
 'use strict';
 const indoorVenues = ['Salt Palace', 'Hyatt Regency'];
 function mapLinks(location) {
  const venue = location?.venue?.trim();
  if (!venue || indoorVenues.includes(venue) || /^(off[ -]?site|tbd|tba|unknown|virtual|online)$/i.test(venue)) return null;
  const query = `${venue}, Salt Lake City, Utah`;
  return {google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, apple: `https://maps.apple.com/?q=${encodeURIComponent(query)}`};
 }
 function resolveDestination(locationId, data) {
  const location = data.locations.find(l => String(l.id) === String(locationId));
  const rooms = location ? data.rooms.filter(r => location.room_ids.includes(r.id)) : [];
  const links = mapLinks(location);
  return {kind: rooms.length ? 'indoor' : links ? 'external' : 'unavailable', venue: location?.venue, location, rooms, links};
 }
 function selectDestination(view, destination, direct = false) {
  if (destination.kind !== 'indoor') return {...view, mode: destination.kind};
  const first = destination.rooms[0];
  const sameFloor = destination.rooms.every(r => r.venue === view.venue && r.floor === Number(view.floor));
  return {mode: direct || sameFloor ? 'top-down' : 'floors', venue: first.venue, floor: first.floor};
 }
 const api = {resolveDestination, selectDestination, mapLinks};
 if (typeof module !== 'undefined' && module.exports) module.exports = api;
 else root.VenueMap = api;
})(typeof window === 'undefined' ? globalThis : window);
