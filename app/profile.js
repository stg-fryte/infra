const DEFAULTS = Object.freeze({displayName:'',pronouns:'',company:'',role:'',location:'',bio:'',interests:'',github:'',linkedin:'',website:'',mastodon:'',bluesky:'',photo:'',theme:'light',accent:'#7545c4',lightBackground:'#faf9fc',darkBackground:'#17131f',reduceMotion:false,defaultView:'comfortable'});
const TEXT_FIELDS = {displayName:80,pronouns:40,company:100,role:100,location:100,bio:500,interests:300};
const URL_FIELDS = ['github','linkedin','website','mastodon','bluesky'];
function validateProfile(form) {
 const result = {...DEFAULTS};
 for (const [name,max] of Object.entries(TEXT_FIELDS)) {
  const value = (form.get(name)||'').trim();
  if (value.length > max) throw new Error(`${name} must be ${max} characters or fewer.`);
  result[name] = value;
 }
 for (const name of URL_FIELDS) {
  const value = (form.get(name)||'').trim();
  if (!value) continue;
  let url;
  try {url = new URL(value);} catch {throw new Error(`Enter a full HTTPS URL for ${name}.`);}
  if (url.protocol !== 'https:' || url.username || url.password || value.length > 500) throw new Error(`Enter a full HTTPS URL for ${name}.`);
  result[name] = url.href;
 }
 for (const name of ['accent','lightBackground','darkBackground']) {
  const value = form.get(name) || DEFAULTS[name];
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Choose a valid six-digit color.');
  result[name] = value.toLowerCase();
 }
 result.theme = form.get('theme') || 'light';
 if (!['light','dark','system'].includes(result.theme)) throw new Error('Choose light, dark, or system appearance.');
 result.defaultView = form.get('defaultView') || 'comfortable';
 if (!['comfortable','compact'].includes(result.defaultView)) throw new Error('Choose a valid schedule layout.');
 result.reduceMotion = form.get('reduceMotion') === 'on';
 result.photo = form.get('photo') || '';
 if (result.photo) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(result.photo);
  if (!match || result.photo.length > 220000) throw new Error('Choose a smaller PNG, JPEG, or WebP photo.');
  const bytes = Buffer.from(match[2], 'base64');
  const valid = match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0]===255&&bytes[1]===216&&bytes[2]===255 : bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if (!valid) throw new Error('This file is not a supported photo.');
 }
 return result;
}
function preferences(value) {return {...DEFAULTS,...(value && typeof value === 'object' ? value : {})};}
module.exports = {DEFAULTS,validateProfile,preferences};
