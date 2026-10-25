// Authenticated sport-ground lookup for Coachingportal MSP.
// Uses OpenStreetMap Nominatim. User must review the result before confirming it.
const SB="https://izuwixrvuxrhviyabgom.supabase.co";
const KEY="sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const json=(res,code,obj)=>res.status(code).json(obj);
async function userFromToken(token){
 const r=await fetch(SB+"/auth/v1/user",{headers:{apikey:KEY,Authorization:"Bearer "+token}});
 if(!r.ok)throw Error("Bitte erneut anmelden.");
 const user=await r.json();
 const p=await fetch(SB+"/rest/v1/portal_profiles?user_id=eq."+encodeURIComponent(user.id)+"&select=role",{headers:{apikey:KEY,Authorization:"Bearer "+token}});
 if(!p.ok)throw Error("Benutzerprofil konnte nicht geprüft werden.");
 const profiles=await p.json();
 if(profiles[0]?.role!=="admin")throw Error("Nur Administratoren dürfen Spielstätten bestätigen.");
 return user;
}
async function getJSON(url){
 const r=await fetch(url,{headers:{"User-Agent":"Coachingportal-MSP/1.0 (https://coachingportal-msp.vercel.app)","Accept":"application/json","Referer":"https://coachingportal-msp.vercel.app/"},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error("Kartendienst nicht erreichbar ("+r.status+").");
 return r.json();
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","private, no-store");
 if(req.method!=="POST")return json(res,405,{error:"Nur POST erlaubt."});
 try{
  const token=String(req.headers.authorization||"").match(/^Bearer (.+)$/)?.[1];
  if(!token)return json(res,401,{error:"Bitte anmelden."});
  const user=await userFromToken(token);
  const gameKey=String(req.body?.gameKey||"").trim();
  const query=String(req.body?.query||"").trim();
  if(!gameKey||gameKey.length>130)return json(res,400,{error:"Ungültige Spielkennung."});
  const r=await fetch(SB+"/rest/v1/portal_games?owner_id=eq."+encodeURIComponent(user.id)+"&game_key=eq."+encodeURIComponent(gameKey)+"&select=game_key,venue,venue_route_address",{headers:{apikey:KEY,Authorization:"Bearer "+token}});
  if(!r.ok)throw Error("Spieldaten konnten nicht geladen werden.");
  const games=await r.json(),game=games[0];
  if(!game)return json(res,404,{error:"Spiel nicht gefunden."});
  const search=query||game.venue_route_address||game.venue;
  if(!search)return json(res,422,{error:"Keine Spielstätte hinterlegt. Bitte zuerst eine genaue Adresse eingeben."});
  const u="https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=de&q="+encodeURIComponent(search);
  const results=await getJSON(u);
  const candidates=(Array.isArray(results)?results:[]).map(p=>({label:String(p.display_name||""),lat:Number(p.lat),lon:Number(p.lon),type:String(p.type||""),category:String(p.category||p.class||""),address:p.address||{}})).filter(p=>p.label&&Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  if(!candidates.length)return json(res,200,{resolved:false,query:search,candidates:[],message:"Keine eindeutige Position gefunden. Bitte Straße, Hausnummer, PLZ und Ort ergänzen."});
  return json(res,200,{resolved:true,query:search,gameKey,candidates});
 }catch(e){return json(res,503,{error:String(e?.message||"Spielstättenprüfung fehlgeschlagen.").slice(0,300)});}
}
