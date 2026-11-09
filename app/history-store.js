const {expectedWords,FREE_INDEX}=require('./bingo');
async function loadResults(pool,id) {
 const {rows:[event]}=await pool.query(`SELECT s.id,s.title,t.name AS track,
   (d.event_date+s.end_time) AT TIME ZONE 'America/Denver' AS ends_at,
   (SELECT count(*)::int FROM bingo_cards WHERE session_id=s.id) AS participants
   FROM sessions s JOIN days d ON d.id=s.day_id LEFT JOIN tracks t ON t.id=s.track_id WHERE s.id=$1`,[id]);
 if(!event)return null;
 const {rows}=await pool.query(`SELECT lower(btrim(word)) AS key,min(btrim(word)) AS word,
   count(DISTINCT c.id)::int AS shown,
   count(DISTINCT c.id) FILTER(WHERE (position-1)::int=ANY(c.marked))::int AS reported
   FROM bingo_cards c CROSS JOIN LATERAL jsonb_array_elements_text(c.cells) WITH ORDINALITY AS cell(word,position)
   WHERE c.session_id=$1 AND position<>$2+1 AND lower(btrim(word))<>'free'
   GROUP BY lower(btrim(word))`,[id,FREE_INDEX]);
 const words=new Map(expectedWords(event).map(w=>[w.key,{...w,expected:true,shown:0,reported:0,rate:null}]));
 for(const row of rows){const expected=words.get(row.key);words.set(row.key,{key:row.key,word:expected?.word||row.word,expected:!!expected,shown:row.shown,reported:row.reported,rate:row.shown?row.reported/row.shown:null});}
 return {...event,ends_at:event.ends_at.toISOString(),closesAt:event.ends_at.toISOString(),final:false,observedAt:new Date().toISOString(),words:[...words.values()].sort((a,b)=>b.reported-a.reported||a.word.localeCompare(b.word))};
}
module.exports={loadResults};
