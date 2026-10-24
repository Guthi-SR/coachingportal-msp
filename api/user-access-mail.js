import {deliverMail,mailConfigured} from "./_strato-mail.js";
const SB="https://izuwixrvuxrhviyabgom.supabase.co";
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB="sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const reply=(res,status,error)=>res.status(status).json({error});
export default async function handler(req,res){
 if(req.method!=="POST")return reply(res,405,"Nur POST erlaubt.");
 const token=(req.headers.authorization||"").match(/^Bearer (.+)$/)?.[1];
 if(!token)return reply(res,401,"Bitte anmelden.");
 try{
  const who=await fetch(SB+"/auth/v1/user",{headers:{apikey:PUB,Authorization:"Bearer "+token}});
  if(!who.ok)return reply(res,401,"Sitzung abgelaufen.");
  const admin=await who.json();
  const profile=await fetch(SB+"/rest/v1/portal_profiles?user_id=eq."+encodeURIComponent(admin.id)+"&select=role",{headers:{apikey:PUB,Authorization:"Bearer "+token}});
  if(!profile.ok||(await profile.json())[0]?.role!=="admin")return reply(res,403,"Nur Administratoren.");
  if(!KEY||!mailConfigured())return reply(res,503,"Serverseitiger Supabase-Schlüssel oder STRATO-SMTP fehlt.");
  const draftId=req.body?.draftId;
  if(typeof draftId!=="string"||!/^[0-9a-f-]{36}$/i.test(draftId))return reply(res,400,"Ungültige Benutzer-ID.");
  const headers={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};
  const draftResponse=await fetch(SB+"/rest/v1/portal_pending_users?id=eq."+encodeURIComponent(draftId)+"&select=*",{headers});
  if(!draftResponse.ok)return reply(res,502,"Benutzer konnte nicht geladen werden.");
  const draft=(await draftResponse.json())[0];
  if(!draft||!draft.invited_user_id)return reply(res,409,"Zugang muss zuerst eingerichtet werden.");
  const email=String(draft.email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(res,422,"Ungültige Empfängeradresse.");
  const userResponse=await fetch(SB+"/auth/v1/admin/users/"+encodeURIComponent(draft.invited_user_id),{headers});
  if(!userResponse.ok)return reply(res,409,"Bestehendes Auth-Konto nicht gefunden.");
  const authUser=await userResponse.json();
  if(authUser.email?.toLowerCase()!==email)return reply(res,409,"E-Mail im Auth-Konto und Benutzerstamm stimmt nicht überein.");
  const linkResponse=await fetch(SB+"/auth/v1/admin/generate_link",{method:"POST",headers,body:JSON.stringify({type:"recovery",email,options:{redirectTo:"https://coachingportal-msp.vercel.app/"}})});
  const linkData=await linkResponse.json().catch(()=>({}));
  if(!linkResponse.ok)return reply(res,502,"Passwort-Link konnte nicht erstellt werden.");
  const link=linkData.action_link;
  if(!link||!link.startsWith(SB+"/auth/v1/verify"))return reply(res,502,"Ungültiger Passwort-Link.");
  const subject="Dein Zugang zum Coachingportal MSP";
  const body=["Hallo "+draft.first_name+",","","für dich wurde ein Benutzerkonto im Coachingportal MSP eingerichtet.","","Benutzername: "+draft.username,"","Über diesen persönlichen Link kannst du dein Passwort festlegen:",link,"","Zum Coachingportal: https://coachingportal-msp.vercel.app/","","Viele Grüße","Coachingportal MSP"].join("\n");
  const sent=await deliverMail({to:email,subject,text:body});
  return res.status(200).json({ok:true,message:"Zugangs-E-Mail an "+email+" über STRATO versendet.",id:sent.id||null});
 }catch(e){return reply(res,502,"Versand fehlgeschlagen: "+String(e.message||e).slice(0,180))}
}