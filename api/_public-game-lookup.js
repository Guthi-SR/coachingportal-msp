// Best-effort lookup of a single, publicly indexed match by its nine-digit game number.
// This is NOT a licensed BFV/DFBnet API and must not invent or guess a venue.
const compact=s=>String(s||"").replace(/\s+/g," ").trim();
const decode=s=>String(s||"").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([a-f0-9]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&(?:amp|quot|apos|lt|gt|nbsp|uuml|auml|ouml|Uuml|Auml|Ouml|szlig);/g,m=>({"&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">","&nbsp;":" ","&uuml;":"ü","&auml;":"ä","&ouml;":"ö","&Uuml;":"Ü","&Auml;":"Ä","&Ouml;":"Ö","&szlig;":"ß"}[m]||m));
function cleanUrl(input) {
  try {
    const u=new URL(decode(input));
    if(u.protocol!=="https:"||u.username||u.password)return null;
    if(!["www.fussball.de","fussball.de","www.bfv.de","bfv.de"].includes(u.hostname))return null;
    if(!/^\/(?:spiel|mannschaft|spiele|wettbewerbe)\//.test(u.pathname))return null;
    u.hash="";return u.href;
  } catch {return null;}
}
async function read(url,limit=650000){
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),5500);
  try {
    const r=await fetch(url,{headers:{"Accept":"text/html, application/rss+xml, application/xml;q=0.9","User-Agent":"Mozilla/5.0 (compatible; CoachingportalMSP/1.0)"},
       signal:ctl.signal,redirect:"error"});
    if(!r.ok)return "";
    const type=r.headers.get("content-type")||"";
    if(!/(?:html|xml|rss|text\/plain)/i.test(type))return "";
    const body=await r.text();return body.length<=limit?body:"";
  } catch {return "";} finally{clearTimeout(t)}
}
function indexedLinks(xml) {
 const found=[];
 for(const item of xml.match(/<item>[\s\S]*?<\/item>/gi)||[]){
   const href=item.match(/<link>([\s\S]*?)<\/link>/i)?.[1];
   if(href){const url=cleanUrl(href);if(url)found.push(url)}
 }
 // Secondary DDG HTML support: links are not used unless URL is explicitly allowlisted.
 for(const m of xml.matchAll(/href=["']([^"']{20,650})["']/gi)){
   let val=decode(m[1]);
   try {
     const wrap=new URL(val,"https://html.duckduckgo.com");
     if(wrap.hostname==="duckduckgo.com"||wrap.hostname==="html.duckduckgo.com")val=wrap.searchParams.get("uddg")||"";
   }catch{}
   const url=cleanUrl(val);if(url)found.push(url);
 }
 return [...new Set(found)].slice(0,9);
}
function documentText(html){
 return compact(decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")));
}
function fixtureFromPage(html,id,url){
 const text=documentText(html);
 const needle=new RegExp("\\b"+id+"\\b");
 if(!needle.test(text))return null;
 // Avoid accidentally matching another match in a whole team fixture list:
 const isMatchPage=new URL(url).pathname.startsWith("/spiel/");
 if(!isMatchPage)return null;
 if(!new RegExp("(?:Spiel\\s*:\\s*|Spielnummer\\s*:\\s*)"+id+"\\b","i").test(text))return null;
 const title=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"");
 const m=compact(title).match(/^(.+?)\s+-\s+(.+?)\s+Ergebnis:\s*(.+?)\s+-\s+(?:Herren|Frauen|Junioren|Juniorinnen|Alte Herren|U\d+)\s+-\s+(\d{1,2}\.\d{1,2}\.\d{4})/i);
 if(!m)return null;
 const [day,month,year]=m[4].split(".");
 const nearby=text.slice(Math.max(0,text.indexOf(id)-450),text.indexOf(id)+140);
 const n=nearby.match(/(?:Spiel\s*:\s*)\d{9}\s*\/\s*(\d{1,2})\.\s*Spieltag/i);
 // Only keep a venue if a specific address is displayed in the matched game's page.
 // A town or a club name is NOT a navigation address.
 const venueCandidate=text.match(/(?:Spielst[aä]tte|Spielort|Sportanlage)\s*:\s*([^|]{8,170}?\b\d{5}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß -]{2,55})/i)?.[1]||"";
 const venue=venueCandidate&&/\b(?:str(?:aße|\.)|weg|platz|allee|gasse|ring|am|an der|zum|im)\b/i.test(venueCandidate)?compact(venueCandidate):"";
 return {
   found:true,id,home:compact(m[1]),away:compact(m[2]),date:year+"-"+month.padStart(2,"0")+"-"+day.padStart(2,"0"),
   league:compact(m[3]),...(n?{spieltag:n[1]}:{}),...(venue?{venue}:{}),
   source:"oeffentliche-einzelsuche",sourceUrl:url,
   note:venue?"Einzelsuche in öffentlich angezeigten Spieldaten. Spielstätte bitte vor der Kilometerberechnung prüfen.":
    "Spiel gefunden. Keine vollständige Spielstättenadresse nachweisbar – bitte als Navigationsadresse ergänzen. Kein offizieller Datenzugang."
 };
}
export async function lookupIndexedFixture(id){
 const query='site:fussball.de "'+id+'"';
 const rss="https://www.bing.com/search?format=rss&q="+encodeURIComponent(query);
 let documents=indexedLinks(await read(rss,170000));
 if(!documents.length){
   const ddg="https://html.duckduckgo.com/html/?q="+encodeURIComponent(query);
   documents=indexedLinks(await read(ddg,170000));
 }
 for(const url of documents){
   const path=new URL(url).pathname;
   if(path.startsWith("/spiel/")){
     const result=fixtureFromPage(await read(url),id,url);
     if(result)return result;
     continue;
   }
   // Search engines may return a team page listing multiple games.
   const html=await read(url);
   const index=html.indexOf(id);
   if(index<0)continue;
   const around=html.slice(Math.max(0,index-6000),index+6000);
   const links=[...around.matchAll(/(?:href|data-href)=["']([^"']*\/spiel\/[^"']{5,220})["']/gi)]
      .map(x=>cleanUrl(x[1])).filter(Boolean);
   for(const gameUrl of [...new Set(links)].slice(0,4)){
     const found=fixtureFromPage(await read(gameUrl),id,gameUrl);
     if(found)return found;
   }
 }
 return null;
}
