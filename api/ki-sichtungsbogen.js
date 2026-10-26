const SB="https://izuwixrvuxrhviyabgom.supabase.co";
const PUBLIC="sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const categories=["Administratives & spielbezogene Vorbereitung","Entscheidungsqualität","Disziplinarkontrolle","Auftreten & Persönlichkeit","Stellungsspiel & Fitness"];
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Nur POST erlaubt."});
 const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!token)return res.status(401).json({error:"Anmeldung erforderlich."});
 try{
  const auth=await fetch(SB+"/auth/v1/user",{headers:{apikey:PUBLIC,Authorization:"Bearer "+token}});
  if(!auth.ok)return res.status(401).json({error:"Sitzung ungültig."});
  const user=await auth.json();
  const profile=await fetch(SB+"/rest/v1/portal_profiles?user_id=eq."+encodeURIComponent(user.id)+"&role=eq.admin&select=user_id&limit=1",{headers:{apikey:PUBLIC,Authorization:"Bearer "+token}});
  if(!profile.ok||(await profile.json()).length===0)return res.status(403).json({error:"Nur für Administratoren."});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"KI-Auswertung ist noch nicht konfiguriert: OPENAI_API_KEY fehlt in Vercel."});
  const {referee,from,to,sources}=req.body||{};
  if(typeof referee!=="string"||!Array.isArray(sources)||sources.length<1||sources.length>20)return res.status(400).json({error:"Ungültige Auswertungsdaten."});
  if(sources.some(x=>typeof x.text!=="string"||x.text.length>35000))return res.status(413).json({error:"Ein Bogen ist zu umfangreich."});
  const instruction=`Du bist ein erfahrener Schiedsrichter-Coach des BSA Unterfranken. Verfasse aus mehreren Beobachtungsbögen EINEN vollständigen, ausführlichen und vortragsfähigen Gesamt-Sichtungsbogen auf Deutsch in der dritten Person. Orientiere dich EXAKT an der Reihenfolge der Originalvorlage: SPIELDATEN (Spiele, Schiedsrichter, Coaches, Zeitraum); FAZIT (ausführliche integrierte Gesamtbewertung); POSITIVE ASPEKTE (genau drei fachlich ausgearbeitete Abschnitte); OPTIMIERBARE BEREICHE (genau drei Abschnitte); ENTWICKLUNGSTHEMEN DES SR (genau drei konkrete Förderziele); BEWERTUNGSKATEGORIEN mit den fünf Rubriken: ${categories.join("; ")}. Für JEDE Kategorie Bewertung ++, +, o, -, -- oder 'nicht bewertbar' und einen ausführlichen, begründeten Kommentar. Eine Note nur vergeben, wenn die Originalbelege sie rechtfertigen; sonst 'nicht bewertbar'. Fasse Befunde verschiedener Spiele zusammen, vergleiche Entwicklungen, benenne Widersprüche und konkrete Spielszenen mit Minuten nur wenn belegt. Verwende ZWEI kurze, wortgetreue Zitate aus dem Quelltext, mit Spiel, Coach und Seite soweit vorhanden; erfinde keine. Falls keine zwei verifizierbaren Zitate vorliegen, sage es. Keine Floskeln, keine erfundenen Tatsachen oder ungestützten Bewertungen. Keine personenbezogenen Angaben über die übermittelten hinaus. Ausgabe als klar gegliederter, professioneller Gesamtbogen, kein Meta-Kommentar über die Technik.`;
  const body={model:process.env.OPENAI_MODEL||"gpt-4.1",temperature:0.2,messages:[{role:"system",content:instruction},{role:"user",content:JSON.stringify({referee,from,to,sources})}]};
  const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify(body)});
  if(!response.ok)return res.status(502).json({error:"KI-Dienst konnte die Auswertung nicht erstellen ("+response.status+")."});
  const data=await response.json();const report=data.choices?.[0]?.message?.content;
  if(typeof report!=="string"||report.length<100)throw Error("Leere KI-Antwort");
  res.setHeader("Cache-Control","no-store");return res.status(200).json({report});
 }catch(e){return res.status(500).json({error:"KI-Auswertung fehlgeschlagen: "+(e?.message||"Unbekannter Fehler")});}
}