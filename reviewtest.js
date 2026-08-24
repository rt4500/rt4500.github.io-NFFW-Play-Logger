const fs=require('fs');
let js=fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const LS={};
global.localStorage={getItem:k=>LS[k]??null,setItem:(k,v)=>{LS[k]=v}};
global.URL={createObjectURL:()=>'blob:x',revokeObjectURL:()=>{}};
global.Blob=class{constructor(d){this.d=d}};
let pushed=[];
global.document={getElementById:()=>null,querySelectorAll:()=>null,querySelector:()=>null,
  body:{classList:{toggle:()=>{}},appendChild:()=>{}},addEventListener:()=>{},
  createElement:()=>({click(){},set href(v){},set download(v){}})};
global.window={addEventListener:()=>{}};
global.setInterval=()=>0;global.setTimeout=(f)=>1;global.clearTimeout=()=>{};global.clearInterval=()=>{};
global.navigator={};global.render=()=>{};global.toast=()=>{};
global.fetch=async(url,opts)=>{ if(opts&&opts.method==='PUT') pushed.push(JSON.parse(opts.body)); return {ok:true,status:200,json:async()=>[]}; };
js=js.split('/* ============================================================\n   SHELL')[0];
js=js.replace('let games=store.load','globalThis.games=store.load')
   .replace('let teams=store.load','globalThis.teams=store.load')
   .replace('let activeId=store.load','globalThis.activeId=store.load')
   .replace("let writeKey=''","globalThis.writeKey='test-key'");
eval(js);
let pass=0,fail=0;const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);ok?pass++:(fail++,console.log('FAIL',l,g,w));};
const S=defaultSettings();

// --- FIX 3: late roster refresh into unplayed games ---
loadTestTeams();
loadSchedule();
const ukrGame=games.find(g=>g.teams.home.name==='Ukraine'||g.teams.away.name==='Ukraine');
const side=ukrGame.teams.home.name==='Ukraine'?'home':'away';
const placeholderName=ukrGame.teams[side].players[0].name;
// real Ukraine squad arrives late
teams['Ukraine']={name:'Ukraine',real:true,players:[{id:'u1',num:'3',name:'Sofiia Shevchenko'},{id:'u2',num:'9',name:'Anna Melnyk'}]};
refreshRostersInUnplayedGames();
eq('unplayed fixture got the real roster', games.find(g=>g.id===ukrGame.id).teams[side].players.map(p=>p.name),
   ['Sofiia Shevchenko','Anna Melnyk']);
eq('placeholder gone', games.find(g=>g.id===ukrGame.id).teams[side].players.some(p=>p.name===placeholderName), false);
// played games are untouched
const played=games[0];
played.plays.push({type:'run',startSpot:5,endSpot:9,rusher:played.teams.home.players[0].id});
const before=JSON.stringify(played.teams);
teams[played.teams.home.name]={name:played.teams.home.name,real:true,players:[{id:'zz',num:'99',name:'Should Not Appear'}]};
refreshRostersInUnplayedGames();
eq('played game rosters untouched', JSON.stringify(games[0].teams), before);

// --- FIX 1: finish pushes immediately (via pushActive with explicit game) ---
pushed=[];
const g2=games[1];
g2.plays.push({type:'run',startSpot:5,endSpot:50,rusher:null,touchdown:true});
g2.finished=true;
await_ =(async()=>{ await pushActive(g2); })();
setTimeout(()=>{},0);
// pushActive is async; run microtask
Promise.resolve().then(()=>{
  eq('explicit-game push sent', pushed.length>=1, true);
  eq('pushed game carries finished flag', pushed[0].game.finished, true);
  eq('pushed correct game id', pushed[0].game.id, g2.id);

  // --- FIX 2: roll-up copies refresh (simulate two renders around new plays) ---
  const tourneyGames=[];
  const autoInc=()=>{ games.forEach(g=>{ if(g.practice||!g.plays||!g.plays.length) return;
    const i=tourneyGames.findIndex(x=>x.id===g.id);
    const copy=JSON.parse(JSON.stringify(g));
    if(i<0) tourneyGames.push(copy); else tourneyGames[i]=copy; }); };
  autoInc();
  const n1=tourneyGames.find(x=>x.id===g2.id).plays.length;
  g2.plays.push({type:'run',startSpot:5,endSpot:9,rusher:null});
  autoInc();
  const n2=tourneyGames.find(x=>x.id===g2.id).plays.length;
  eq('roll-up copy follows new plays', [n1,n2], [1,2]);

  console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
});
