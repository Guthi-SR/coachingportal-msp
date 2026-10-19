export default async function handler(req,res) {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET") return res.status(405).json({error:"Methode nicht erlaubt."});
  const id=String(req.query?.id??"").replace(/\s+/g,"");
  if(!/^\d{9}$/.test(id)) return res.status(400).json({error:"Spielkennung muss neun Ziffern haben."});
  // No authenticated, documented BFV/DFBnet lookup endpoint has been verified.
  // Never return invented game details or treat search snippets as confirmed.
  return res.status(503).json({found:false,id,error:"Die BFV-/DFBnet-Datenanbindung ist noch nicht verfügbar. Es wurden keine Spieldaten bestätigt."});
}
