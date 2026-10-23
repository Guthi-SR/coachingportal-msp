/* Admin-only, explicitly requested route calculation. No addresses are logged or stored here.
   External services: Nominatim (geocoding), OSRM demo (car routing). */
const SB="https://izuwixrvuxrhviyabgom.supabase.co";
const KEY="sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const cache=new Map();
const json=(res,code,obj)=>res.status(code).json(obj);
async function supa(path,token){
 const r=await fetch(SB+"/rest/v1/"+path,{headers:{apikey:KEY,Authorization:"Bearer "+token}});
 if(!r.ok)throw Error("Datenbankabfrage fehlgeschlagen ("+r.status+").");
 return r.json();
}
async function userFromToken(token){
 const r=await fetch(SB+"/auth/v1/user",{headers:{apikey:KEY,Authorization:"Bearer "+token}});
 if(!r.ok)throw Error("Bitte erneut anmelden.");
 const user=await r.json();
 const profiles=await supa("portal_profiles?user_id=eq."+encodeURIComponent(user.id)+"&select=role",token);
 if(profiles[0]?.role!=="admin")throw Error("Nur für Administratoren freigegeben.");
 return user;
}
async function externalJSON(url,timeout=7000){
 const response=await fetch(url,{headers:{"User-Agent":"Coachingportal-MSP/1.0 (https://coachingportal-msp.vercel.app)","Accept":"application/json","Referer":"https://coachingportal-msp.vercel.app/"},signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error("Routendienst derzeit nicht erreichbar ("+response.status+").");
 return response.json();
}
// One geocoding request at a time per server instance; keep >=1.2 sec between requests.
let geocodeLock=Promise.resolve(),lastGeocode=0;
function geocode(query){
 const step=geocodeLock.catch(()=>{}).then(async()=>{
  const now=Date.now(),wait=Math.max(0,1250-(now-lastGeocode));
  if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  lastGeocode=Date.now();
  const u="https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=de&q="+encodeURIComponent(query);
  const result=await externalJSON(u);
  if(!Array.isArray(result)||!result.length)return null;
  const place=result[0],lat=Number(place.lat),lon=Number(place.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  return{lat,lon,label:String(place.display_name||""),address:place.address||{},type:place.type||"",category:place.category||place.class||""};
 });
 geocodeLock=step.then(()=>{},()=>{});
 return step;
}
const small=s=>String(s||"").trim();
function coachAddress(details){
 const p=details||{};
 const line=[small(p.street),small(p.houseNumber)].filter(Boolean).join(" ");
 const city=[small(p.zip),small(p.city)].filter(Boolean).join(" ");
 return[line,city,"Deutschland"].filter(Boolean).join(", ");
}
function placeMatchesOrigin(result,coach){
 const postcode=small(coach.zip).replace(/\s/g,"");
 const returned=small(result?.address?.postcode).replace(/\s/g,"");
 if(postcode&&returned&&postcode!==returned)return false;
 const city=small(coach.city).toLocaleLowerCase("de");
 if(!returned&&city&&!result.label.toLocaleLowerCase("de").includes(city))return false;
 return true;
}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Nur POST erlaubt."});
 res.setHeader("Cache-Control","private, no-store");
 try{
  const token=String(req.headers.authorization||"").match(/^Bearer (.+)$/)?.[1];
  if(!token)return json(res,401,{error:"Bitte anmelden."});
  const user=await userFromToken(token);
  const {gameKey,coachId}=req.body||{};
  if(typeof gameKey!=="string"||gameKey.length>130||!gameKey||typeof coachId!=="string"||coachId.length>130||!coachId)return json(res,400,{error:"Ungültige Spiel- oder Coach-Auswahl."});
  const [matches,people]=await Promise.all([
   supa("portal_games?owner_id=eq."+encodeURIComponent(user.id)+"&game_key=eq."+encodeURIComponent(gameKey)+"&select=venue,venue_route_address",token),
   supa("portal_people?owner_id=eq."+encodeURIComponent(user.id)+"&kind=eq.coach&person_id=eq."+encodeURIComponent(coachId)+"&select=details",token)
  ]);
  const game=matches[0],coach=people[0]?.details;
  if(!game||!coach)return json(res,404,{error:"Spiel oder Coach nicht gefunden."});
  const origin=coachAddress(coach);
  const destination=small(game.venue_route_address)||small(game.venue);
  if(!small(coach.zip)||!small(coach.city)||!small(coach.street)||!small(coach.houseNumber))return json(res,422,{error:"Bei diesem Coach fehlen Straße, Hausnummer, PLZ oder Ort. Bitte zuerst Stammdaten ergänzen."});
  if(!destination)return json(res,422,{error:"Für dieses Spiel fehlt die Spielstätte."});
  const key=[user.id,gameKey,coachId,origin,destination].join("|");
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.time<12*3600000)return json(res,200,hit.value);
  const start=await geocode(origin);
  if(!start||!placeMatchesOrigin(start,coach))return json(res,422,{error:"Wohnadresse nicht eindeutig gefunden. Bitte Coach-Stammdaten prüfen."});
  // Try normalized German address variants without appending "Deutschland" twice.
  const cleanDestination=destination.replace(/[,\s]+Deutschland\s*$/i,"").trim();
  const candidates=[cleanDestination];
  const commaAddress=cleanDestination.match(/^(.+?\s+\d+[a-z]?)\s*,?\s*(\d{5})\s+(.+)$/i);
  if(commaAddress)candidates.push(commaAddress[1]+", "+commaAddress[2]+" "+commaAddress[3]);
  const normalized=cleanDestination.replace(/straße/gi,"str.").replace(/strasse/gi,"str.");
  if(normalized!==cleanDestination)candidates.push(normalized);
  const compact=cleanDestination.replace(/,?\s*Platz\s*\d+\s*$/i,"").trim();
  if(compact&&compact!==cleanDestination)candidates.push(compact);
  let finish=null;
  for(const candidate of [...new Set(candidates)]){
    finish=await geocode(candidate+", Deutschland");
    if(finish)break;
  }
  if(!finish)return json(res,422,{error:"Spielstätte nicht eindeutig gefunden. Bitte im Feld „Navigationsziel“ eine vollständige Sportplatz-Adresse eingeben und speichern."});
  // A municipality-only result is not precise enough for billing.
  const insufficient=(finish.category==="boundary"||["city","town","village","municipality","administrative"].includes(finish.type));
  if(insufficient)return json(res,422,{error:"Es wurde nur der Ortsmittelpunkt gefunden. Bitte eine genaue Sportplatz-Adresse als Navigationsziel ergänzen."});
  const routeUrl="https://router.project-osrm.org/route/v1/driving/"+start.lon+","+start.lat+";"+finish.lon+","+finish.lat+"?overview=false&steps=false";
  const route=await externalJSON(routeUrl,8000);
  if(route.code!=="Ok"||!route.routes?.[0]||!Number.isFinite(route.routes[0].distance))throw Error("Keine fahrbare Strecke gefunden.");
  const kilometers=Math.round(route.routes[0].distance/100)/10;
  const value={oneWayKm:kilometers,roundTripKm:Math.round(kilometers*20)/10,origin,destination,
   originResult:start.label,destinationResult:finish.label,
   coordinates:{origin:[start.lat,start.lon],destination:[finish.lat,finish.lon]},
   provider:"OpenStreetMap/Nominatim & OSRM",estimated:true};
  if(cache.size>150)cache.clear();
  cache.set(key,{time:Date.now(),value});
  return json(res,200,value);
 }catch(error){
  const message=String(error?.message||"Routenberechnung fehlgeschlagen.");
  return json(res,503,{error:message.slice(0,300)});
 }
}
