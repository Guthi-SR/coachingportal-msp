const SB="https://izuwixrvuxrhviyabgom.supabase.co";
const PUBLIC="sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const result=(res,code,obj)=>res.status(code).json(obj);
async function query(path,key,method="GET",body){
 const r=await fetch(SB+"/rest/v1/"+path,{method,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:method==="GET"?"":"return=representation"},body:body?JSON.stringify(body):undefined});
 if(!r.ok)throw Error("Datenbankfehler "+r.status);return r.status===204?[]:r.json();
}
export default async function handler(req,res){
 if(req.method!=="GET")return result(res,405,{error:"Nur GET."});
 const secret=process.env.CRON_SECRET;
 if(!secret)return result(res,503,{error:"CRON_SECRET fehlt."});
 if(req.headers.authorization!=="Bearer "+secret)return result(res,401,{error:"Nicht autorisiert."});
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY,mailKey=process.env.RESEND_API_KEY,from=process.env.PORTAL_MAIL_FROM;
 if(!key||!mailKey||!from)return result(res,503,{error:"Cron benötigt SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY und PORTAL_MAIL_FROM."});
 try{
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const maxDate=new Date(Date.parse(today+"T12:00:00Z")-5*86400000).toISOString().slice(0,10);
  const minDate=new Date(Date.parse(maxDate+"T12:00:00Z")-2*86400000).toISOString().slice(0,10);
  const games=await query("portal_games?match_date=gte."+minDate+"&match_date=lte."+maxDate+"&received_at=is.null&check_in_sent_at=is.null&select=*&order=match_date.asc&limit=200",key);
  let sent=0,skipped=0,failed=0;
  const profiles=new Map();
  for(const g of games){
   try{
    if(!profiles.has(g.owner_id)){const p=await query("portal_profiles?user_id=eq."+g.owner_id+"&role=eq.admin&select=email",key);profiles.set(g.owner_id,p[0]?.email||"")}
    const to=profiles.get(g.owner_id);if(!to||!to.includes("@")){skipped++;continue}
    const date=g.match_date.split("-").reverse().join(".");
    const text="Hallo Daniel,\n\nfünf Tage nach dem Coaching-Spiel "+g.home+" – "+g.away+" vom "+date+" ist bislang kein Beobachtungsbogen als eingegangen markiert.\n\nIst der Bogen inzwischen angekommen? Bitte prüfe den Status im Coachingportal MSP.\n\nViele Grüße\nCoachingportal MSP";
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+mailKey,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject:"Nachfrage: Ist der Beobachtungsbogen eingegangen? – "+g.home+" – "+g.away,text})});
    const mailed=await response.json().catch(()=>({}));
    if(!response.ok){failed++;continue}
    const now=new Date().toISOString();
    await query("portal_games?owner_id=eq."+g.owner_id+"&game_key=eq."+encodeURIComponent(g.game_key)+"&check_in_sent_at=is.null",key,"PATCH",{check_in_sent_at:now,updated_at:now});
    await query("portal_mail_log",key,"POST",{owner_id:g.owner_id,game_key:g.game_key,kind:"eingang_nachfrage",recipient:to,provider_id:mailed.id||null});
    sent++;
   }catch(e){failed++}
  }
  return result(res,200,{ok:true,processed:games.length,sent,skipped,failed});
 }catch(e){return result(res,500,{error:"Automatische Erinnerungen derzeit nicht möglich."})}
}