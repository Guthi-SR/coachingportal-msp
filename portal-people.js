import {sb,requireAdmin} from "/portal-workflow.js";
const localKey=(userId,kind)=>(kind==="coach"?"msp-coach-draft-":"msp-admin-draft-")+userId;
export async function cloudPeople(userId,kind){
 const {data,error}=await sb.from("portal_people").select("person_id,details").eq("owner_id",userId).eq("kind",kind);
 if(error)throw error;
 const people=(data||[]).map(x=>({...x.details,id:x.person_id}));
 const key=localKey(userId,kind);
 let local={refs:[],docs:[]};try{local=JSON.parse(localStorage.getItem(key)||"{}")||local}catch{}
 const stored=Array.isArray(local.refs)?local.refs:[];
 const present=new Set(people.map(x=>x.id));
 const missing=stored.filter(x=>x?.id&&!present.has(x.id));
 if(missing.length){
  const {error:e}=await sb.from("portal_people").upsert(missing.map(p=>({owner_id:userId,kind,person_id:p.id,details:p})),{onConflict:"owner_id,kind,person_id"});
  if(e)throw e;
  people.push(...missing);
 }
 localStorage.setItem(key,JSON.stringify({...local,refs:people}));
 return people;
}
export async function saveCloudPerson(userId,kind,person){
 const {error}=await sb.from("portal_people").upsert({owner_id:userId,kind,person_id:person.id,details:person,updated_at:new Date().toISOString()},{onConflict:"owner_id,kind,person_id"});
 if(error)throw error;
 return cloudPeople(userId,kind);
}
export async function deleteCloudPerson(userId,kind,id){
 const {error}=await sb.from("portal_people").delete().eq("owner_id",userId).eq("kind",kind).eq("person_id",id);
 if(error)throw error;
 const key=localKey(userId,kind);try{const local=JSON.parse(localStorage.getItem(key)||"{}");local.refs=(local.refs||[]).filter(x=>x.id!==id);localStorage.setItem(key,JSON.stringify(local))}catch{}
 return cloudPeople(userId,kind);
}
