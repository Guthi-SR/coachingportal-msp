import {deliverMail,mailConfigured} from "./_strato-mail.js";
const SB="https://izuwixrvuxrhviyabgom.supabase.co";
const PUBLIC="sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ";
const json=(res,code,body)=>res.status(code).json(body);
function mailValid(s){return typeof s==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254}
async function supa(path,token,opts={}){
 const r=await fetch(SB+"/rest/v1/"+path,{method:opts.method||"GET",headers:{apikey:PUBLIC,Authorization:"Bearer "+token,"Content-Type":"application/json",Prefer:opts.method?"return=representation":""},body:opts.body?JSON.stringify(opts.body):undefined});
 if(!r.ok)throw Error("Datenbank-Fehler ("+r.status+").");
 return r.status===204?[]:r.json();
}
async function account(token){
 const r=await fetch(SB+"/auth/v1/user",{headers:{apikey:PUBLIC,Authorization:"Bearer "+token}});
 if(!r.ok)throw Error("Bitte erneut anmelden.");
 const user=await r.json();
 const p=await supa("portal_profiles?user_id=eq."+encodeURIComponent(user.id)+"&select=role,email",token);
 if(p[0]?.role!=="admin")throw Error("Keine Admin-Berechtigung.");
 return{user,profile:p[0]};
}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Nur POST ist erlaubt."});
 try{
  const token=(req.headers.authorization||"").match(/^Bearer (.+)$/)?.[1];
  if(!token)return json(res,401,{error:"Bitte anmelden."});
  const{user,profile}=await account(token);
  const{gameKey,kind,subject,body,testMode=false,testRecipient="admin",testConfirmed=false}=req.body||{};
  if(!["bogen_versendet","coach_erinnerung"].includes(kind)||typeof gameKey!=="string"||gameKey.length>100)return json(res,400,{error:"Ungültiger Versandauftrag."});
  if(typeof subject!=="string"||!subject.trim()||subject.length>200||typeof body!=="string"||!body.trim()||body.length>20000)return json(res,400,{error:"Betreff oder Nachricht ungültig."});
  const records=await supa("portal_games?owner_id=eq."+encodeURIComponent(user.id)+"&game_key=eq."+encodeURIComponent(gameKey)+"&select=*",token);
  const g=records[0];if(!g)return json(res,404,{error:"Spiel nicht gefunden."});
  if(g.is_test!==true&&testMode)return json(res,409,{error:"Testversand ist nur für Testspiele erlaubt."});
  if(g.is_test===true&&(!testMode||testConfirmed!==true))return json(res,409,{error:"Testversand muss ausdrücklich bestätigt werden."});
  if(g.is_test===true&&!["admin","assigned"].includes(testRecipient))return json(res,400,{error:"Ungültiger Testempfänger."});
  const assignedRecipient=kind==="bogen_versendet"?g.referee_email:g.coach_email;
  const isTest=g.is_test===true;
  const recipient=isTest&&testRecipient==="admin"?profile.email:assignedRecipient;
  if(!mailValid(recipient))return json(res,422,{error:"Beim zugeordneten Empfänger fehlt eine gültige E-Mail-Adresse in den Stammdaten."});
  if(!mailConfigured())return json(res,503,{error:"STRATO-Mailversand noch nicht eingerichtet. Bitte STRATO_SMTP_USER und STRATO_SMTP_PASSWORD in Vercel hinterlegen."});
  const attachments=[];
  if(kind==="bogen_versendet"){
   if(!g.pdf_id&&!isTest)return json(res,409,{error:"Dem Spiel ist noch kein PDF-Beobachtungsbogen zugeordnet."});
   const docs=g.pdf_id?await supa("portal_observations?owner_id=eq."+encodeURIComponent(user.id)+"&document_id=eq."+encodeURIComponent(g.pdf_id)+"&select=storage_path,file_name",token):[];
   if(!docs[0]&&g.pdf_id)return json(res,404,{error:"Das PDF wurde noch nicht im geschützten Portal gespeichert."});
   if(docs[0]){
   const path=docs[0].storage_path.split("/").map(encodeURIComponent).join("/");
   const pdf=await fetch(SB+"/storage/v1/object/authenticated/portal-observation-pdfs/"+path,{headers:{apikey:PUBLIC,Authorization:"Bearer "+token}});
   if(!pdf.ok)return json(res,503,{error:"PDF konnte nicht aus der geschützten Ablage geladen werden."});
   const bytes=Buffer.from(await pdf.arrayBuffer());
   if(bytes.length>12*1024*1024)return json(res,413,{error:"PDF ist für den E-Mail-Anhang zu groß."});
   attachments.push({filename:docs[0].file_name||"Beobachtungsbogen.pdf",content:bytes.toString("base64")});
   }
  }else{
   const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const deadline=new Date(Date.parse(today+"T12:00:00Z")-5*86400000).toISOString().slice(0,10);
   if(!isTest&&(g.match_date>deadline||g.received_at||g.sent_at||g.sent_manual_at))return json(res,409,{error:"Die Erinnerungsmail steht nur für rote, noch offene Spiele zur Verfügung."});
  }
  let result;
  try {
   const finalSubject=isTest?"[TEST] "+subject.trim().replace(/^(?:\[TEST\]\s*)+/i,""):subject.trim();
   const finalBody=isTest?"TESTNACHRICHT – Coachingportal MSP\nDies ist eine ausdrücklich angeforderte Test-E-Mail.\nKeine echte Spieleinteilung oder offizielle Meldung.\n\n"+body.trim():body.trim();
   result=await deliverMail({to:recipient,subject:finalSubject,text:finalBody,attachments});
  }catch(e){return json(res,502,{error:"STRATO-SMTP: "+String(e?.message||"Versand fehlgeschlagen").slice(0,300)})}
  const now=new Date().toISOString();
  const patch=kind==="bogen_versendet"?{sent_at:now,updated_at:now}:{coach_reminder_at:now,updated_at:now};
  try{
   if(!isTest)await supa("portal_games?owner_id=eq."+encodeURIComponent(user.id)+"&game_key=eq."+encodeURIComponent(gameKey),token,{method:"PATCH",body:patch});
   await supa("portal_mail_log",token,{method:"POST",body:{owner_id:user.id,game_key:gameKey,kind,recipient,provider_id:result.id||null,is_test:isTest}});
  }catch(e){return json(res,200,{ok:true,warning:"E-Mail versendet, aber Protokollierung fehlgeschlagen: "+e.message})}
  return json(res,200,{ok:true,id:result.id||null});
 }catch(e){return json(res,500,{error:e?.message||"Unbekannter Fehler."})}
}