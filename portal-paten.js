import {sb,requireAdmin} from "/portal-workflow.js";
const table="portal_paten";
async function verify(userId,kind){
 const user=await requireAdmin();
 const {data:{user:current},error}=await sb.auth.getUser();
 if(error||!current||current.id!==userId||kind!=="pate")throw Error("Kein Zugriff auf Paten.");
}
export async function cloudPeople(userId,kind){
 await verify(userId,kind);
 const {data,error}=await sb.from(table).select("person_id,details,created_at").eq("owner_id",userId).eq("kind",kind);
 if(error)throw error;
 return (data||[]).map(x=>({...x.details,id:x.person_id,createdAt:x.created_at}));
}
export async function saveCloudPerson(userId,kind,person){
 await verify(userId,kind);
 const {error}=await sb.from(table).upsert({owner_id:userId,kind,person_id:person.id,details:person,updated_at:new Date().toISOString()},{onConflict:"owner_id,kind,person_id"});
 if(error)throw error;
 return cloudPeople(userId,kind);
}
export async function deleteCloudPerson(userId,kind,id){
 await verify(userId,kind);
 const {error}=await sb.from(table).delete().eq("owner_id",userId).eq("kind",kind).eq("person_id",id);
 if(error)throw error;
 return cloudPeople(userId,kind);
}
