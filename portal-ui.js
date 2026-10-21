import{requireAdmin}from"/portal-workflow.js";
import{cloudPeople}from"/portal-people.js";
const nav=document.querySelector(".portal-sidebar,nav[aria-label='Hauptmenü']");

/* Mobile navigation: the main content remains full width while the menu is off-canvas. */
const mobileNavCss=document.createElement("style");
mobileNavCss.textContent=String.raw`
.portal-mobile-toggle,.portal-mobile-backdrop{display:none}
@media(max-width:767px){
  *,*::before,*::after{box-sizing:border-box}
  html,body{max-width:100%;overflow-x:hidden}
  body.portal-mobile-nav .portal-shell,
  body.portal-mobile-nav .shell{display:block!important;grid-template-columns:none!important;width:100%!important;max-width:100%!important;min-width:0!important;min-height:0!important}
  body.portal-mobile-nav .portal-content{width:100%!important;max-width:100%!important;min-width:0!important}
  body.portal-mobile-nav main,
  body.portal-mobile-nav .portal-content main{display:block;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:12px!important}
  body.portal-mobile-nav main section,
  body.portal-mobile-nav main .card{max-width:100%!important;min-width:0!important;overflow-wrap:anywhere}
  body.portal-mobile-nav header{padding:13px 12px 13px 64px!important;min-height:60px;box-sizing:border-box}
  body.portal-mobile-nav header h1{font-size:clamp(17px,5vw,24px);line-height:1.25;margin:0}
  body.portal-mobile-nav nav[aria-label="Hauptmenü"]{
    position:fixed!important;inset:0 auto 0 0!important;
    display:flex!important;flex-direction:column!important;gap:4px;
    width:min(84vw,320px)!important;max-width:320px!important;height:100dvh!important;
    overflow-y:auto!important;overflow-x:hidden!important;
    padding:64px 12px 20px!important;
    background:#fff!important;border-right:1px solid #dce5ee;
    z-index:1301!important;box-shadow:12px 0 35px #142b4629;
    transform:translateX(-110%);transition:transform .2s ease;
    visibility:hidden;
  }
  body.portal-mobile-nav.portal-menu-open nav[aria-label="Hauptmenü"]{transform:translateX(0);visibility:visible}
  body.portal-mobile-nav nav[aria-label="Hauptmenü"] a{font-size:15px!important;padding:11px 12px!important;flex:none}
  body.portal-mobile-nav .person-submenu{flex:none}
  body.portal-mobile-nav .person-submenu a{font-size:13px!important;padding:8px 10px!important}
  body.portal-mobile-nav .portal-mobile-toggle{
    display:flex;position:fixed;top:10px;left:12px;z-index:1303;
    width:44px;height:44px;align-items:center;justify-content:center;
    padding:0;margin:0;border:1px solid #ffffff55;border-radius:8px;
    background:#142b46;color:white;font:28px/1 system-ui,sans-serif;
    cursor:pointer;box-shadow:0 2px 5px #0002;
  }
  body.portal-mobile-nav .portal-mobile-backdrop{
    display:none;position:fixed;inset:0;z-index:1300;
    width:100%;height:100%;margin:0;padding:0;
    border:0;border-radius:0;background:#142b4680;
  }
  body.portal-mobile-nav.portal-menu-open .portal-mobile-backdrop{display:block}
  body.portal-mobile-nav.portal-menu-open{overflow:hidden}
  body.portal-mobile-nav .portal-data-scroll{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  body.portal-mobile-nav .portal-data-scroll table{min-width:max-content}
  body.portal-mobile-nav input,body.portal-mobile-nav select,body.portal-mobile-nav textarea{max-width:100%}
  body:has(#dashboard[hidden]) .portal-mobile-toggle{display:none!important}
}
@media(prefers-reduced-motion:reduce){
 body.portal-mobile-nav nav[aria-label="Hauptmenü"]{transition:none!important}
}`;
document.head.append(mobileNavCss);
if(nav){
 document.body.classList.add("portal-mobile-nav");
 nav.id=nav.id||"portal-main-menu";
 const menuBtn=document.createElement("button");
 menuBtn.type="button";menuBtn.className="portal-mobile-toggle";menuBtn.textContent="☰";
 menuBtn.setAttribute("aria-label","Menü öffnen");
 menuBtn.setAttribute("aria-controls",nav.id);
 menuBtn.setAttribute("aria-expanded","false");
 const backdrop=document.createElement("button");
 backdrop.type="button";backdrop.className="portal-mobile-backdrop";
 backdrop.setAttribute("aria-label","Menü schließen");
 document.body.append(backdrop,menuBtn);
 const setMenu=open=>{
   const isOpen=Boolean(open)&&window.matchMedia("(max-width:767px)").matches;
   document.body.classList.toggle("portal-menu-open",isOpen);
   menuBtn.setAttribute("aria-expanded",String(isOpen));
   menuBtn.setAttribute("aria-label",isOpen?"Menü schließen":"Menü öffnen");
   menuBtn.textContent=isOpen?"×":"☰";
   if(isOpen){nav.removeAttribute("inert");}
 };
 menuBtn.addEventListener("click",()=>setMenu(!document.body.classList.contains("portal-menu-open")));
 backdrop.addEventListener("click",()=>setMenu(false));
 nav.addEventListener("click",e=>{if(e.target.closest("a"))setMenu(false)});
 document.addEventListener("keydown",e=>{if(e.key==="Escape")setMenu(false)});
 window.addEventListener("resize",()=>{if(window.innerWidth>767)setMenu(false)});
 // Keep wide tables scrollable inside their own area rather than widening the phone page.
 for(const table of document.querySelectorAll("main table")){
   if(table.closest(".scroll,.portal-data-scroll"))continue;
   const wrap=document.createElement("div");wrap.className="portal-data-scroll";
   table.parentNode.insertBefore(wrap,table);wrap.append(table);
 }
}

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
    const people=await cloudPeople(user.id,type);
    const cmp=(a,b)=>String(a||"").localeCompare(String(b||""),"de",{sensitivity:"base"});
    const firstName=p=>String(p.first||p.name?.trim().split(/\s+/)[0]||"").trim();
    const lastName=p=>String(p.last||p.name?.trim().split(/\s+/).at(-1)||"").trim();
    const personSort=(a,b)=>{
      const key=type==="referee"?"msp-referee-sort-mode":"msp-coach-sort-mode";
      const mode=localStorage.getItem(key)==="first"?"first":"last";
      const primary=mode==="first"?firstName:lastName;
      const secondary=mode==="first"?lastName:firstName;
      return cmp(primary(a),primary(b))||cmp(secondary(a),secondary(b))||cmp(a.name,b.name);
    };
    const wrap=document.createElement("div");wrap.className="person-submenu";
    wrap.setAttribute("aria-label",type==="referee"?"Schiedsrichter-Untermenü":"Coaches-Untermenü");
    const renderSubmenu=()=>{
      wrap.replaceChildren();
      for(const p of [...people].sort(personSort)){
        const a=document.createElement("a");a.href=(type==="referee"?"/schiedsrichter-profil.html?id=":"/coach-beobachter-profil.html?id=")+encodeURIComponent(p.id);
        a.textContent=p.name||[p.first,p.last].filter(Boolean).join(" ")||"Unbenannt";
        if(new URLSearchParams(location.search).get("id")===p.id)a.setAttribute("aria-current","page");
        wrap.append(a);
      }
      if(!people.length){const empty=document.createElement("span");empty.className="none";empty.textContent="Noch keine Einträge";wrap.append(empty)}
    };
    renderSubmenu();
    main.insertAdjacentElement("afterend",wrap);
    window.addEventListener(type==="referee"?"msp-referee-sort-change":"msp-coach-sort-change",renderSubmenu);
  }catch(e){console.warn("Untermenü:",e.message)}
 }
}