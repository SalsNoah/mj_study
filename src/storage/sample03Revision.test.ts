import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import oldContent from '@/data/fixtures/sample03-2026-10-05.3.json';
import removalStorage from '@/data/fixtures/sample03-prior-removal-storage.json';
import oldStorage from '@/data/fixtures/sample03-prior-catalog-storage.json';
import { createSampleProblems, samplesAlreadyPresent } from '@/data/samples';
import { contentFingerprint } from '@/data/sampleIdentity';
import { getSampleUpdatePreview, getSampleRemovalPreview } from '@/data/sampleCatalog';
import { reviseSample03 } from '@/data/sample03Revision';
import { emptyStore, LIMITS, type Problem, type Store } from '@/domain/types';
import { LocalStorageRepository } from './repository';
const KEY = 'mahjong-study:v1';
let repo: LocalStorageRepository;
beforeEach(() => { localStorage.clear(); repo = new LocalStorageRepository(KEY); });
afterEach(() => { repo.dispose(); vi.restoreAllMocks(); });
function fixture(): Store {
  const problems = createSampleProblems().problems.map((p, i) => ({ ...p, id: `p${i}`, tagIds: ['tag'], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' }));
  const { sampleId, contentVersion, ...content } = oldContent;
  const old = { ...problems[2]!, ...structuredClone(content), tagIds: ['tag'] } as Problem;
  old.sample = { catalogId: 'mahjong-study-samples', version: contentVersion, itemId: sampleId, fingerprint: contentFingerprint(old, [], ['サンプル']) };
  problems[2] = old;
  return { ...emptyStore(), revision: 4, problems, tags: [{id:'tag',name:'サンプル'}],
    study: problems.map(p => ({problemId:p.id,contentRevision:3,confirmationCount:2,lastConfirmedAt:'2026-10-01T00:00:00Z',understanding:'understood',lastReviewedAt:'2026-10-01T00:00:00Z',lastSolvedAt:null,lastCorrectAt:null,inTest:false})),
    attempts:[{id:'old-answer',problemId:'p2',contentRevision:3,sessionId:'s',questionIndex:0,at:'2026-10-01T00:00:00Z',result:'correct',selectedTile:'4s'}], daily:{'2026-10-01':{tested:1,confirmed:2}},
  };
}
const seed = (store: Store) => localStorage.setItem(KEY, JSON.stringify(store));
function load() { const r=repo.load(); if(!r.ok)throw Error(r.reason); return r.store; }
it('corrects once with the same ID, timestamps, history, references, other nine problems and study fields', () => {
  const before=fixture(); seed(before);const writes=vi.spyOn(Storage.prototype,'setItem');
  const after=load();expect(writes).toHaveBeenCalledTimes(1);expect(after.revision).toBe(5);expect(after.problems).toHaveLength(10);
  const old=before.problems[2]!,next=after.problems[2]!;
  expect(next).toMatchObject({id:old.id,createdAt:old.createdAt,updatedAt:old.updatedAt,tagIds:old.tagIds,acceptedDiscards:['2s']});
  expect(after.problems.filter(p=>p.id!=='p2')).toEqual(before.problems.filter(p=>p.id!=='p2'));
  expect(after.study).toEqual(before.study.map(s=>s.problemId==='p2'?{...s,contentRevision:4}:s));
  expect(after.attempts).toEqual(before.attempts);expect(after.daily).toEqual(before.daily);expect(after.tags).toEqual(before.tags);
  const raw=localStorage.getItem(KEY);repo.dispose();repo=new LocalStorageRepository(KEY);expect(load()).toEqual(after);expect(localStorage.getItem(KEY)).toBe(raw);expect(writes).toHaveBeenCalledTimes(1);
  expect(reviseSample03(after)).toBe(after);expect(getSampleUpdatePreview(after).additions).toBe(0);expect(samplesAlreadyPresent(after)).toBe(true);
});
it.each(['title','concealed','drawn','melds','doraIndicators','answerEnabled','acceptedDiscards','explanation','privateMemo','context','attachments','sourceUrl','tagIds','tagName','unknown','identity'])(
  'does not overwrite any edited %s or add a duplicate revision', field => {
    const store=fixture(),p=store.problems[2]!;
    const edits:Record<string,unknown>={title:'自分の題名',concealed:[...p.concealed.slice(0,-1),'8s'],drawn:'9s',melds:[{id:'mine'}],doraIndicators:['1z'],answerEnabled:false,acceptedDiscards:['1s'],explanation:'本人解説',privateMemo:'本人メモ',context:{...p.context,turn:6},attachments:[{id:'mine'}],sourceUrl:'https://example.com/mine',tagIds:['tag','extra']};
    if(field==='tagName')store.tags[0]!.name=' サンプル';
    else if(field==='unknown')(p as unknown as Record<string,unknown>).futureField=true;
    else if(field==='identity')p.sample!.fingerprint='not-original';
    else (p as unknown as Record<string,unknown>)[field]=edits[field];
    const raw=JSON.stringify(store);expect(reviseSample03(store)).toBe(store);expect(JSON.stringify(store)).toBe(raw);
    if(field!=='identity'){expect(getSampleUpdatePreview(store).additions).toBe(0);expect(samplesAlreadyPresent(store)).toBe(true);}
    expect(getSampleRemovalPreview(store).candidates.some(item=>item.id===p.id)).toBe(false);
  });
it.each(['missing','duplicate','negative','overflow','duplicate problem','duplicate tag','future attempt'])('skips ambiguous or invalid %s state',kind=>{
  const store=fixture();
  if(kind==='missing')store.study=store.study.filter(s=>s.problemId!=='p2');
  if(kind==='duplicate')store.study.push({...store.study[2]!});
  if(kind==='negative')store.study[2]!.contentRevision=-1;
  if(kind==='overflow')store.study[2]!.contentRevision=Number.MAX_SAFE_INTEGER;
  if(kind==='duplicate problem')store.problems.push({...store.problems[2]!});
  if(kind==='duplicate tag')store.tags.push({...store.tags[0]!});
  if(kind==='future attempt')store.attempts[0]!.contentRevision=4;
  expect(reviseSample03(store)).toBe(store);
});
it('never resurrects a removed problem, or overwrite edits made after the correction',()=>{
  const before=fixture();before.problems=before.problems.filter(p=>p.id!=='p2');seed(before);expect(load().problems).toEqual(before.problems);expect(load().attempts).toEqual(before.attempts);
  const revised=reviseSample03(fixture());const p=revised.problems[2]!;p.privateMemo='訂正後の本人編集';p.acceptedDiscards=['4s'];seed(revised);expect(load().problems[2]).toEqual(p);expect(getSampleUpdatePreview(load()).additions).toBe(0);
});
it.each(['replace','merge'] as const)('corrects an old JSON %s without regrading its answers',mode=>{
  seed(emptyStore());const current=load();const old=fixture();const r=repo.importJson(current,JSON.stringify(old),mode);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
  const p=r.store.problems.find(p=>p.sample?.itemId==='sample-v2-03')!;expect(p.acceptedDiscards).toEqual(['2s']);
  expect(r.store.study.find(s=>s.problemId===p.id)!.contentRevision).toBe(4);
  expect(r.store.attempts[0]).toMatchObject({problemId:p.id,contentRevision:3,result:'correct',selectedTile:'4s'});
  expect(load().problems).toEqual(r.store.problems);
});
it('replacing repeatedly from the same old backup does not bump its content revision twice',()=>{
  seed(emptyStore());let current=load();for(let i=0;i<2;i++){const r=repo.importJson(current,JSON.stringify(fixture()),'replace');if(!r.ok)throw Error(r.reason);current=r.store;expect(current.study[2]!.contentRevision).toBe(4);expect(current.problems).toHaveLength(10);}
});
it.each(['quota','access','size','conflict'])('keeps the old store on correction %s failure',kind=>{
  const before=fixture();if(kind==='size')before.problems[0]!.privateMemo='x'.repeat(LIMITS.storageMaxBytes);seed(before);const raw=localStorage.getItem(KEY);
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;let expected=raw;
  if(kind==='quota'||kind==='access')vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw kind==='quota'?new DOMException('quota','QuotaExceededError'):new Error('denied');});
  if(kind==='conflict'){let reads=0;vi.spyOn(Storage.prototype,'getItem').mockImplementation(function(this: Storage, key){if(key===KEY&&++reads===3){const external={...before,settings:{autoSort:false}};expected=JSON.stringify(external);set.call(this,KEY,expected);}return get.call(this,key);});}
  expect(repo.load().ok).toBe(false);expect(get.call(localStorage,KEY)).toBe(expected);
});
it.each([false,true])('uses actual old catalog snapshots for undo without treating automatic correction as an edit (later edit=%s)',edited=>{
  for(const [key,value]of Object.entries(oldStorage))localStorage.setItem(key,value);
  const snapshotKey=Object.keys(oldStorage).find(k=>k.includes(':sample-catalog-backup:'))!;const originalSnapshot=localStorage.getItem(snapshotKey);
  const migrated=load();const p=migrated.problems.find(p=>p.sample?.itemId==='sample-v2-03')!;expect(p.acceptedDiscards).toEqual(['2s']);
  let current=migrated;if(edited){const r=repo.saveProblem(current,{...p,privateMemo:'移行後の本人メモ'},false);if(!r.ok)throw Error(r.reason);current=r.store;}
  const receipt=current.sampleCatalogUpdates![0]!;const r=repo.restoreSampleCatalog(current,receipt.id);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
  expect(r.store.problems).toHaveLength(edited?1:0);if(edited)expect(r.store.problems[0]!.privateMemo).toBe('移行後の本人メモ');
  expect(localStorage.getItem(snapshotKey)).toBe(originalSnapshot);expect(load().problems).toEqual(r.store.problems);
});

it('does not make a user-edited old provenance removable even if its content matches the new catalog',()=>{
  const old=fixture(),edited=reviseSample03(old);edited.problems[2]!.sample=old.problems[2]!.sample;
  expect(reviseSample03(edited)).toBe(edited);
  expect(getSampleUpdatePreview(edited).additions).toBe(0);
  expect(getSampleRemovalPreview(edited).candidates.some(p=>p.id==='p2')).toBe(false);
});

it('restores an actually deleted old sample with the same ID and keeps old answer results on their old revision',()=>{
  for(const [key,value]of Object.entries(removalStorage))localStorage.setItem(key,value);
  const before=load();expect(before.problems).toHaveLength(0);const oldAttempt=before.attempts[0]!;
  const receipt=before.sampleCatalogUpdates!.at(-1)!;const r=repo.restoreSampleCatalog(before,receipt.id);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.reason);
  const problem=r.store.problems.find(p=>p.id===oldAttempt.problemId)!;expect(problem.acceptedDiscards).toEqual(['2s']);
  expect(r.store.attempts).toEqual(before.attempts);expect(r.store.daily).toEqual(before.daily);
  expect(r.store.study.find(s=>s.problemId===problem.id)).toMatchObject({contentRevision:1,confirmationCount:2});
  expect(oldAttempt).toMatchObject({contentRevision:0,result:'correct',selectedTile:'4s'});expect(load().problems).toHaveLength(10);
});

