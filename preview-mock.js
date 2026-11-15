// PR preview only: local, in-memory demo fixtures. No HTTP, no Supabase, no persistence.
(() => {
 const data = {
  companies:[
   { id:'company-demo-a', name:'Horizonte Obras', cnpj:'00.000.000/0001-00', status:'Ativa', city:'Fortaleza, CE' },
   { id:'company-demo-b', name:'Norte Claro Engenharia', cnpj:'11.111.111/0001-11', status:'Ativa', city:'Caucaia, CE' },
  ],
  profiles:[{id:'demo',full_name:'Conta de demonstração',role:'owner'}],
  sites:[
   {id:'site-a1',company_id:'company-demo-a',name:'Residencial Aurora',code:'HA-001',status:'Ativa',responsible_team:'Equipe Horizonte'},
   {id:'site-a2',company_id:'company-demo-a',name:'Centro Empresarial Atlântico',code:'HA-002',status:'Ativa',responsible_team:'Equipe Norte'},
   {id:'site-b1',company_id:'company-demo-b',name:'Parque das Dunas',code:'NC-001',status:'Ativa',responsible_team:'Equipe Dunas'},
  ],
  workers:[
   {id:'worker-a1',company_id:'company-demo-a',full_name:'Ana Beatriz Lima',role:'Técnica de segurança',site_id:'site-a1',status:'Ativo',sites:{name:'Residencial Aurora'}},
   {id:'worker-a2',company_id:'company-demo-a',full_name:'Rafael Nogueira',role:'Encarregado de obra',site_id:'site-a1',status:'Ativo',sites:{name:'Residencial Aurora'}},
   {id:'worker-a3',company_id:'company-demo-a',full_name:'Camila Freitas',role:'Engenheira civil',site_id:'site-a2',status:'Ativo',sites:{name:'Centro Empresarial Atlântico'}},
   {id:'worker-b1',company_id:'company-demo-b',full_name:'João Pedro Alves',role:'Técnico de segurança',site_id:'site-b1',status:'Ativo',sites:{name:'Parque das Dunas'}},
  ],
  inspections:[
   {id:'inspection-a1',company_id:'company-demo-a',code:'INS-A-001',checklist_type:'NR-18 — Canteiro',inspection_date:'2026-11-03',status:'COMPLETED',site_id:'site-a1',sites:{name:'Residencial Aurora'}},
   {id:'inspection-b1',company_id:'company-demo-b',code:'INS-B-001',checklist_type:'NR-06 — EPI',inspection_date:'2026-11-02',status:'COMPLETED',site_id:'site-b1',sites:{name:'Parque das Dunas'}},
  ],
  inspection_items:[],
  non_conformities:[
   {id:'nc-a1',company_id:'company-demo-a',code:'NC-A-001',site_id:'site-a1',sites:{name:'Residencial Aurora'},description:'Sinalização incompleta no acesso ao pavimento',priority:'HIGH',status:'OPEN',due_date:'2026-11-12',inspection_id:'inspection-a1'},
   {id:'nc-b1',company_id:'company-demo-b',code:'NC-B-001',site_id:'site-b1',sites:{name:'Parque das Dunas'},description:'Fichas de EPI aguardando atualização',priority:'MEDIUM',status:'IN_PROGRESS',due_date:'2026-11-15',inspection_id:'inspection-b1'},
  ]
 };
 let activeCompanyId='company-demo-a';
 const scoped=table=>table==='companies'||table==='profiles' ? (data[table]||[]) : (data[table]||[]).filter(row=>row.company_id===activeCompanyId);
 function refreshRelations(){
  for(const w of data.workers) w.sites=data.sites.find(s=>s.id===w.site_id)||null;
  for(const n of data.non_conformities) n.sites=data.sites.find(s=>s.id===n.site_id)||null;
  for(const i of data.inspections) i.sites=data.sites.find(s=>s.id===i.site_id)||null;
 }
 function builder(table){
  let mode='select', payload=null, filters=[], sort=null;
  const matches=row=>filters.every(([k,v])=>row[k]===v);
  const resolve=()=>{
   let rows=scoped(table).filter(matches);
   if(sort) rows=[...rows].sort((a,b)=>String(a[sort.key]||'').localeCompare(String(b[sort.key]||''))*(sort.ascending?1:-1));
   if(mode==='insert'){
    const items=Array.isArray(payload)?payload:[payload];
    rows=items.map((v,i)=>({...v,...(table==='companies'?{}:{company_id:v.company_id||activeCompanyId}),id:v.id||`demo-${table}-${Date.now()}-${i}`,...(table==='companies'?{}:{code:v.code||`DEMO-${Date.now()}`})}));
    (data[table] ||= []).push(...rows);refreshRelations();
   }else if(mode==='update'){rows.forEach(x=>Object.assign(x,payload));refreshRelations();}
   else if(mode==='delete'){
    const ids=new Set(rows.map(x=>x.id));
    if(table==='companies'){
     data.companies=data.companies.filter(x=>!ids.has(x.id));
     for(const t of ['sites','workers','inspections','inspection_items','non_conformities']) data[t]=(data[t]||[]).filter(x=>!ids.has(x.company_id));
     if(ids.has(activeCompanyId)) activeCompanyId=data.companies[0]?.id||'';
    }else if(table==='sites'){
     data.sites=data.sites.filter(x=>!ids.has(x.id));
     const inspectionIds=new Set(data.inspections.filter(x=>ids.has(x.site_id)).map(x=>x.id));
     const itemIds=new Set(data.inspection_items.filter(x=>inspectionIds.has(x.inspection_id)).map(x=>x.id));
     data.workers=data.workers.filter(x=>!ids.has(x.site_id));
     data.inspections=data.inspections.filter(x=>!ids.has(x.site_id));
     data.inspection_items=data.inspection_items.filter(x=>!inspectionIds.has(x.inspection_id));
     data.non_conformities=data.non_conformities.filter(x=>!ids.has(x.site_id)&&!inspectionIds.has(x.inspection_id)&&!itemIds.has(x.inspection_item_id));
    }else if(table==='inspections'){
     data.inspections=data.inspections.filter(x=>!ids.has(x.id));
     const itemIds=new Set(data.inspection_items.filter(x=>ids.has(x.inspection_id)).map(x=>x.id));
     data.inspection_items=data.inspection_items.filter(x=>!ids.has(x.inspection_id));
     data.non_conformities=data.non_conformities.filter(x=>!ids.has(x.inspection_id)&&!itemIds.has(x.inspection_item_id));
    }else data[table]=(data[table]||[]).filter(x=>!ids.has(x.id));
    refreshRelations();
   }
   return {data:rows,error:null};
  };
  const b={select(){return b},order(key,opts={}){sort={key,ascending:opts.ascending!==false};return b},eq(k,v){filters.push([k,v]);return b},insert(v){mode='insert';payload=v;return b},update(v){mode='update';payload=v;return b},delete(){mode='delete';return b},single(){const r=resolve();return Promise.resolve({...r,data:r.data[0]||null})},then(a,z){return Promise.resolve(resolve()).then(a,z)}};return b;
 }
 window.SST_PREVIEW_DEMO=true;
 window.SST_PREVIEW={
  companies:()=>data.companies.map(c=>({...c})),
  activeCompany:()=>data.companies.find(c=>c.id===activeCompanyId)||null,
  selectCompany(id){if(!data.companies.some(c=>c.id===id))return false;activeCompanyId=id;return true;},
  snapshot(){return JSON.parse(JSON.stringify({activeCompanyId,data}));},
  deleteRecord(table,id){return builder(table).delete().eq('id',id).select('id');},
  createCompany(company){return builder('companies').insert(company);}
 };
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'demo',email:'preview@example.invalid',user_metadata:{company_preview:true}}}}}),onAuthStateChange:()=>{},signOut:async()=>({error:null}),signInWithPassword:async()=>({error:null})},from:builder,storage:{from:()=>({upload:async()=>({error:{message:'Fotos desativadas na prévia'}}),getPublicUrl:()=>({data:null})})}})};
})();
