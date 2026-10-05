import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,act,tick,view} from '../src/game.mjs';
function setup(N=6){
 const g=createGame({code:'BAL',hostId:'p0',rng:()=>.73,timing:{transition:0},players:Array.from({length:N},(_,i)=>({id:'p'+i,name:'P'+i}))});
 act(g,'p0',{type:'start'},0);
 for(const p of g.players)act(g,p.id,{type:'vote',targetId:'p0'},1);
 return g;
}
const vote=(g,id,station)=>act(g,id,{type:'chooseStation',station,phaseId:g.phaseId},2);
function search(g,round=0){
 g.round=round;
 const station=['hospital','workshop','research','isolation'][round];
 for(const p of g.players)vote(g,p.id,station);
 for(const p of g.players.slice(1))act(g,p.id,{type:'chooseGroup',group:'away',phaseId:g.phaseId},3);
}
test('station captain counts twice but cannot override the majority; repeat/stale votes rejected',()=>{
 const g=setup();const phaseId=g.phaseId;
 vote(g,'p0','hospital');
 assert.equal(g.phase,'station');
 assert.throws(()=>vote(g,'p0','signal'),/已经投/);
 vote(g,'p1','hospital');
 for(const p of g.players.slice(2))vote(g,p.id,'signal');
 assert.equal(g.station[0],'signal');
 assert.equal(g.phase,'planning');
 assert.throws(()=>act(g,'p2',{type:'chooseStation',station:'signal',phaseId},3));
});
test('weighted vote distinguishes a 3 versus 3 headcount',()=>{
 const g=setup();
 for(const p of g.players)vote(g,p.id,Number(p.id.slice(1))<3?'hospital':'signal');
 assert.equal(g.station[0],'hospital');
});
test('one tied revote then captain decision, including zero-vote timeouts',()=>{
 const g=setup(7);
 const tie=()=>{for(const p of g.players)vote(g,p.id,Number(p.id.slice(1))<3?'hospital':'signal');};
 const old=g.phaseId;tie();
 assert.equal(g.phase,'station');assert.equal(g.stationRevote,true);assert.notEqual(g.phaseId,old);
 assert.throws(()=>act(g,'p0',{type:'chooseStation',station:'hospital',phaseId:old},3),/过期/);
 tie();assert.equal(g.stationDecision,true);
 assert.throws(()=>vote(g,'p1','signal'),/车长/);
 vote(g,'p0','hospital');assert.equal(g.phase,'planning');
 const empty=setup();tick(empty,empty.deadline);tick(empty,empty.deadline);
 assert.equal(empty.stationDecision,true);tick(empty,999999);assert.equal(empty.phase,'station');
});
test('station deadline ignores nonvoters and departed voters, captain replacement resets ballots',()=>{
 const g=setup();vote(g,'p0','hospital');vote(g,'p1','signal');
 act(g,'p1',{type:'leave'},3);tick(g,g.deadline);assert.equal(g.station[0],'hospital');
 const h=setup();vote(h,'p0','hospital');h.players[0].online=false;tick(h,3);
 assert.equal(h.phase,'election');
 for(const p of h.players)act(h,p.id,{type:'vote',targetId:'p1'},4);
 assert.equal(h.phase,'station');assert.deepEqual(h.stationVotes,{});
});
test('key and device have separate first-round claims; devices appear only rounds one and three',()=>{
 const g=setup();search(g);
 for(const p of g.players.slice(1,3)){p.node=3;p.ap=4;}
 act(g,'p1',{type:'search',round:1,step:3,choice:'keyitem_key'},4);
 act(g,'p2',{type:'search',round:1,step:3,choice:'keyitem_device'},4);
 assert.ok(g.players[1].bag.some(x=>x.type==='key'));
 assert.ok(g.players[2].bag.some(x=>x.type==='device'));
 g.players[3].node=3;
 assert.throws(()=>act(g,'p3',{type:'search',round:1,step:3,choice:'keyitem_device'},4),/不存在/);
 for(const round of [1,2,3]){
  const h=setup();search(h,round);h.players[1].node=3;
  const opts=view(h,'p1').actions.find(a=>a.type==='search').fields[0].options.map(x=>x.value);
  assert.equal(opts.includes('keyitem_device'),round===2);
  assert.equal(opts.includes('keyitem_key'),round===2);
 }
});
test('both third-round stops offer one independent backup key at 2 AP',()=>{
 for(const station of ['research','school']){
  const g=setup();g.round=2;
  for(const p of g.players)vote(g,p.id,station);
  for(const p of g.players.slice(1))act(g,p.id,{type:'chooseGroup',group:'away',phaseId:g.phaseId},3);
  for(const p of g.players.slice(1,4)){p.node=3;p.ap=4;}
  act(g,'p1',{type:'search',round:3,step:3,choice:'keyitem_key'},4);
  assert.equal(g.players[1].ap,2);
  assert.ok(g.players[1].bag.some(x=>x.type==='key'));
  assert.throws(()=>act(g,'p2',{type:'search',round:3,step:3,choice:'keyitem_key'},4));
  assert.equal(g.players[2].ap,4);
  act(g,'p2',{type:'search',round:3,step:3,choice:'keyitem_device'},4);
  assert.ok(g.players[2].bag.some(x=>x.type==='device'));
 }
});
test('ration gives one food while other supplies still give two, all cost one AP',()=>{
 for(const [type,resource,amount] of [['ration','food',1],['toolkit','parts',2],['fuelcan','fuel',2]]){
  const g=setup();search(g);const p=g.players[1];p.ap=3;
  p.bag.push({id:'supply',type,label:type});const before=g.resources[resource];
  act(g,p.id,{type:'use',itemId:'supply'},4);
  assert.equal(g.resources[resource]-before,amount);assert.equal(p.ap,2);
  assert.ok(!p.bag.some(x=>x.id==='supply'));
  assert.throws(()=>act(g,p.id,{type:'use',itemId:'supply'},5));assert.equal(p.ap,2);
 }
});
test('resource fluctuation has a strict 20 percent boundary, at most one unit, and actual quest counts',()=>{
 for(const [choice,resource,base] of [['fuel','fuel',2],['parts','parts',2],['deepparts','parts',4],['food','food',2]]){
  for(const roll of [.199999,.2]){
   const g=setup();search(g);const p=g.players[1];p.role='bystander';p.ap=6;p.node=choice==='food'?1:0;
   const before=g.resources[resource];g.rng=()=>roll;
   act(g,p.id,{type:'search',round:1,step:p.node,choice},4);
   const expected=base+(roll<.2?(resource==='fuel'?1:-1):0);
   assert.equal(g.resources[resource]-before,expected);assert.equal(p.counts[resource],expected);
  }
 }
});
test('round three return installation spends remaining AP and matures for round four',()=>{
 const g=setup();search(g,2);const p=g.players[1];
 p.sealAbility=true;p.ap=4;p.node=3;
 act(g,p.id,{type:'search',round:3,step:3,choice:'keyitem_device'},4);
 for(const q of g.players)act(g,q.id,{type:'done',phaseId:g.phaseId},5);
 assert.equal(g.phase,'therapy');assert.equal(p.ap,2);
 assert.ok(view(g,p.id).actions.some(a=>a.type==='install'));
 act(g,p.id,{type:'install'},6);assert.equal(p.ap,0);assert.equal(g.device.round,3);
 assert.throws(()=>act(g,p.id,{type:'install'},7));
 p.bag.push({id:'key',type:'key'});g.phase='search';p.group='train';p.ap=2;
 assert.throws(()=>act(g,p.id,{type:'activate'},8));
 g.round=4;g.station=['isolation'];
 act(g,p.id,{type:'activate'},9);assert.equal(g.activation,g.device.id);
});
test('return install cannot spend future AP, run after done, or run in another round',()=>{
 for(const mode of ['insufficient','done','wrongRound']){
  const g=setup();search(g,2);const p=g.players[1];
  g.phase='therapy';p.sealAbility=true;p.ap=mode==='insufficient'?1:2;
  p.done=mode==='done';if(mode==='wrongRound')g.round=2;
  p.bag.push({id:'device',type:'device'});
  const before=JSON.stringify([p.ap,p.bag]);
  assert.throws(()=>act(g,p.id,{type:'install'},6));
  assert.equal(JSON.stringify([p.ap,p.bag]),before);assert.equal(g.device,undefined);
 }
});
