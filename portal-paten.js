import {loadStaff,saveStaff} from "/portal-staff.js";
export async function cloudPeople(userId,kind){if(kind!=="pate")throw Error("Ungültige Funktion");return (await loadStaff(userId)).filter(p=>p.isPate);}
export async function saveCloudPerson(userId,kind,person){if(kind!=="pate")throw Error("Ungültige Funktion");const old=(await loadStaff(userId)).find(p=>p.id===person.id);await saveStaff(userId,{...old,...person,isCoach:old?.isCoach??false,everCoach:old?.everCoach??false,isPate:true});return cloudPeople(userId,kind);}
export async function deleteCloudPerson(userId,kind,id){if(kind!=="pate")throw Error("Ungültige Funktion");const old=(await loadStaff(userId)).find(p=>p.id===id);if(old)await saveStaff(userId,{...old,isPate:false});return cloudPeople(userId,kind);}
