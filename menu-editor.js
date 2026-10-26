import{requireAdmin,sb}from"/portal-workflow.js";
const nav=document.querySelector("#portal-main-menu");
if(nav){
 const key="msp-menu-layout-v1";
 const groups=["portal-administration-menu","portal-templates-menu","portal-json-menu"];
 const root=()=>[...nav.children].filter(x=>x.matches("a,details")&&x.id!=="menu-editor");
 const id=x=>x.matches("a")?"link:"+new URL(x.href).pathname:x.id;
 const all=()=>[...root(),...groups.flatMap(g=>[...nav.querySelectorAll("#"+g+" .person-submenu > a")])];
 const applyOrder=order=>{if(!Array.isArray(order))return;const items=new Map(all().map(x=>[id(x),x]));for(const entry of order){const item=items.get(entry.id);if(!item)continue;const parent=entry.parent==="root"?nav:document.querySelector("#"+entry.parent+" .person-submenu");if(parent)parent.append(item);items.delete(entry.id)}};
 const readOrder=()=>all().map(x=>({id:id(x),parent:x.parentElement===nav?"root":x.closest("details")?.id||"root"}));
 try{const {data,error}=await sb.from("portal_navigation_layout").select("layout").eq("id",1).maybeSingle();if(error)throw error;if(data?.layout)applyOrder(data.layout)}catch(e){console.warn("Menüanordnung konnte nicht geladen werden",e)}
 const save=async()=>{const {error}=await sb.from("portal_navigation_layout").upsert({id:1,layout:readOrder(),updated_at:new Date().toISOString()});if(error)throw error;};
 let isAdmin=false;try{await requireAdmin();isAdmin=true}catch(_){}
 if(isAdmin){
 const style=document.createElement("style");style.textContent="#menu-editor{padding:8px 4px;border-bottom:1px solid #ddd;margin-bottom:8px}#menu-editor button{margin:3px;padding:7px;border:1px solid #aab;border-radius:6px;background:white;color:#142b46;cursor:pointer}.menu-editing a,.menu-editing details{cursor:grab!important}.menu-editing .menu-drop{outline:2px dashed #1684b8;outline-offset:2px}.menu-editing .person-submenu{min-height:30px;border:1px dashed #aac;padding:6px}";document.head.append(style);
 const bar=document.createElement("div");bar.id="menu-editor";
 const toggle=document.createElement("button");toggle.type="button";toggle.textContent="Menü bearbeiten";
 const saveBtn=document.createElement("button");saveBtn.type="button";saveBtn.textContent="Speichern";saveBtn.hidden=true;
 const reset=document.createElement("button");reset.type="button";reset.textContent="Standard wiederherstellen";reset.hidden=true;
 bar.append(toggle,saveBtn,reset);nav.prepend(bar);
 let editing=false,dragged=null;
 const targets=()=>[nav,...groups.map(g=>nav.querySelector("#"+g+" .person-submenu")).filter(Boolean)];
 const setEdit=v=>{editing=v;nav.classList.toggle("menu-editing",v);toggle.textContent=v?"Abbrechen":"Menü bearbeiten";saveBtn.hidden=reset.hidden=!v;for(const x of all())x.draggable=v;for(const g of groups){const el=nav.querySelector("#"+g);if(el&&v)el.open=true}};
 const draw=()=>{for(const x of all()){x.addEventListener("dragstart",e=>{if(!editing)return;e.stopPropagation();dragged=x;e.dataTransfer.effectAllowed="move"});x.addEventListener("dragover",e=>{if(!editing||!dragged||x===dragged||x.contains(dragged))return;e.preventDefault();e.stopPropagation();x.classList.add("menu-drop")});x.addEventListener("dragleave",()=>x.classList.remove("menu-drop"));x.addEventListener("drop",e=>{if(!editing||!dragged||x===dragged||dragged.contains(x))return;e.preventDefault();e.stopPropagation();x.classList.remove("menu-drop");x.before(dragged)});x.addEventListener("dragend",()=>{dragged=null;nav.querySelectorAll(".menu-drop").forEach(y=>y.classList.remove("menu-drop"))})}for(const parent of targets()){parent.addEventListener("dragover",e=>{if(editing&&dragged&&!dragged.contains(parent)){e.preventDefault();e.stopPropagation()}});parent.addEventListener("drop",e=>{if(editing&&dragged&&!dragged.contains(parent)){e.preventDefault();e.stopPropagation();parent.append(dragged)}})}};
 draw();
 toggle.onclick=()=>{if(editing){location.reload()}else setEdit(true)};
 saveBtn.onclick=async()=>{saveBtn.disabled=true;try{await save();setEdit(false);alert("Menüanordnung für alle Geräte gespeichert.")}catch(e){alert("Speichern fehlgeschlagen: "+e.message)}finally{saveBtn.disabled=false}};
 reset.onclick=()=>{if(confirm("Menüanordnung auf Standard zurücksetzen?")){sb.from("portal_navigation_layout").delete().eq("id",1).then(({error})=>{if(error)alert(error.message);else location.reload()})}};
 }
}
