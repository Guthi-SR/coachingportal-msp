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
async function read(url,limit=650000,timeoutMs=3500){
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeoutMs);
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
     if(wrap.hostname==="duckduckgo.com"||wrap.hostname==="html.duckduckgo.com"||wrap.hostname==="www.google.com"||wrap.hostname==="google.com")val=wrap.searchParams.get("uddg")||wrap.searchParams.get("q")||wrap.searchParams.get("url")||val;
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
// Team schedule pages usually contain the match ID even when the future
// fixture has no standalone result page yet.
function fixtureFromTeamPage(html,id,url){
  if(!/^\/(?:mannschaft|verein)\//.test(new URL(url).pathname))return null;
  const text=documentText(html).replace(/[\uE000-\uF8FF\u200B-\u200D]/g," ");
  const idMatches=[...text.matchAll(new RegExp("\\b"+id+"\\b","g"))];
  for(const hit of idMatches.slice(0,8)){
    const pre=text.slice(Math.max(0,hit.index-230),hit.index);
    const post=text.slice(hit.index+id.length,hit.index+240);
    const dates=[...pre.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d\d|\d\d)\D{0,24}(\d{1,2}):(\d{2})\b/g)];
    const day=dates.at(-1);
    if(!day)continue;
    const date=(day[3].length===2?"20"+day[3]:day[3])+"-"+day[2].padStart(2,"0")+"-"+day[1].padStart(2,"0");
    const hh=Number(day[4]),mm=Number(day[5]);
    if(hh>23||mm>59)continue;
    const kickoff=day[4].padStart(2,"0")+":"+day[5];
    // The scores column before kick-off is a literal colon, not a final result.
    const match=post.match(/^[\s|]*(.{3,105}?)\s*:\s*(.{3,115}?)\s*(?::\s*|[\uE000-\uF8FF\s]*)?Zum Spiel\b/i);
    if(!match)continue;
    const club=t=>compact(t.split(/[\uE000-\uF8FF]/)[0].replace(/[|]/g," ").replace(/\s+[^\p{L}\p{N}()\/.-]+$/gu,""));
    const home=club(match[1]),away=club(match[2]);
    if(home.length<3||away.length<3||home.length>95||away.length>95)continue;
    // Never infer a pitch merely from the home club; fixtures can be relocated.
    const league=pre.match(/\b(?:Kreisklasse|Kreisliga|Bezirksliga|Landesliga|Bayernliga|Regionalliga|A-Klasse|B-Klasse|C-Klasse|Freundschaftsspiel|Pokalspiel|Kreisoberliga)\b/gi)?.at(-1)||"";
    return {found:true,id,home,away,date,kickoff,...(league?{league}:{}),
      source:"oeffentlicher-mannschaftsspielplan",sourceUrl:url,
      note:"Begegnung aus öffentlichem Mannschaftsspielplan erkannt. Die genaue Spielstättenadresse muss separat bestätigt werden."};
  }
  return null;
}

