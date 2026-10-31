import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Idempotent remote database bootstrap for CI. No secrets are committed.
const NAME='azeroth-radar-db',CONFIG='wrangler.jsonc';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function listedDatabases(payload) {
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.databases))return payload.databases;
  if(Array.isArray(payload?.result))return payload.result;
  throw Error('Unexpected D1 list format');
}
export function matchDatabase(payload,name=NAME){
  const matches=listedDatabases(payload).filter(x=>x?.name===name);
  if(matches.length>1)throw Error('Duplicate D1 database names found');
  if(!matches.length)return null;
  const id=matches[0].uuid||matches[0].id||matches[0].database_id;
  if(typeof id!=='string'||!UUID.test(id))throw Error('Invalid D1 UUID');
  return id;
}
export function withDatabaseId(config,id){
  if(!UUID.test(id))throw Error('Invalid database ID');
  if(!Array.isArray(config?.d1_databases))throw Error('Missing D1 config');
  const entries=config.d1_databases.map(d=>d.binding==='DB'&&d.database_name===NAME?
    {...d,database_id:id}:d);
  if(!entries.some(x=>x.binding==='DB'&&x.database_id===id))
    throw Error('Expected DB binding missing');
  return {...config,d1_databases:entries};
}
function wrangler(args){
  return execFileSync('npx',['--yes','wrangler@4',...args],{
    encoding:'utf8',timeout:90000,env:process.env,
    stdio:['ignore','pipe','pipe'],maxBuffer:2*1024*1024
  });
}
function queryId(){return matchDatabase(JSON.parse(wrangler(['d1','list','--json'])));}
function main(){
  if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
    throw Error('Set Cloudflare GitHub Actions secrets first');
  const config=JSON.parse(fs.readFileSync(CONFIG,'utf8'));
  let id=queryId();
  if(!id){
    try{wrangler(['d1','create',NAME,'--location','eeur']);}
    catch(e){
      id=queryId();
      if(!id)throw Error('D1 create failed; check D1 Edit permission');
    }
    if(!id)id=queryId();
  }
  if(!id)throw Error('D1 database ID not returned after creation');
  fs.writeFileSync(CONFIG,JSON.stringify(withDatabaseId(config,id),null,2)+'\n');
  console.log('Cloudflare database ready: '+NAME+'; D1 binding configured in temporary checkout.');
  if(process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### Cloudflare D1 bootstrap\n\nDatabase prepared and bound for the Worker.\n\n');
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].split('/').pop())){
  try{main();}catch(e){console.error('D1 bootstrap:',e.message);process.exitCode=1;}
}
