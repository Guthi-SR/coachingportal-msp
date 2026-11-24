import {sb,requireAdmin} from "/portal-workflow.js";
import {cloudPeople} from "/portal-people.js";
async function verify(ownerId){const {user}=await requireAdmin();if(user.id!==ownerId)throw Error("Kein Zugriff auf diese Personalverwaltung.");}
export async function loadStaff(ownerId){await verify(ownerId);return cloudPeople(ownerId,"coach","all");}
export async function saveStaff(ownerId,person){await verify(ownerId);const {id,createdAt,isCoach,isPate,everCoach,...details}=person;
 const row={owner_id:ownerId,kind:"coach",person_id:id,details,staff_coach:!!isCoach,staff_pate:!!isPate,staff_ever_coach:!!(everCoach||isCoach),updated_at:new Date().toISOString()};
 const {error}=await sb.from("portal_people").upsert(row,{onConflict:"owner_id,kind,person_id"});if(error)throw error;
 return loadStaff(ownerId);
}
export const roleLabel=p=>[p.isCoach!==false?"Coach-Beobachter":"",p.isPate?"Pate":""].filter(Boolean).join(" · ")||"Ohne aktive Funktion";
