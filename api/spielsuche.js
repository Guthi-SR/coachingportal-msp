const FIELDS=["home","away","date","kickoff","league","venue","competition","age","spieltag","spielgebiet","staffelBezeichnung","staffelKurz"];
export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET") return res.status(405).json({error:"Methode nicht erlaubt."});
  const id=String(req.query?.id??"").replace(/\s+/g,"");
  if(!/^\d{9}$/.test(id)) return res.status(400).json({error:"Spielkennung muss neun Ziffern haben."});
  const endpoint=process.env.BFV_GAME_LOOKUP_URL;
  const token=process.env.BFV_GAME_LOOKUP_TOKEN;
  // Individually checked fixtures, not an automated BFV/DFBnet feed.
  // Only include games verified against the published match listing AND venue.
  const verifiedGames={
    "310133119":{
      home:"FC Einigkeit Rottershausen",
      away:"(SG 1) TSV Hausen/Rhön",
      date:"2026-10-24",
      kickoff:"15:00",
      league:"Kreisliga Rhön",
      spieltag:"15",
      spielgebiet:"Kreis Rhön",
      staffelBezeichnung:"Kreisliga Rhön",
      staffelKurz:"KL Rhön",
      venue:"Sportgelände Rottershausen, Platz 1 | Siebengärten 27 | 97714 Oerlenbach",
      source:"einzeln-verifiziert",
      sourceUrl:"https://www.bfv.de/mannschaften/-/016PCGHMG4000000VV0AG80NVV8OQVTB",
      note:"Einzeln geprüfter Spiel- und Spielstätteneintrag. Keine automatische BFV-Datenanbindung; bitte vor dem Speichern prüfen."
    }
  };
  if(!endpoint) {
    if(verifiedGames[id]) return res.status(200).json({found:true,id,...verifiedGames[id]});
    return res.status(503).json({found:false,id,error:"Noch kein autorisierter BFV-Datenzugang eingerichtet. Für diese Spielkennung liegt kein einzeln verifizierter Eintrag vor. Bitte Spieldaten als Text übernehmen oder manuell erfassen."});
  }
  let url;
  try {
    url=new URL(endpoint);
    if(url.protocol!=="https:" || url.username || url.password) throw new Error("invalid");
    url.searchParams.set("id",id);
  } catch {
    return res.status(503).json({found:false,id,error:"BFV-Datenzugang ist fehlerhaft konfiguriert."});
  }
  try {
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    let response;
    try { response=await fetch(url,{headers:{Accept:"application/json",...(token?{Authorization:"Bearer "+token}:{})},signal:controller.signal,redirect:"error"}); }
    finally {clearTimeout(timeout);}
    if(response.status===404) return res.status(404).json({found:false,id,error:"Keine Spieldaten zu dieser Kennung gefunden."});
    if(!response.ok) return res.status(502).json({found:false,id,error:"Der offizielle Datenzugang hat keine gültige Antwort geliefert."});
    const payload=await response.json();
    const item=payload?.game??payload;
    if(item?.id!=null && String(item.id).replace(/\s+/g,"")!==id) throw new Error("ID mismatch");
    if(typeof item?.home!=="string" || typeof item?.away!=="string" || !item.home.trim() || !item.away.trim()) throw new Error("missing teams");
    const result={found:true,id};
    for(const field of FIELDS) if(typeof item[field]==="string") result[field]=item[field].slice(0,300);
    return res.status(200).json(result);
  } catch {
    return res.status(502).json({found:false,id,error:"Spieldaten konnten nicht zuverlässig abgerufen oder geprüft werden."});
  }
}
