// Preview only: no network, all data ephemeral and fictional.
(() => {
 const data = {
 profiles:[{id:'demo',full_name:'Prévia de demonstração',role:'tecnico'}],
 sites:[{id:'demo-site', name:'Obra exemplo',code:'EX-001',status:'Ativa',responsible_team:'Equipe exemplo'}],
 workers:[{id:'demo-worker',full_name:'Profissional exemplo',role:'Técnico',status:'Ativo',sites:{name:'Obra exemplo'}}],
 inspections:[],non_conformities:[],inspection_items:[]
 };
 function builder(table) {
  let mode='select', payload=null, filters=[];
  const resolve=() => {
   let rows=data[table] || [];
   if(mode==='insert'){const items=Array.isArray(payload)?payload:[payload]; rows=items.map((v,i)=>({...v,id:`local-${Date.now()}-${i}`,code:`EX-${Date.now()}`})); (data[table] ||= []).push(...rows);}
   else if(mode==='update'){rows=rows.filter(x=>filters.every(([k,v])=>x[k]===v));rows.forEach(x=>Object.assign(x,payload));}
   else rows=rows.filter(x=>filters.every(([k,v])=>x[k]===v));
   return {data:rows,error:null};
  };
  const b={select(){return b},order(){return b},eq(k,v){filters.push([k,v]);return b},insert(v){mode='insert';payload=v;return b},update(v){mode='update';payload=v;return b},single(){const r=resolve();return Promise.resolve({...r,data:r.data[0]||null})},then(a,z){return Promise.resolve(resolve()).then(a,z)}};return b;
 }
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'demo',email:'preview@example.invalid'}}}}),onAuthStateChange:()=>{},signOut:async()=>({error:null}),signInWithPassword:async()=>({error:null})},from:builder,storage:{from:()=>({upload:async()=>({error:{message:'Fotos desativadas na prévia'}}),getPublicUrl:()=>({data:null})})}})};
})();
