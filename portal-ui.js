import{requireAdmin}from"/portal-workflow.js";
import{cloudPeople}from"/portal-people.js";
const nav=document.querySelector(".portal-sidebar,nav[aria-label='Hauptmenü']");
if(nav){
 const style=document.createElement("style");style.textContent=".person-submenu{padding:2px 4px 6px 16px;display:flex;flex-direction:column;gap:2px}.person-submenu a{padding:7px 9px!important;font-size:13px;line-height:1.3;white-space:normal;overflow-wrap:anywhere}.person-submenu a[aria-current='page']{font-weight:700;background:#e8f0f8}.person-submenu .none{font-size:12px;color:#62768a;padding:6px 8px}";
 document.head.append(style);
 const links=[...nav.querySelectorAll("a")];
 const capture=links.find(x=>x.getAttribute("href")==="/beobachtungsbogen-erfassen.html");
 if(capture&&!links.some(x=>x.getAttribute("href")==="/beobachtungsboegen.html")){
   const link=document.createElement("a");link.href="/beobachtungsboegen.html";link.textContent="Beobachtungsbögen";
   if(location.pathname==="/beobachtungsboegen.html")link.setAttribute("aria-current","page");
   capture.insertAdjacentElement("afterend",link);
 }
 const path=location.pathname;
 const type=path.startsWith("/schiedsrichter")?"referee":path.startsWith("/coach-beobachter")?"coach":null;
 if(type){
  const main=links.find(x=>x.getAttribute("href")===(type==="referee"?"/schiedsrichter.html":"/coach-beobachter.html"));
  if(main)try{
    const{user}=await requireAdmin();
    const people=(await cloudPeople(user.id,type)).sort((a,b)=>(a.name||a.last||"").localeCompare(b.name||b.last||"","de"));
    const wrap=document.createElement("div");wrap.className="person-submenu";
    wrap.setAttribute("aria-label",type==="referee"?"Schiedsrichter-Untermenü":"Coaches-Untermenü");
    for(const p of people){
      const a=document.createElement("a");a.href=(type==="referee"?"/schiedsrichter-profil.html?id=":"/coach-beobachter-profil.html?id=")+encodeURIComponent(p.id);
      a.textContent=p.name||[p.first,p.last].filter(Boolean).join(" ")||"Unbenannt";
      if(new URLSearchParams(location.search).get("id")===p.id)a.setAttribute("aria-current","page");
      wrap.append(a);
    }
    if(!people.length){const empty=document.createElement("span");empty.className="none";empty.textContent="Noch keine Einträge";wrap.append(empty)}
    main.insertAdjacentElement("afterend",wrap);
  }catch(e){console.warn("Untermenü:",e.message)}
 }
}