import {deliverMail,mailConfigured} from "./_strato-mail.js";
const SB="https://izuwixrvuxrhviyabgom.supabase.co";
const PUB="sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const reply=(res,status,error)=>res.status(status).json({error});
export default async function handler(req,res){
 if(req.method!=="POST")return reply(res,405,"Nur POST erlaubt.");
 const token=(req.headers.authorization||"").match(/^Bearer (.+)$/)?.[1];
 if(!token)return reply(res,401,"Bitte anmelden.");
 if(!mailConfigured())return reply(res,503,"STRATO-SMTP ist nicht konfiguriert.");
 const draftId=req.body?.draftId;
 if(typeof draftId!=="string"||!/^[0-9a-f-]{36}$/i.test(draftId))return reply(res,400,"Ungültige Benutzer-ID.");
 try{
  const authHeaders={apikey:PUB,Authorization:"Bearer "+token};
  const who=await fetch(SB+"/auth/v1/user",{headers:authHeaders});
  if(!who.ok)return reply(res,401,"Sitzung abgelaufen.");
  const actor=await who.json();
  const profile=await fetch(SB+"/rest/v1/portal_profiles?user_id=eq."+encodeURIComponent(actor.id)+"&select=role",{headers:authHeaders});
  if(!profile.ok||(await profile.json())[0]?.role!=="admin")return reply(res,403,"Nur Administratoren.");
  // Link generation and ownership checks remain inside the existing admin-protected Supabase Edge Function.
  const prepared=await fetch(SB+"/functions/v1/invite-portal-user",{method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},body:JSON.stringify({draftId,mode:"prepareMail"})});
  const data=await prepared.json().catch(()=>({}));
  if(!prepared.ok||!data.ok)return reply(res,prepared.status===409?409:502,data.error||"Persönlicher Link konnte nicht erstellt werden.");
  const email=String(data.to||"").trim().toLowerCase();
  const link=String(data.link||"");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!link.startsWith(SB+"/auth/v1/verify?"))return reply(res,502,"Ungültige Empfängeradresse oder Link.");
  const subject="Einladung zum Coachingportal MSP";
  const body=["Hallo "+data.firstName+" "+data.lastName+",","","du wurdest zum Coachingportal MSP eingeladen. Richte deinen Zugang über folgenden persönlichen Link ein:",link,"","Benutzername: "+data.username,"","Zum Coachingportal: https://coachingportal-msp.vercel.app/","","Viele Grüße","Coachingportal MSP"].join("\n");
  const sent=await deliverMail({to:email,subject,text:body});
  return res.status(200).json({ok:true,message:"Zugangs-E-Mail über STRATO versendet.",id:sent.id||null});
 }catch(e){return reply(res,502,"Versand fehlgeschlagen: "+String(e.message||e).slice(0,180))}
}