const express=require('express'); const path=require('path'); const app=express();
app.use(express.json()); app.use(express.static(path.join(__dirname,'src')));
app.get('/api/v1/health',(req,res)=>res.json({success:true,data:{app:'SST Intelligence',version:'1.0-MVP',status:'online'}}));
app.listen(3000,()=>console.log('SST Intelligence running on http://localhost:3000'));