function footballNamesClose(a,b) {
  const norm=x=>compact(x).toLocaleLowerCase("de").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]/gu,"");
  const x=norm(a),y=norm(b);
  return x.length>4&&y.length>4&&(x===y||x.includes(y)||y.includes(x));
}
function extractBfvVenue(html, fixture){
 const txt=documentText(html);
 const parts=[fixture.date.slice(8,10),fixture.date.slice(5,7),fixture.date.slice(0,4)];
 const date=parts[0]+"."+parts[1]+"."+parts[2];
 const rx=new RegExp(date.replaceAll(".","\\.")+"\\s*\\/\\s*"+fixture.kickoff+"\\s*Uhr","g");
 for(const d of txt.matchAll(rx)){
   const look=txt.slice(d.index,d.index+480);
   const game=look.match(/^\S*[\s\S]{0,300}?Zum Spiel\s+([^|]{5,105})\s*\|\s*([^|]{4,125})\s*\|\s*(\d{5})\s+([A-Za-zÄÖÜäöüß -]{3,65})/i);
   if(!game)continue;
   const gameDescription=look.slice(0,look.indexOf("Zum Spiel"));
   if(!gameDescription.includes(fixture.home)||!gameDescription.includes(fixture.away))continue;
   if(!(/\d/.test(game[2]) && /^[A-Za-zÄÖÜäöüß /.-]+$/.test(game[2].replace(/\d+/g,""))))continue;
   const city=compact(game[4].split(/\s+(?:Landesliga|Kreisklasse|Kreisliga|Bezirksliga|Regionalliga|Bayernliga|Oberliga|Nächste Spiele|Mehr anzeigen|Sa\.\.|So\.\.|Mo\.\.|Di\.\.|Mi\.\.|Do\.\.|Fr\.\.)\b/i)[0]);
   if(!city||city.length>50)return "";
   return compact(game[1])+" | "+compact(game[2])+" | "+game[3]+" "+city;
 }
 return "";
}
async function findFixtureVenue(fixture, deadline) {
 // A BFV team page lists the specific game's ground, unlike a home club's generic address.
 const terms=['site:bfv.de/mannschaften "'+fixture.home+'" "'+fixture.away+'"',
              'site:bfv.de/mannschaften "'+fixture.home+'"'];
 const endpoints=[
   q=>"https://www.google.com/search?num=6&q="+encodeURIComponent(q),
   q=>"https://www.bing.com/search?format=rss&q="+encodeURIComponent(q)
 ];
 for(const q of terms){
   for(const getUrl of endpoints){
     if(Date.now()+900>=deadline)return null;
     const links=indexedLinks(await read(getUrl(q),180000,Math.min(2200,Math.max(500,deadline-Date.now()))))
       .filter(url=>new URL(url).hostname.endsWith("bfv.de") && new URL(url).pathname.startsWith("/mannschaften/")).slice(0,3);
     for(const url of links){
       if(Date.now()+650>=deadline)return null;
       const venue=extractBfvVenue(await read(url,650000,Math.min(2300,Math.max(600,deadline-Date.now()))),fixture);
       if(venue)return {venue,venueSourceUrl:url};
     }
   }
 }
 return null;
}
// These are public TEAM SCHEDULE sources, not individually saved fixtures.
// The first six digits of the match number are the association+league identifier.
// One source can produce matches with many different nine-digit numbers.
// Coverage can be extended by verified league/team sources, not by per-match entries.
const staffelTeamSources={
 "310089":[
   {url:"https://www.fussball.de/mannschaft/-/team-id/01DJQATJKK000000VV0AG811VUPHCA1O",league:"Landesliga Nordwest"},
   {url:"https://www.fussball.de/mannschaft/-/team-id/016PDSNBRC000000VV0AG811VTE5EA5R",league:"Landesliga Nordwest"}
 ],
 "310315":[
   {url:"https://www.fussball.de/mannschaft/-/team-id/016PBLOQOK000000VV0AG80NVV8OQVTB",league:"Kreisklasse Gruppe 3 Würzburg"}
 ],
 "310353":[
   {url:"https://www.fussball.de/verein/tsv-1846-lohr-am-main-bayern/-/id/00ES8GNL08000018VV0AG08LVUPGND5I",league:"A-Klasse Gruppe 5 Würzburg"}
 ],
 "310148":[
   {url:"https://www.fussball.de/verein/tsv-1846-lohr-am-main-bayern/-/id/00ES8GNL08000018VV0AG08LVUPGND5I",league:"Bezirksliga"}
 ],
 "310133":[
   {url:"https://www.fussball.de/mannschaft/-/team-id/016PDAD9VO000000VV0AG80NVV8OQVTB",league:"Kreisliga Rhön"}
 ]
};
async function directBfvVenue(fixture,teamUrl){
 const id=new URL(teamUrl).pathname.match(/\/team-id\/([A-Za-z0-9]+)/)?.[1];
 if(!id)return null;
 const url="https://www.bfv.de/mannschaften/-/"+id;
 const html=await read(url,1100000,4500);
 if(!html)return null;
 const text=documentText(html);
 const [year,month,day]=fixture.date.split("-");
 const stamp=day+"."+month+"."+year;
 const normalized=s=>compact(s).toLocaleLowerCase("de").replace(/\s+/g," ");
 const dateRx=new RegExp(stamp.replace(/\./g,"\\.")+"\\s*\\/\\s*"+fixture.kickoff+"\\s*Uhr","g");
 for(const match of text.matchAll(dateRx)){
   const slice=text.slice(match.index,match.index+750);
   const next=slice.indexOf("Zum Spiel");
   if(next<0||next>400)continue;
   const teams=slice.slice(0,next);
   if(!normalized(teams).includes(normalized(fixture.home))||!normalized(teams).includes(normalized(fixture.away)))continue;
   const after=slice.slice(next+"Zum Spiel".length);
   const address=after.match(/^\s*([^|]{4,115}?)\s*\|\s*([^|]{4,110}?\d[^|]{0,70}?)\s*\|\s*(\d{5})\s+([^|]{2,85}?)(?=\s+(?:Landesliga|Kreisliga|Kreisklasse|Bezirksliga|Bayernliga|Regionalliga|A-Klasse|B-Klasse|Oberliga)\b|$)/i);
   if(!address)continue;
   const venue=[address[1],address[2],address[3]+" "+address[4]].map(compact).join(" | ");
   return {venue,venueSourceUrl:url};
 }
 return null;
}
async function gameSpecificBfvVenue(html,id,fixture){
 // Derive the actual FUSSBALL.DE match identity from the row carrying the
 // exact nine-digit number. The BFV shares the game's alphanumeric ID.
 const offset=html.indexOf(id);
 if(offset<0)return null;
 const block=html.slice(offset,offset+6500);
 const matches=[...block.matchAll(/href=["']https:\/\/www\.fussball\.de\/spiel\/[^"']+\/spiel\/([A-Z0-9]{20,40})["']/g)];
 const gameId=matches[0]?.[1];
 if(!gameId)return null;
 const url="https://www.bfv.de/ergebnisse/spiel/-/"+gameId;
 const page=await read(url,800000,4500);
 if(!page)return null;
 const txt=documentText(page);
 const match=txt.match(/\bAdresse\s+([^|]{4,110})\s*\|\s*([^|]{4,115})\s*\|\s*(\d{5})\s+([^|]{2,85}?)(?=\s+(?:Route planen|Spielnummer|Schiedsrichter)\b)/i);
 if(!match)return null;
 const venue=[match[1],match[2],match[3]+" "+match[4]].map(compact).join(" | ");
 // A ground must have a genuine postal address; never substitute club HQ.
 if(!/\d/.test(match[2]))return null;
 return {venue,venueSourceUrl:url};
}
async function lookupKnownStaffelSchedule(id,diagnostics){
 const allSources=Object.values(staffelTeamSources).flat();
 const unique=new Map(allSources.map(x=>[x.url,x]));
 const first=staffelTeamSources[id.slice(0,6)]||[];
 const sources=[...first,...[...unique.values()].filter(x=>!first.some(y=>y.url===x.url))];
 diagnostics.directSources=sources.length;
 diagnostics.directPages=0;diagnostics.directIdSeen=0;
 for(const candidate of sources){
   const teamId=new URL(candidate.url).pathname.match(/\/team-id\/([A-Z0-9]+)/)?.[1];
   const pages=[candidate.url];
   if(teamId)pages.push("https://www.fussball.de/ajax.team.matchplan/-/mode/PAGE/team-id/"+teamId);
   for(const page of pages){
   const html=await read(page,1100000,3600);
   if(!html)continue;
   diagnostics.directPages++;
   if(!new RegExp("\\b"+id+"\\b").test(documentText(html)))continue;
   diagnostics.directIdSeen++;
   const fixture=fixtureFromTeamPage(html,id,candidate.url);
   if(fixture){
     const venue=await gameSpecificBfvVenue(html,id,fixture)||await directBfvVenue(fixture,candidate.url);
     return {...fixture,league:fixture.league||(first.some(x=>x.url===candidate.url)?candidate.league:""),...(venue?{venue:venue.venue,venueSourceUrl:venue.venueSourceUrl}:{}),
       source:"oeffentlicher-staffelspielplan",
       note:venue?"Spiel und Navi-Adresse automatisch aus öffentlichen FUSSBALL.DE- und BFV-Spielplänen übernommen. Angaben vor dem Speichern prüfen.":"Spiel automatisch aus öffentlichem Mannschaftsspielplan übernommen. Vollständige Spielstättenadresse noch nicht bestätigt."};
   }
   }
 }
 return null;
}
export async function lookupIndexedFixture(id,diagnostics={}){
  diagnostics.engines=0;diagnostics.links=0;diagnostics.pages=0;diagnostics.idSeen=0;
  const directly=await lookupKnownStaffelSchedule(id,diagnostics);
  if(directly)return directly;
  const deadline=Date.now()+13500;
  const q='site:fussball.de/mannschaft "'+id+'"';
  const engines=[
    'https://www.google.com/search?num=10&q='+encodeURIComponent(q),
    'https://www.bing.com/search?format=rss&q='+encodeURIComponent(q),
    'https://html.duckduckgo.com/html/?q='+encodeURIComponent(q)
  ];
  let fixture=null;
  for(const engine of engines){
    if(Date.now()+1600>=deadline)break;
    diagnostics.engines++;
    const results=indexedLinks(await read(engine,220000,Math.min(3200,Math.max(1000,deadline-Date.now())))).slice(0,6);
    diagnostics.links+=results.length;
    for(const url of results){
      if(Date.now()+1200>=deadline)break;
      const html=await read(url,750000,Math.min(3200,Math.max(700,deadline-Date.now())));
      if(html){diagnostics.pages++;if(html.includes(id))diagnostics.idSeen++}
      if(new URL(url).pathname.startsWith("/spiel/")){
        fixture=fixtureFromPage(html,id,url);
      }else {
        fixture=fixtureFromTeamPage(html,id,url);
      }
      if(fixture)break;
    }
    if(fixture)break;
  }
  if(!fixture)return null;
  // A verified match is returned even when the source has no reliably mapped pitch.
  // Missing nav addresses are never filled with a club address.
  const identified=await findFixtureVenue(fixture,deadline);
  if(identified){
    return {...fixture,venue:identified.venue,
      sourceUrl:identified.venueSourceUrl,
      note:"Spielkennung im FUSSBALL.DE-Spielplan gefunden; dieselbe Begegnung mit Datum und Navi-Adresse beim BFV abgeglichen. Vor dem Speichern prüfen."};
  }
  return fixture;
}
