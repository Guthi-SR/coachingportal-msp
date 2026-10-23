// Known portal sport grounds. A match is accepted only for the full, unambiguous ground name.
const known={"Langenprozelten":"Jahnstr. 1, 97737 Gemünden am Main","Wombach":"Zur Wolfswiese, 97816 Lohr am Main","Eibelstadt":"Am Sportpark 1, 97246 Eibelstadt","ETSV Würzburg":"Mergentheimer Str. 17, 97082 Würzburg","Steinmark":"Am Salzberg, 97839 Esselbach","Fuhrmann Arena":"Orber Str., 97833 Frammersbach","Marktheidenfeld":"Am Sportzentrum 2, 97828 Marktheidenfeld","Grombühl":"Oberdürrbacher Str. 1, 97080 Würzburg","Remlingen":"Kastanienallee 14, 97280 Remlingen","Seifriedsburg":"Hammelburger Str., 97737 Gemünden am Main","Karlstadt":"Baggertsweg, 97753 Karlstadt","FC Helmstadt":"Krambergweg 3, 97264 Helmstadt","Rieneck":"Untere Jägerwiese 1, 97794 Rieneck","Wernfeld":"Am Radweg, 97737 Wernfeld","Randersacker":"Am Sonnenstuhl 62, 97236 Randersacker","Jahnstraße Lohr":"Jahnstr., 97816 Lohr am Main","Gambach":"Stadtweg 3, 97753 Karlstadt","Maidbronn":"Mühlhäuser Str., 97222 Rimpar","Trennfeld":"Zum Sportplatz, 97855 Triefenstein-Trennfeld","Nägelsee":"Nägelseestr., 97816 Lohr am Main","Aura":"An der Staatsstraße, 97773 Aura","Gemünden am Main":"Duivenallee, 97737 Gemünden am Main","Himmelstadt":"Obere Ringstr., 97267 Himmelstadt","Wiesthal":"Brückenstr. 13, 97859 Wiesthal","Sepp-Endres":"Mainaustr. 32, 97082 Würzburg","Lengfeld":"Weg zum Sportplatz 8, 97076 Würzburg","Fundamentum":"Zum Sportgelände 12, 97753 Karlstadt","Diebach":"Reuthweg 12, 97762 Hammelburg"};
export default async function handler(req,res){
 res.setHeader("Cache-Control","private, max-age=300");
 if(req.method!=="GET")return res.status(405).json({error:"Nur GET erlaubt."});
 const name=String(req.query.venue||"").trim();
 if(!name||name.length>220)return res.status(400).json({error:"Spielstätte fehlt."});
 if(/\\b\\d{5}\\b/.test(name))return res.status(200).json({address:name,source:"eingabe",resolved:true});
 const key=Object.keys(known).find(k=>name.toLocaleLowerCase("de").includes(k.toLocaleLowerCase("de")));
 if(key)return res.status(200).json({address:known[key],source:"spielstaettenverzeichnis",resolved:true});
 // Unknown / ambiguous grounds must be corrected rather than silently geocoded to a wrong pitch.
 return res.status(200).json({address:null,resolved:false,source:"unbekannt",message:"Spielstätte nicht eindeutig zugeordnet. Bitte vollständige Sportplatzadresse eintragen."});
}