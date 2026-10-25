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
  // Parse exact house number and postcode from the requested address.
  const parts=search.split(",").map(x=>x.trim()).filter(Boolean);
  const street=parts[0]||search;
  const streetNumber=street.match(/^(.*?\S)\s+(\d+[a-zA-Z]?(?:\s*[-/]\s*\d+[a-zA-Z]?)?)$/);
  const requestedHouse=(streetNumber?.[2]||"").replace(/\s+/g,"").toLocaleLowerCase("de-DE")||null;
  const baseStreet=streetNumber?.[1]||street;
  const postalMatch=search.match(/\b(\d{5})\b/),requestedPostal=postalMatch?.[1]||null;
  const location=parts.slice(1).join(", ");
  const town=location.replace(/\b\d{5}\b/g,"").split(",")[0].trim();
  const urls=[];
  if(requestedHouse&&location)urls.push("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&countrycodes=de&street="+encodeURIComponent(baseStreet+" "+requestedHouse)+"&city="+encodeURIComponent(location));
  urls.push("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&countrycodes=de&q="+encodeURIComponent(search));
  let raw=[],nominatimError=null;
  for(const url of urls){
   try{const result=await getJSON(url);if(Array.isArray(result))raw.push(...result)}
   catch(e){nominatimError=e}
  }
  const unique=new Map();
  const addNominatim=(p)=>{
   const a=p.address||{},house=String(a.house_number||"").replace(/\s+/g,"").toLocaleLowerCase("de-DE");
   if(requestedHouse&&house!==requestedHouse)return;
   if(requestedPostal&&String(a.postcode||"")&&String(a.postcode)!==requestedPostal)return;
   const label=String(p.display_name||"");
   if(!label||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lon)))return;
   unique.set(String(p.lat)+","+String(p.lon),{label,lat:Number(p.lat),lon:Number(p.lon),type:String(p.type||""),category:String(p.category||p.class||""),address:a,provider:"OpenStreetMap / Nominatim",houseNumberMatched:!requestedHouse||house===requestedHouse});
  };
  raw.forEach(addNominatim);
  // Free secondary lookup through Photon (Komoot), based on OpenStreetMap data.
  // Only use it when Nominatim did not return an exact enough result.
  let photonError=null;
  if(!unique.size){
   try{
    const photonUrl="https://photon.komoot.io/api/?limit=10&lang=de&q="+encodeURIComponent(search);
    const photon=await getJSON(photonUrl);
    for(const feature of (photon?.features||[])){
     const p=feature.properties||{},coords=feature.geometry?.coordinates||[];
     const house=String(p.housenumber||"").replace(/\s+/g,"").toLocaleLowerCase("de-DE");
     if(requestedHouse&&house!==requestedHouse)continue;
     if(requestedPostal&&p.postcode&&String(p.postcode)!==requestedPostal)continue;
     if(town&&p.city&&String(p.city).toLocaleLowerCase("de-DE")!==town.toLocaleLowerCase("de-DE"))continue;
     if(coords.length<2||!Number.isFinite(Number(coords[0]))||!Number.isFinite(Number(coords[1])))continue;
     const label=[p.name,p.street&&p.housenumber?p.street+" "+p.housenumber:p.street,p.postcode,p.city,p.state].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(", ");
     if(!label)continue;
     unique.set(String(coords[0])+","+String(coords[1]),{label,lat:Number(coords[1]),lon:Number(coords[0]),type:String(p.type||""),category:String(p.osm_key||""),address:{house_number:p.housenumber||"",road:p.street||"",postcode:p.postcode||"",city:p.city||""},provider:"Photon / OpenStreetMap",houseNumberMatched:!requestedHouse||house===requestedHouse});
    }
   }catch(e){photonError=e}
  }
  const candidates=[...unique.values()].slice(0,5);
  if(!candidates.length){
   const message=requestedHouse
    ?"Kein Kartendienst konnte eine Adresse mit der exakt passenden Hausnummer "+requestedHouse+" bestätigen. Die Straße allein wird nicht als exakter Treffer angeboten. Bitte Adresse prüfen oder manuell verifizieren."
    :"Keine eindeutige Adresse gefunden. Bitte Straße, Hausnummer, PLZ und Ort ergänzen.";
   return json(res,200,{resolved:false,query:search,candidates:[],message,providersTried:["OpenStreetMap / Nominatim","Photon / OpenStreetMap"],providerErrors:[nominatimError?.message,photonError?.message].filter(Boolean)});
  }
  return json(res,200,{resolved:true,query:search,gameKey,candidates,providersTried:["OpenStreetMap / Nominatim",...(candidates.some(x=>x.provider==="Photon / OpenStreetMap")?["Photon / OpenStreetMap"]:[])]});
 }catch(e){return json(res,503,{error:String(e?.message||"Spielstättenprüfung fehlgeschlagen.").slice(0,300)});}
}
