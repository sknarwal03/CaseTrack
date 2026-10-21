import{a as e}from"./firebase-functions-D3hq5K6S.js";import{d as t,f as n,p as r}from"./shared-layout-QhUR6W1D.js";var i=[],a=()=>i,o=null,s=(e,t)=>{let n={};return e.forEach(e=>{let r=String(e[t]||``).trim()||`Unspecified`;n[r]=(n[r]||0)+1}),Object.entries(n).sort((e,t)=>t[1]-e[1]).slice(0,5)},c=()=>{let e=s(t(a()),`caseStatus`),n=Math.max(...e.map(([,e])=>e),1),r=document.querySelector(`#statusBarChart`);r&&(r.innerHTML=o?`<p class="empty-state">Could not load FIR and proceeding records.</p>`:e.length?e.map(([e,t])=>`
        <div class="bar-row">
            <div class="bar-label">${e}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${t/n*100}%"></div></div>
            <div class="bar-value">${t}</div>
        </div>
    `).join(``):`<p class="empty-state">No case data yet.</p>`)},l=()=>{let e=s(a().filter(r),`caseStage`),t=Math.max(...e.map(([,e])=>e),1),n=document.querySelector(`#stageBarChart`);n&&(n.innerHTML=o?`<p class="empty-state">Could not load FIR and proceeding records.</p>`:e.length?e.map(([e,n])=>`
        <div class="bar-row">
            <div class="bar-label">${e}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${n/t*100}%"></div></div>
            <div class="bar-value">${n}</div>
        </div>
    `).join(``):`<p class="empty-state">No stage data yet.</p>`)},u=(e,n)=>{let i=document.querySelector(`#${e}`);if(!i)return;let c=s(n===`policeStation`?t(a()):a().filter(r),n);i.innerHTML=o?`<li><span>Could not load records</span><span>—</span></li>`:c.length?c.map(([e,t])=>`
        <li>
            <span>${e}</span>
            <span>${t}</span>
        </li>
    `).join(``):`<li><span>No data</span><span>0</span></li>`},d=()=>{let e=a(),n=e.filter(r),i=t(e);document.querySelector(`#reportTotalCases`).textContent=o?`—`:i.length,document.querySelector(`#reportDisposed`).textContent=o?`—`:i.filter(e=>String(e.firStatus).toLowerCase()===`disposed`).length,document.querySelector(`#reportPending`).textContent=o?`—`:i.filter(e=>[`UI`,`UT`,`UCR`,`Untrace`,`Cancelled`,`Cancellation`].includes(String(e.firStatus).trim())).length,document.querySelector(`#reportHearings`).textContent=o?`—`:n.filter(e=>e.nextDate).length},f=()=>{c(),l(),u(`courtList`,`courtNumber`),u(`policeList`,`policeStation`),d()},p=async()=>{try{i=await n(e),o=null}catch(e){console.error(`Error loading FIR and proceeding records:`,e),o=e,i=[]}f()};p(),window.addEventListener(`caseAdded`,p);