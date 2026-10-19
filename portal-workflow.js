import{createClient}from"https://esm.sh/@supabase/supabase-js@2.57.4";
export const sb=createClient("https://izuwixrvuxrhviyabgom.supabase.co","sb_publishable_2Cep_1Pu93JXSKVrYzyRQA_5Nbq9XEZ");
const B="portal-observation-pdfs";
export async function requireAdmin(){
 const{data:{user},error}=await sb.auth.getUser();
 if(error||!user)throw Error("Bitte zuerst im Coachingportal anmelden.");
 const{data:p,error:pe}=await sb.from("portal_profiles").select("role,email").eq("user_id",user.id).single();
 if(pe||p?.role!=="admin")throw Error("Nur für Administratoren freigegeben.");
 return{user,profile:p};
}
export function localPeople(userId,type){
 try{return(JSON.parse(localStorage.getItem((type==="coach"?"msp-coach-draft-":"msp-admin-draft-")+userId)||"{}").refs||[]).filter(x=>x.id)}
 catch{return[]}
}
export function localGames(userId){try{return JSON.parse(localStorage.getItem("msp-games-draft-"+userId)||"[]")||[]}catch{return[]}}
function findPerson(people,id){return people.find(x=>x.id===id||x.name===id)}
function fullName(p){return p?.name||[p?.first,p?.last].filter(Boolean).join(" ")}
export async function syncGames(userId){
 const local=localGames(userId),refs=localPeople(userId,"referee"),coaches=localPeople(userId,"coach");
 const {data:remote,error}=await sb.from("portal_games").select("*").eq("owner_id",userId);
 if(error)throw error;
 const old=new Map((remote||[]).map(x=>[x.game_key,x]));
 const rows=[];
 for(const g of local){
  if(!g?.id||!/^\d{4}-\d{2}-\d{2}$/.test(g.date||"")||old.has(String(g.id)))continue;
  const r=findPerson(refs,g.referee),c=findPerson(coaches,g.coach);
  rows.push({
   ...(old.get(String(g.id))||{}),owner_id:userId,game_key:String(g.id),
   match_date:g.date,kickoff:g.kickoff||null,home:g.home||"",away:g.away||"",
   updated_at:new Date().toISOString(),
   league:g.league||null,venue:g.venue||null,
   referee_id:g.referee||null,referee_name:fullName(r)||g.referee||null,referee_email:r?.mail||r?.email||null,
   coach_id:g.coach||null,coach_name:fullName(c)||g.coach||null,
   coach_first_name:c?.first||fullName(c).split(" ")[0]||null,coach_email:c?.mail||c?.email||null
  });
 }
 if(rows.length){const{error:writeError}=await sb.from("portal_games").upsert(rows,{onConflict:"owner_id,game_key"});if(writeError)throw writeError;}
 const{data:newRemote,error:readErr}=await sb.from("portal_games").select("*").eq("owner_id",userId).order("match_date",{ascending:false});
 if(readErr)throw readErr;
 return newRemote||[];
}
export async function updateGame(ownerId,gameKey,patch){
 const {data,error}=await sb.from("portal_games").update({...patch,updated_at:new Date().toISOString()}).eq("owner_id",ownerId).eq("game_key",gameKey).select("*").single();
 if(error)throw error;return data;
}
export function observationAssignments(ownerId){
 try{return(JSON.parse(localStorage.getItem("msp-observation-assignments-"+ownerId)||"[]")||[]).filter(x=>x.pdfStored===true)}
 catch{return[]}
}
function openDb(){return new Promise((resolve,reject)=>{
 const req=indexedDB.open("msp-observation-pdfs",1);
 req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("pdfs"))req.result.createObjectStore("pdfs")};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
})}
export async function localPdf(id){
 const db=await openDb();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction("pdfs","readonly"),req=tx.objectStore("pdfs").get(id);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 })}finally{db.close()}
}
export async function syncObservations(ownerId){
 const records=observationAssignments(ownerId);
 const {data:existing,error}=await sb.from("portal_observations").select("*").eq("owner_id",ownerId);
 if(error)throw error;
 const synced=new Set((existing||[]).map(x=>x.document_id));
 const {data:deleted,error:deletedError}=await sb.from("portal_deleted_observations").select("document_id").eq("owner_id",ownerId);
 if(deletedError)throw deletedError;
 const blocked=new Set((deleted||[]).map(x=>x.document_id));
 for(const o of records){
  if(!o?.id||synced.has(o.id)||blocked.has(o.id))continue;
  const blob=await localPdf(o.id);if(!(blob instanceof Blob))continue;
  const path=ownerId+"/"+o.id+".pdf";
  const uploaded=await sb.storage.from(B).upload(path,blob,{contentType:"application/pdf",upsert:false});
  if(uploaded.error&&!/already exists|duplicate/i.test(uploaded.error.message||"")){console.warn("PDF Upload:",uploaded.error.message);continue}
  const{error:dbError}=await sb.from("portal_observations").upsert({
   owner_id:ownerId,document_id:o.id,game_key:o.gameKey||null,
   referee_id:o.referee||null,coach_id:o.coach||null,
   file_name:o.fileName||"Beobachtungsbogen.pdf",storage_path:path
  },{onConflict:"owner_id,document_id"});
  if(dbError){console.warn("PDF Metadaten:",dbError.message);continue}
 }
 const {data:all,error:err}=await sb.from("portal_observations").select("*").eq("owner_id",ownerId).order("created_at",{ascending:false});
 if(err)throw err;return all||[];
}
export function matchingGame(game,observation){
 return !!game&&!!observation&&String(game.referee_id||"")===String(observation.referee_id||"")&&String(game.coach_id||"")===String(observation.coach_id||"");
}
export async function linkObservation(ownerId,gameKey,docId){
 const {error:e}=await sb.from("portal_observations").update({game_key:gameKey}).eq("owner_id",ownerId).eq("document_id",docId);
 if(e)throw e;return updateGame(ownerId,gameKey,{pdf_id:docId,received_at:new Date().toISOString()});
}
export async function reassignObservation(ownerId,gameKey,docId){
 const {error}=await sb.rpc("portal_reassign_observation",{p_document_id:docId,p_game_key:gameKey});
 if(error)throw error;
 return true;
}
export async function deleteObservation(ownerId,docId){
 const{data:doc,error:readError}=await sb.from("portal_observations").select("document_id,storage_path").eq("owner_id",ownerId).eq("document_id",docId).single();
 if(readError||!doc)throw Error("Beobachtungsbogen nicht gefunden.");
 const{error:unlinkError}=await sb.rpc("portal_unlink_observation",{p_document_id:docId});
 if(unlinkError)throw unlinkError;
 const result=await deleteUnassignedObservation(ownerId,docId);
 const {error:tombstoneError}=await sb.from("portal_deleted_observations").upsert({owner_id:ownerId,document_id:docId},{onConflict:"owner_id,document_id"});
 if(tombstoneError)throw Error("Bogen gelöscht, aber die dauerhafte Löschmarkierung fehlt: "+tombstoneError.message);
 return result;
}
export async function deleteUnassignedObservation(ownerId,docId){
 const{data:doc,error:readError}=await sb.from("portal_observations").select("document_id,game_key,storage_path").eq("owner_id",ownerId).eq("document_id",docId).single();
 if(readError||!doc)throw Error("Bogen wurde nicht in Supabase gefunden.");
 const{data:games,error:gameError}=await sb.from("portal_games").select("game_key").eq("owner_id",ownerId).eq("pdf_id",docId);
 if(gameError)throw gameError;
 if(doc.game_key||(games||[]).length)throw Error("Zugeordnete Bögen können hier nicht gelöscht werden.");
 if(doc.storage_path){
  const{error:storageError}=await sb.storage.from(B).remove([doc.storage_path]);
  if(storageError)throw Error("PDF konnte nicht gelöscht werden: "+storageError.message);
 }
 const{data:deleted,error:deleteError}=await sb.from("portal_observations").delete().eq("owner_id",ownerId).eq("document_id",docId).is("game_key",null).select("document_id");
 if(deleteError)throw deleteError;
 if(!deleted?.length)throw Error("Der Bogen konnte nicht gelöscht werden. Bitte aktualisieren.");
 const key="msp-observation-assignments-"+ownerId;
 try{const list=JSON.parse(localStorage.getItem(key)||"[]");localStorage.setItem(key,JSON.stringify(list.filter(x=>x.id!==docId)))}catch{}
 return true;
}
export async function associateUniqueObservations(ownerId,games,observations){
 let changed=false;
 for(const o of observations){
  if(o.game_key||!o.referee_id||!o.coach_id)continue;
  const matches=games.filter(g=>matchingGame(g,o));
  if(matches.length!==1)continue;
  const g=matches[0];
  if(g.pdf_id&&g.pdf_id!==o.document_id)continue;
  try{await linkObservation(ownerId,g.game_key,o.document_id);changed=true}catch(e){console.warn("Bogen konnte nicht zugeordnet werden:",e)}
 }
 return changed;
}
export async function viewPdfBlob(ownerId,docId){
 const local=await localPdf(docId);if(local instanceof Blob)return local;
 const{data:record,error}=await sb.from("portal_observations").select("storage_path").eq("owner_id",ownerId).eq("document_id",docId).single();
 if(error||!record)throw Error("Keine interne Zuordnung gefunden.");
 const{data,error:storageError}=await sb.storage.from(B).download(record.storage_path);
 if(storageError)throw storageError;return data;
}
export function dateDE(value){
 if(!value)return "–";const s=String(value),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return m?m[3]+"."+m[2]+"."+m[1]:s;
}
export function dayDelta(date){
 const today=new Date(),todayIso=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
 return Math.round((Date.parse(date+"T12:00:00")-Date.parse(todayIso+"T12:00:00"))/86400000);
}
export function gameColor(game){
 if(game.sent_at||game.sent_manual_at)return "green";
 const delta=dayDelta(game.match_date);
 if(delta<=-5&&!game.received_at)return "red";
 if(delta>=0&&delta<=5)return "yellow";
 return "";
}
export function reminderBody(game){
 const deadline=new Date();deadline.setDate(deadline.getDate()+3);
 const fn=game.coach_first_name||"";
 return "Hallo "+fn+",\n\nzu deinem Coaching vom "+dateDE(game.match_date)+" bei der Begegnung "+game.home+" – "+game.away+" ist bislang noch kein Beobachtungsbogen bei uns eingegangen.\n\nBitte reiche ihn innerhalb der nächsten drei Tage, spätestens bis zum "+deadline.toLocaleDateString("de-DE")+", ein.\n\nVielen Dank für deine Unterstützung und deine geleistete Coachingarbeit!\n\nViele Grüße\nDaniel";
}
export function sendBody(game){
 return "Hallo "+(game.referee_name?.split(" ")[0]||"")+",\n\nanbei erhältst du den Beobachtungsbogen zu deinem Spiel "+game.home+" – "+game.away+" vom "+dateDE(game.match_date)+".\n\nViele Grüße\nDaniel";
}
export async function sendMail(gameKey,kind,subject,body){
 const{data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw Error("Bitte erneut anmelden.");
 const response=await fetch("/api/portal-mail",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+session.access_token},body:JSON.stringify({gameKey,kind,subject,body})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||"Versand nicht möglich.");return data;
}