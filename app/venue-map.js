(function(root) {
 'use strict';
 const indoorVenues = ['Salt Palace', 'Hyatt Regency'];
 function isUpcoming(event, now = Date.now()) {
  return new Date(event.ends_at).getTime() > now;
 }
 function isLive(event, now = Date.now()) {
  return new Date(event.starts_at).getTime() <= now && isUpcoming(event, now);
 }
 // Verified against OSM/Nominatim on 2026-11-09. Keep the source element for
 // auditing; requests during browsing use tiles only, not a public geocoder.
 const externalVenues = {
  // Coordinates are the destination (!3d/!4d), not the camera center, in the
  // official schedule's Location Map links (Sessionize 1340051 and 1368973).
  'Edison House': {center:[40.7617511,-111.8963346],label:'Edison House · venue pin'},
  'Hyatt Regency Lobby': {center:[40.7656411,-111.8943473],label:'Hyatt Regency · building pin; meet inside the lobby',meetingPoint:true},
  'Hilton Salt Lake City Center': {center:[40.763903,-111.8932573],osm:'way/33192533'},
  'Kimpton Monaco SLC': {center:[40.7646563,-111.8919453],osm:'way/172543265'},
  'Clark Planetarium': {center:[40.7667062,-111.9031435],osm:'node/11141711596'},
  'Gallivan Center': {center:[40.7643877,-111.8895884],osm:'way/33193654',zoom:17},
  'Le Méridien Salt Lake City Downtown': {center:[40.7662663,-111.8992743],osm:'node/11032961093'},
  'Salt Lake Marriott Downtown at City Creek': {center:[40.7677399,-111.8931314],osm:'way/31553521'},
  'AC Hotel Salt Lake City Downtown': {center:[40.7646578,-111.8973864],osm:'way/638610273'},
 };
 function offsitePreview(venue) {
  const name = venue?.split(',')[0].trim();
  const key = name === 'Le Méridien SLC Downtown' ? 'Le Méridien Salt Lake City Downtown' : name;
  return Object.hasOwn(externalVenues,key) ? externalVenues[key] : null;
 }
 function mapLinks(location) {
  const venue = location?.venue?.trim();
  if (!venue || indoorVenues.includes(venue) || /^(off[ -]?site|tbd|tba|unknown|virtual|online)$/i.test(venue)) return null;
  const query = `${venue}, Salt Lake City, Utah`;
  return {google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, apple: `https://maps.apple.com/?q=${encodeURIComponent(query)}`};
 }
 function resolveDestination(locationId, data, roomIds) {
  const location = data.locations.find(l => String(l.id) === String(locationId));
  const rooms = location ? data.rooms.filter(r => (roomIds ?? location.room_ids).includes(r.id)) : [];
  const links = mapLinks(location);
  return {kind: rooms.length ? 'indoor' : links ? 'external' : 'unavailable', venue: location?.venue, location, rooms, links, preview:offsitePreview(location?.venue)};
 }
 function selectDestination(view, destination, direct = false) {
  if (destination.kind !== 'indoor') return {...view, mode: destination.kind};
  const first = destination.rooms[0];
  return {mode: direct ? 'top-down' : 'floors', venue: first.venue, floor: first.floor};
 }
 function mount(data) {
  data.events = data.events.filter(event=>isUpcoming(event));
  const byId = id => document.getElementById(id);
  const plans = root.FloorPlans || {get:()=>null, floors:venue=>venue === 'Salt Palace' ? [1,2,3] : [2,3,4,5,6]};
  const mapElement = byId('map');
  const stack = byId('floor-stack');
  const status = byId('map-status');
  const venuePicker = byId('venue');
  const floorPicker = byId('floor');
  const eventPicker = byId('map-event');
  const detail = byId('event-details');
  const storageKey = `venue-view:${data.username || ''}`;
  let view = {venue:'Salt Palace', floor:1};
  try {
   const saved = JSON.parse(sessionStorage.getItem(storageKey));
   if (saved && plans.get(saved.venue, saved.floor)) view = {venue:saved.venue, floor:Number(saved.floor)};
  } catch {}
  let destination = {kind:'unavailable',rooms:[]};
  let selectedEvent = null;
  let renderId = 0;
  let imageUrl;
  let offsiteMap = null;
  const map = root.L ? root.L.map(mapElement, {crs:root.L.CRS.Simple, minZoom:-3, maxZoom:3, attributionControl:false}) : null;
  const layers = map ? root.L.layerGroup().addTo(map) : null;
  const create = (tag, text, className) => {
   const el = document.createElement(tag);
   if (text != null) el.textContent = text;
   if (className) el.className = className;
   return el;
  };
  function rememberView() {try {sessionStorage.setItem(storageKey, JSON.stringify(view));} catch {}}
  function setContext(venue, floor, overview = false) {
   venuePicker.value = venue;
   floorPicker.replaceChildren(...plans.floors(venue).map(n=>new Option(`Level ${n}`,n)));
   if (overview) floorPicker.prepend(new Option('Choose a floor',''));
   floorPicker.value = overview ? '' : floor;
   byId('map-context-venue').textContent = venue;
   byId('map-context-floor').textContent = overview ? 'Floor overview' : `Level ${floor}`;
   byId('map-venue-heading').textContent = venue;
  }
  function clearSurface() {
   ++renderId;
   layers?.clearLayers();
   if (offsiteMap) {offsiteMap.remove(); offsiteMap = null;}
   byId('fit').disabled = true;
   if (imageUrl) {URL.revokeObjectURL(imageUrl); imageUrl = null;}
   stack.replaceChildren();
   stack.hidden = true;
   mapElement.hidden = true;
   byId('map-empty').hidden = true;
   status.textContent = '';
  }
  function showFloor(venue, floor, fitSelection = true) {
   clearSurface();
   const plan = plans.get(venue, floor);
   if (!plan) return showUnavailable('Floor plan unavailable.');
   if (!map) return showUnavailable('The interactive map could not load. Refresh to try again; your event details are still available.');
   view = {venue, floor:Number(floor)};
   rememberView();
   setContext(venue, floor);
   mapElement.hidden = false;
   byId('fit').disabled = false;
   map.invalidateSize();
   const [left,top,width,height] = plan.box;
   const bounds = [[0,0],[height,width]];
   imageUrl = URL.createObjectURL(new Blob([plans.svg(plan)], {type:'image/svg+xml'}));
   const image = root.L.imageOverlay(imageUrl, bounds).addTo(layers);
   const thisRender = renderId;
   image.on('error', () => {if (thisRender === renderId) status.textContent = 'The floor drawing could not load. Select another floor or try again.';});
   const rooms = destination.rooms.filter(r=>r.venue===venue && r.floor===Number(floor));
   const selectedBounds = root.L.latLngBounds([]);
   let missing = 0;
   for (const room of rooms) {
    const points = plan.points(room);
    if (!points) {missing++; continue;}
    const positions = points.map(([x,y])=>[height-(y-top),x-left]);
    const pin = room.boundary?.type === 'Point';
    const shape = (pin
     ? root.L.circleMarker(positions[0], {radius:9,color:'#6935b3',fillColor:'#a77bda',fillOpacity:1,weight:3})
     : root.L.polygon(positions, {color:'#6935b3', fillColor:'#a77bda',fillOpacity:.5,weight:2.5})).addTo(layers);
    shape.bindTooltip(create('span',room.name), {permanent:pin, direction:'top'});
    if (pin) selectedBounds.extend(positions[0]); else selectedBounds.extend(shape.getBounds());
   }
   map.fitBounds(fitSelection && selectedBounds.isValid() ? selectedBounds.pad(.65) : bounds, {padding:[35,35],maxZoom:1.5,animate:false});
   byId('fit').onclick = () => map.fitBounds(bounds,{padding:[25,25],animate:false});
   const otherFloor = destination.kind === 'indoor' && !rooms.length;
   status.textContent = missing ? 'Some rooms do not have a drawing position yet.' : otherFloor ? 'Your selected event is on another floor. Use Show event location to return.' : rooms.length ? `${rooms.map(r=>r.name).join(', ')} highlighted · Level ${floor}` : 'Choose an event to highlight its room.';
  }
  function showStack(venue) {
   if (!root.FloorPlans) return showUnavailable('The floor drawings could not load. Refresh to try again; your event details are still available.');
   clearSurface();
   stack.hidden = false;
   setContext(venue, destination.rooms.find(r=>r.venue===venue)?.floor || plans.floors(venue)[0], true);
   status.textContent = 'Select a floor to open its plan from above.';
   for (const floor of plans.floors(venue).slice().reverse()) {
    const plan = plans.get(venue,floor);
    const rooms = destination.rooms.filter(r=>r.venue===venue && r.floor===floor);
    const button = create('button',null,`floor-layer${rooms.length ? ' destination-floor' : ''}`);
    button.type = 'button';
    button.setAttribute('aria-label',`Open ${venue} level ${floor}${rooms.length ? `, ${rooms.map(r=>r.name).join(', ')}` : ''}`);
    const image = create('img');
    image.alt = '';
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(plans.svg(plan,rooms))}`;
    button.append(image, create('span',`Level ${floor}${rooms.length ? ' · Your event' : ''}`,'floor-label'));
    button.addEventListener('click',()=>{showFloor(venue,floor); floorPicker.focus({preventScroll:true});});
    stack.append(button);
   }
  }
  function showUnavailable(message) {
   clearSurface();
   const empty = byId('map-empty');
   empty.hidden = false;
   empty.replaceChildren(create('h2',destination.preview?.meetingPoint ? 'Meeting point' : destination.kind === 'external' ? 'Beyond the venue' : 'Location details unavailable'),create('p',message));
   byId('map-context-venue').textContent = destination.venue || 'Location unavailable';
   byId('map-venue-heading').textContent = destination.venue || view.venue;
   byId('map-context-floor').textContent = destination.preview?.meetingPoint ? 'Meeting point' : destination.kind === 'external' ? 'Off-site' : 'No mapped room';
   if (destination.kind === 'external' && destination.preview && root.L) {
    const preview = create('div'); preview.id = 'offsite-preview'; preview.setAttribute('aria-label',`OpenStreetMap preview of ${destination.venue}`); empty.append(preview);
    const target = destination.preview;
    offsiteMap = root.L.map(preview,{scrollWheelZoom:false}).setView(target.center,target.zoom || 18);
    const generation = renderId;
    root.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'})
     .on('tileerror',()=>{if (renderId === generation) status.textContent = 'Some map tiles could not load. The map links below are still available.';}).addTo(offsiteMap);
    root.L.circleMarker(target.center,{radius:9,color:'#6935b3',fillColor:'#a77bda',fillOpacity:.85,weight:3}).addTo(offsiteMap).bindTooltip(create('span',target.label || destination.venue));
    if (target.label) empty.append(create('p',target.label));
   }
   if (destination.links) {
    for (const [provider,label] of [['google','Open in Google Maps'],['apple','Open in Apple Maps']]) {
     const link = create('a',label,'outline-button');
     link.href = destination.links[provider]; link.target = '_blank'; link.rel = 'noopener'; empty.append(link);
    }
   }
  }
  function displayDestination(direct = false) {
   const next = selectDestination(view,destination,direct);
   if (next.mode === 'top-down') showFloor(next.venue,next.floor);
   else if (next.mode === 'floors') showStack(next.venue);
   else showUnavailable(destination.kind === 'external' ? destination.venue : destination.location ? 'This location has no mapped room. Check the event information for details.' : 'Choose an event or explore a floor.');
   byId('show-destination').hidden = destination.kind !== 'indoor';
  }
  function showDetails(event) {
   detail.replaceChildren();
   if (!event) {
    detail.append(create('h2','Explore the venue'),create('p','Choose an event to see its details and location.'));
    return;
   }
   detail.append(create('span',event.track || event.format,'track-tag'),create('h2',event.title));
   detail.append(create('p',`${event.day} · ${event.start_time}–${event.end_time} Mountain Time`,'event-time'));
   if (event.speakers) detail.append(create('p',event.speakers,'event-speakers'));
   detail.append(create('p',[event.venue,event.floor,event.room].filter(Boolean).join(' · '),'event-location'));
   if (event.level) detail.append(create('p',`Level: ${event.level}`));
   if (event.notes) detail.append(create('p',event.notes));
   updateBingoLink();
  }
  function updateBingoLink() {
   const existing = detail.querySelector('[data-bingo]');
   if (!selectedEvent || !isLive(selectedEvent)) {existing?.remove(); return;}
   if (existing) return;
   const bingo = create('a','Play Buzzword Bingo','purple-link'); bingo.dataset.bingo = '';
   bingo.href = `/bingo/${encodeURIComponent(selectedEvent.id)}`; bingo.target='_blank'; bingo.rel='noopener'; detail.append(bingo);
  }
  function selectEvent(id, updateUrl = true) {
   selectedEvent = data.events.find(event=>String(event.id)===String(id));
   showDetails(selectedEvent);
   destination = resolveDestination(selectedEvent?.location_id,data,selectedEvent?.room_ids);
   eventPicker.value = selectedEvent?.id || '';
   if (!id) {showStack(view.venue); byId('show-destination').hidden = true;}
   else displayDestination();
   if (id && !selectedEvent) {detail.replaceChildren(create('h2','Event not found'),create('p','Choose an event from the list to continue.'));}
   if (updateUrl) {
    const url = new URL(location.href); url.searchParams.delete('location');
    if (selectedEvent) url.searchParams.set('event',selectedEvent.id); else url.searchParams.delete('event');
    history.replaceState(null,'',url);
   }
  }
  for (const event of data.events) eventPicker.add(new Option(`${event.day} · ${event.start_time} · ${event.title}`,event.id));
  setInterval(() => {
   data.events = data.events.filter(event=>isUpcoming(event));
   const available = new Set(data.events.map(event=>String(event.id)));
   for (const option of [...eventPicker.options]) if (option.value && !available.has(option.value)) option.remove();
   if (selectedEvent && !available.has(String(selectedEvent.id))) {
    selectEvent('');
    detail.replaceChildren(create('h2','This event has ended'),create('p','Choose an upcoming event to see its details and location.'));
   }
  }, 30000);
  eventPicker.addEventListener('change',()=>selectEvent(eventPicker.value));
  setInterval(updateBingoLink, 1000);
  venuePicker.addEventListener('change',()=>showStack(venuePicker.value));
  floorPicker.addEventListener('change',()=>{if (floorPicker.value) showFloor(venuePicker.value,Number(floorPicker.value));});
  byId('floor-overview').addEventListener('click',()=>showStack(venuePicker.value));
  byId('show-destination').addEventListener('click',()=>displayDestination());
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(()=>{if (map && !mapElement.hidden) map.invalidateSize();}).observe(mapElement);
  const params = new URLSearchParams(location.search);
  setContext(view.venue,view.floor);
  if (params.has('event')) selectEvent(params.get('event'),false);
  else if (params.has('location')) {
   destination = resolveDestination(params.get('location'),data);
   detail.append(create('h2',destination.location?.label || 'Location unavailable'));
   displayDestination(true);
  } else {showDetails(null); showStack(view.venue);}
 }
 const api = {resolveDestination, selectDestination, mapLinks, offsitePreview, isUpcoming, isLive, mount};
 if (typeof module !== 'undefined' && module.exports) module.exports = api;
 else root.VenueMap = api;
})(typeof window === 'undefined' ? globalThis : window);
