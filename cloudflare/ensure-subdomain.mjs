// One-time, idempotent setup of the account-level *.workers.dev hostname.
// Does not change an existing subdomain. No tokens or account identifiers are logged.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Cloudflare deployment authentication not configured');
const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/subdomain';

async function call(method,body){
  let response;
  try{
    response=await fetch(url,{method,headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json',
      Accept:'application/json','User-Agent':'AzerothRadar-Cloudflare-Deploy/1.0'
    },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  }catch{throw Error('Cloudflare subdomain API network error');}
  let data={};
  try{data=await response.json();}catch{}
  return {status:response.status,ok:response.ok&&data.success===true,data};
}
let current=await call('GET');
let subdomain=current.data?.result?.subdomain||'';
if(subdomain){
  console.log('Existing account workers.dev subdomain found and preserved.');
}else{
  if(current.status!==404 && !current.ok)
    throw Error('Could not read Cloudflare account subdomain (HTTP '+current.status+'); cannot safely configure it.');
  for(const name of ['azeroth-radar-gorthax','gorthax-azeroth-radar','azeroth-radar-gorthax-2026']){
    const created=await call('PUT',{subdomain:name});
    if(created.ok){
      subdomain=created.data.result?.subdomain||name;
      console.log('Registered a new account workers.dev subdomain.');
      break;
    }
    if(created.status===401||created.status===403)
      throw Error('Cloudflare token lacks Workers Scripts Write permission to register workers.dev subdomain');
    if(created.status!==400&&created.status!==409)
      throw Error('Cloudflare workers.dev subdomain registration failed: HTTP '+created.status);
  }
  if(!subdomain)throw Error('Cloudflare workers.dev name unavailable; set one in Cloudflare dashboard');
}
if(!/^[a-z0-9-]{2,60}$/.test(subdomain))throw Error('Unexpected Cloudflare workers.dev hostname');
console.log('Expected website URL: https://azeroth-radar.'+subdomain+'.workers.dev/');
if(process.env.GITHUB_STEP_SUMMARY){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '### Cloudflare Workers address\n\nhttps://azeroth-radar.'+subdomain+'.workers.dev/\n\n');
}
