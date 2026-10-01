/* Worker health is sampled state, not a completion count. Missing observations stay unknown. */
(function () {
  const chart=document.getElementById('activity-chart');
  if(!chart)return;
  const endpoint='https://raw.githubusercontent.com/ufo-files/homepage/live-inventory/agent-health.json';
  const roles=['Translations','Transcriptions','OCR','Downloaders','Publisher'];
  const labels={running:'Running',idle:'Idle · healthy',blocked:'Blocked / retrying',offline:'Offline',unknown:'Unknown'};
  const patterns={running:'',idle:'10 6',blocked:'3 3',offline:'16 4 3 4',unknown:'1 8'};
  let feed;
  const node=(tag,attrs,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n;};
  const valid=data=>data?.schemaVersion===2 && Array.isArray(data.groups);
  const utc=at=>new Date(at*1000).toISOString().replace('T',' ').slice(0,16)+' UTC';
  function render(){
    const end=Date.now()/1000,start=end-86400,x=t=>150+(t-start)/86400*730;
    const ttl=Math.min(900,Math.max(0,Number(feed?.validForSeconds)||0));
    const svg=node('svg',{viewBox:'0 0 1100 430',role:'group','aria-labelledby':'activity-svg-title activity-svg-desc'});
    svg.append(node('title',{id:'activity-svg-title'},'Project worker health over the last 24 hours'));
    svg.append(node('desc',{id:'activity-svg-desc'},'One timeline per worker group. Running means the service is active, not necessarily completing a job. Patterns identify running, healthy idle, blocked or retrying, offline, and unknown. Observations expire after 15 minutes. Unobserved history remains unknown. Hover or focus a segment for its observation time.'));
    const highlight=name=>svg.querySelectorAll('[data-agent]').forEach(n=>n.style.opacity=name&&n.dataset.agent!==name?'.2':'1');
    roles.forEach((name,i)=>{
      const y=65+i*57;
      const values=(feed?.groups.find(g=>g.name===name)?.observations||[])
        .filter(o=>Array.isArray(o)&&Number.isFinite(o[0])&&o[0]<=end&&labels[o[1]]).sort((a,b)=>a[0]-b[0]);
      const latest=values.at(-1),fresh=latest&&end-latest[0]<=ttl;
      const current=fresh?latest[1]:'unknown';
      const row=node('g',{'data-agent':name});
      row.append(node('text',{x:138,y:y+4,'text-anchor':'end',fill:'currentColor'},name));
      row.append(node('line',{x1:150,x2:880,y1:y,y2:y,stroke:'currentColor','stroke-dasharray':patterns.unknown,opacity:'.35'}));
      values.forEach((o,j)=>{
        const from=Math.max(start,o[0]),to=Math.min(end,o[0]+ttl,values[j+1]?.[0]??end);
        if(to<=from)return;
        const line=node('line',{x1:x(from),x2:x(to),y1:y,y2:y,stroke:'currentColor','stroke-width':5,'stroke-dasharray':patterns[o[1]],'stroke-linecap':'butt',tabindex:0,'data-state':o[1],'aria-label':`${name}: ${labels[o[1]]}; observed ${utc(o[0])}`});
        line.append(node('title',{},`${name}: ${labels[o[1]]} · observed ${utc(o[0])}`));
        line.addEventListener('pointerenter',()=>highlight(name));line.addEventListener('pointerleave',()=>highlight(null));
        line.addEventListener('focus',()=>highlight(name));line.addEventListener('blur',()=>highlight(null));row.append(line);
      });
      const text=node('text',{x:900,y:y+4,fill:'currentColor',tabindex:0,'data-series-label':name,'aria-label':`${name}: ${labels[current]}`},labels[current]);
      const counts=fresh?latest[2]||{}:{};
      const mixed=counts.running && ['blocked','offline'].includes(current);
      if(mixed)text.append(node('tspan',{x:900,dy:15},'Others running'));
      text.append(node('title',{},(latest?'Last observed '+utc(latest[0]):'No health observations recorded')+(fresh?'':' · current activity unknown')));
      text.addEventListener('pointerenter',()=>highlight(name));text.addEventListener('pointerleave',()=>highlight(null));
      text.addEventListener('focus',()=>highlight(name));text.addEventListener('blur',()=>highlight(null));row.append(text);svg.append(row);
    });
    for(let i=0;i<=4;i++){
      const at=start+i*21600;
      svg.append(node('text',{x:x(at),y:345,'text-anchor':i===0?'start':i===4?'end':'middle',fill:'currentColor'},i===4?'Now':new Date(at*1000).toISOString().slice(11,16)+' UTC'));
    }
    svg.append(node('text',{x:150,y:370,fill:'currentColor'},'Last 24 hours'));
    Object.entries(labels).forEach(([state,label],i)=>{
      const left=150+i*172;
      svg.append(node('line',{x1:left,x2:left+28,y1:407,y2:407,stroke:'currentColor','stroke-width':3,'stroke-dasharray':patterns[state]}));
      svg.append(node('text',{x:left+35,y:411,fill:'currentColor'},state==='blocked'?'Blocked':state==='idle'?'Idle':label));
    });
    chart.replaceChildren(svg);
  }
  async function refresh(){
    try {
      const response=await fetch(endpoint+'?t='+Math.floor(Date.now()/60000),{cache:'no-store'});
      if(!response.ok)throw Error();const next=await response.json();if(!valid(next))throw Error();
      if(!feed||Date.parse(next.generatedAt)>=Date.parse(feed.generatedAt))feed=next;
    }catch(error){/* Old observations expire visibly even if refresh fails. */}
    render();
  }
  (async()=>{try{const r=await fetch('agent-health.json',{cache:'no-store'});const data=await r.json();if(r.ok&&valid(data))feed=data;}catch(error){}render();refresh();})();
  setInterval(refresh,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
