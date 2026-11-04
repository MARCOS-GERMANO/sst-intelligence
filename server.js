const express=require('express'); const path=require('path'); const fs=require('fs'); const app=express();
app.use(express.json());
// Isolated preview: never connects to Supabase, even if the service inherited settings.
if (process.env.IS_PULL_REQUEST === 'true') {
  // Keep the real project configuration inaccessible on PR preview URLs.
  app.get(['/config.js','/config.example.js'],(_req,res)=>res.status(404).type('text/plain').send('Not found'));
  app.get(['/', '/index.html'],(_req,res)=>{
    let html=fs.readFileSync(path.join(__dirname,'src','index.html'),'utf8');
    html=html.replace('<body>','<body><div style="padding:12px;background:#ffedba;color:#482b00;text-align:center;font:700 13px Arial">PRÉVIA ISOLADA · dados fictícios, sem conexão ao banco</div>');
    html=html.replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>','<script src="/preview-mock.js"></script>');
    html=html.replace('<script src="config.js"></script>','<script>window.SUPABASE_URL="preview";window.SUPABASE_ANON_KEY="preview";</script>');
    html=html.replace("if ('serviceWorker' in navigator)","if (false)");res.type('html').send(html);
  });
  app.get('/preview-mock.js',(_req,res)=>res.sendFile(path.join(__dirname,'preview-mock.js')));
}
app.use(express.static(path.join(__dirname,'src')));
app.get('/api/v1/health',(req,res)=>res.json({success:true,data:{app:'SST Intelligence',version:'1.0-MVP',status:'online'}}));
app.listen(process.env.PORT || 3000,()=>console.log('SST Intelligence running'));
