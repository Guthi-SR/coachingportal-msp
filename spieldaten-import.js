// Parse copied public match-plan rows; no server/search index required.
const clean=s=>String(s||"").replace(/[\uE000-\uF8FF\u200B-\u200D]/g," ").replace(/\s+/g," ").trim();
const toIso=(d,m,y)=>((y.length===2?"20"+y:y)+"-"+m.padStart(2,"0")+"-"+d.padStart(2,"0"));
export function parseCopiedFixture(raw, requestedId=""){
  const original=String(raw||"");
  if(original.length<15||original.length>150000)return null;
  const id=String(requestedId||"").replace(/\s+/g,"");
  const tokens=[...original.matchAll(/\b\d{9}\b/g)];
  if(!tokens.length)return null;
  const selected=id?tokens.find(x=>x[0]===id):tokens.length===1?tokens[0]:null;
  if(!selected)return null;
  const pos=selected.index;
  const before=original.slice(Math.max(0,pos-260),pos);
  const after=original.slice(pos+9,pos+650);
  const snippet=after.split(/Zum Spiel\b/i)[0].slice(0,260);
  let match=snippet.match(/\|\s*([^|\n]{3,115})\s*\|\s*:\s*\|\s*([^|\n]{3,115})\s*\|/u);
  if(!match){
    const flat=clean(snippet);
    match=flat.match(/^\|?\s*([\p{L}\p{N}(][^:|]{2,110}?)\s*:\s*([\p{L}\p{N}(][^:|]{2,110}?)(?:\s+Zum Spiel|\s*\||$)/u);
  }
  if(!match)return null;
  const home=clean(match[1]).replace(/^\|+|\|+$/g,"").trim();
  const away=clean(match[2]).replace(/^\|+|\|+$/g,"").trim();
  if(!home||!away||home.length>110||away.length>110)return null;
  const dates=[...before.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2}|\d{2})(?:\s*[-|]\s*|\s+)(\d{1,2}):(\d{2})\b/g)];
  const d=dates.at(-1);
  const result={id:selected[0],home,away};
  if(d&&Number(d[4])<24&&Number(d[5])<60){result.date=toIso(d[1],d[2],d[3]);result.kickoff=d[4].padStart(2,"0")+":"+d[5]}
  const competition=[...before.matchAll(/\b((?:Landesliga|Bezirksliga|Kreisliga|Kreisklasse|A-Klasse|B-Klasse|Bayernliga|Regionalliga)[^\n|]{0,48})\s*\|/gi)].at(-1);
  if(competition)result.league=clean(competition[1]);
  return result;
}
