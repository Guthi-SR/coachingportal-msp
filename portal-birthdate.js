/* Show a stored referee birthday and calculate age on Germany's calendar date. */
export function refereeBirthDetails(raw,asOf=new Date()){
  const input=String(raw??"").trim();
  const iso=input.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  const german=input.match(/^([0-9]{2})\.([0-9]{2})\.([0-9]{4})$/);
  if(!iso&&!german)return {birthday:null,age:null};
  const year=Number(iso?iso[1]:german[3]);
  const month=Number(iso?iso[2]:german[2]);
  const day=Number(iso?iso[3]:german[1]);
  const check=new Date(0);
  check.setUTCFullYear(year,month-1,day);
  if(!year||check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day){
    return {birthday:null,age:null};
  }
  const parts=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(asOf);
  const dateParts=Object.fromEntries(parts.filter(p=>p.type==="year"||p.type==="month"||p.type==="day").map(p=>[p.type,Number(p.value)]));
  const age=dateParts.year-year-(dateParts.month<month||(dateParts.month===month&&dateParts.day<day)?1:0);
  if(age<0)return {birthday:null,age:null};
  const birthday=String(day).padStart(2,"0")+"."+String(month).padStart(2,"0")+"."+String(year).padStart(4,"0");
  return {birthday,age};
}
