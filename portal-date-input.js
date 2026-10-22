/* German date fields: type 14051984 -> 14.05.1984.
   Digits are inserted as TT.MM.JJJJ; database date validation remains in the forms. */
export function formatGermanDateInput(raw){
 const digits=String(raw??"").replace(/\D/g,"").slice(0,8);
 let result=digits.slice(0,2);
 if(digits.length>=2)result+=".";
 result+=digits.slice(2,4);
 if(digits.length>=4)result+=".";
 return result+digits.slice(4,8);
}
function digitsBefore(text,position){
 return String(text).slice(0,position).replace(/\D/g,"").length;
}
export function attachGermanDateInput(input){
 if(!input||input.dataset.dateMaskAttached==="true")return;
 input.dataset.dateMaskAttached="true";
 input.inputMode="numeric";
 input.maxLength=10;
 input.setAttribute("autocomplete","off");
 input.setAttribute("placeholder","TT.MM.JJJJ");
 function apply(digits,leftDigits){
  const formatted=formatGermanDateInput(digits);
  const old=input.value;
  if(old!==formatted)input.value=formatted;
  const left=formatGermanDateInput(String(digits).replace(/\D/g,"").slice(0,leftDigits)).length;
  if(typeof input.setSelectionRange==="function")input.setSelectionRange(left,left);
 }
 input.addEventListener("input",()=>{
  const original=input.value;
  const cursor=input.selectionStart??original.length;
  apply(original,digitsBefore(original,cursor));
 });
 input.addEventListener("beforeinput",e=>{
  if(e.inputType!=="deleteContentBackward"||input.selectionStart!==input.selectionEnd)return;
  const caret=input.selectionStart??0;
  if(!caret||input.value[caret-1]!==".")return;
  e.preventDefault();
  const digits=input.value.replace(/\D/g,"");
  const before=digitsBefore(input.value,caret);
  apply(digits.slice(0,before-1)+digits.slice(before),before-1);
 });
}
export function attachPersonDateInputs(){
 for(const id of ["birth","since"])attachGermanDateInput(document.getElementById(id));
}