it('retains the raw tag-edit exclusion through merge normalization and repeated reloads',()=>{
  const incoming=fixture();incoming.tags[0]!.name=' サンプル ';
  seed(emptyStore());const result=repo.importJson(load(),JSON.stringify(incoming),'merge');if(!result.ok)throw Error(result.reason);
  const p=result.store.problems.find(p=>p.sample?.itemId==='sample-v2-03')!;
  expect(p.acceptedDiscards).toEqual(['4s']);expect(p.sample!.correctionSkipped).toBe('sample03-2026-10-07.1');
  expect(result.store.tags[0]!.name).toBe('サンプル');
  for(let i=0;i<2;i++){const current=load();expect(current.problems.find(x=>x.id===p.id)).toEqual(p);expect(getSampleUpdatePreview(current).additions).toBe(0);}
  expect(getSampleRemovalPreview(load()).candidates.some(x=>x.id===p.id)).toBe(false);
});
it('preserves a historical tag edit when catalog restore rebinds it to a normalized tag',()=>{
  // Recreate a valid historical snapshot containing the old tag spelling; digest is not an authentication key.
  const saved=structuredClone(removalStorage) as Record<string,string>;
  const main=JSON.parse(saved[KEY]!) as Store;const receipt=main.sampleCatalogUpdates!.at(-1)!;
  const snapshotKey=`${KEY}:sample-catalog-backup:${receipt.id}`;const snap=JSON.parse(saved[snapshotKey]!);
  snap.before.tags[0].name=' サンプル ';main.tags[0]!.name='サンプル';
  const canonical=(value:unknown)=>JSON.stringify(value,(_k,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
  const text=canonical(snap);let a=0x811c9dc5,b=0x9e3779b9;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),0x01000193);b=Math.imul(b^text.charCodeAt(i),0x85ebca6b);}
  receipt.snapshotDigest=`v1:${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
  saved[KEY]=JSON.stringify(main);saved[snapshotKey]=JSON.stringify(snap);for(const[k,v]of Object.entries(saved))localStorage.setItem(k,v);
  const result=repo.restoreSampleCatalog(load(),receipt.id);if(!result.ok)throw Error(result.reason);
  const p=result.store.problems.find(p=>p.sample?.itemId==='sample-v2-03')!;
  expect(p.acceptedDiscards).toEqual(['4s']);expect(p.sample!.correctionSkipped).toBe('sample03-2026-10-07.1');
  expect(load().problems.find(x=>x.id===p.id)).toEqual(p);expect(getSampleUpdatePreview(load()).additions).toBe(0);
});
