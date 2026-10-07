import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import oldContent from '@/data/fixtures/sample03-2026-10-05.3.json';
import removalStorage from '@/data/fixtures/sample03-prior-removal-storage.json';
import oldStorage from '@/data/fixtures/sample03-prior-catalog-storage.json';
import { createSampleProblems, samplesAlreadyPresent } from '@/data/samples';
import { contentFingerprint } from '@/data/sampleIdentity';
import { getSampleUpdatePreview, getSampleRemovalPreview } from '@/data/sampleCatalog';
import { isUneditedPriorSample03 } from '@/data/sample03Revision';
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
it('retires only old 03 with a verified backup and preserves all learning and other nine cards', () => {
  const before=fixture(); seed(before);const writes=vi.spyOn(Storage.prototype,'setItem');
  const after=load();expect(writes).toHaveBeenCalledTimes(2);expect(after.revision).toBe(5);
  expect(after.problems).toEqual(before.problems.filter(p=>p.id!=='p2'));
  expect(after.study).toEqual(before.study);expect(after.attempts).toEqual(before.attempts);
  expect(after.daily).toEqual(before.daily);expect(after.tags).toEqual(before.tags);
  const receipt=after.sampleCatalogUpdates![0]!;const exported=repo.exportSampleCatalogSnapshot(receipt.id);
  expect(exported.ok).toBe(true);if(exported.ok)expect(JSON.parse(exported.text)).toEqual(before);
  const raw=localStorage.getItem(KEY);expect(load()).toEqual(after);expect(localStorage.getItem(KEY)).toBe(raw);expect(writes).toHaveBeenCalledTimes(2);
  expect(getSampleUpdatePreview(after).additions).toBe(1);expect(samplesAlreadyPresent(after)).toBe(false);
});
it('restores the removed old card with the same ID, timestamps and answers, and does not retire it again',()=>{
  const before=fixture();seed(before);const retired=load();const r=repo.restoreSampleCatalog(retired,retired.sampleCatalogUpdates![0]!.id);if(!r.ok)throw Error(r.reason);
  const old=r.store.problems.find(p=>p.id==='p2')!;
  expect({...old,sample:before.problems[2]!.sample}).toEqual(before.problems[2]);
  expect(old.sample!.retirementSkipped).toBe('sample03-2026-10-07.1');
  expect(r.store.study).toEqual(before.study);expect(r.store.attempts).toEqual(before.attempts);expect(r.store.daily).toEqual(before.daily);
  expect(load().problems).toEqual(r.store.problems);expect(getSampleUpdatePreview(load()).additions).toBe(0);
});
it('adds the revised 03 only on request, with a new ID and fresh learning, without reconnecting old answers',()=>{
  const before=fixture();seed(before);const retired=load();const r=repo.updateSampleCatalog(retired,[]);if(!r.ok)throw Error(r.reason);
  const next=r.store.problems.find(p=>p.sample?.itemId==='sample-v2-03')!;
  expect(next.id).not.toBe('p2');expect(next.acceptedDiscards).toEqual(['2s']);
  expect(r.store.study.find(s=>s.problemId===next.id)!.contentRevision).toBe(0);
  expect(r.store.study.find(s=>s.problemId==='p2')).toEqual(before.study[2]);expect(r.store.attempts).toEqual(before.attempts);
  expect(getSampleUpdatePreview(r.store).additions).toBe(0);
  const restored=repo.restoreSampleCatalog(r.store,retired.sampleCatalogUpdates![0]!.id);if(!restored.ok)throw Error(restored.reason);
  expect(restored.preservedCopies).toBe(1);expect(restored.store.problems).toHaveLength(11);
  expect(restored.store.problems.find(p=>p.id===next.id)).toEqual(next);expect(load().problems).toHaveLength(11);
});
it.each(['title','concealed','drawn','melds','doraIndicators','answerEnabled','acceptedDiscards','explanation','privateMemo','context','attachments','sourceUrl','tagIds','tagName','unknown','identity'])(
  'does not overwrite any edited %s or add a duplicate revision', field => {
    const store=fixture(),p=store.problems[2]!;
    const edits:Record<string,unknown>={title:'自分の題名',concealed:[...p.concealed.slice(0,-1),'8s'],drawn:'9s',melds:[{id:'mine'}],doraIndicators:['1z'],answerEnabled:false,acceptedDiscards:['1s'],explanation:'本人解説',privateMemo:'本人メモ',context:{...p.context,turn:6},attachments:[{id:'mine'}],sourceUrl:'https://example.com/mine',tagIds:['tag','extra']};
    if(field==='tagName')store.tags[0]!.name=' サンプル';
    else if(field==='unknown')(p as unknown as Record<string,unknown>).futureField=true;
    else if(field==='identity')p.sample!.fingerprint='not-original';
    else (p as unknown as Record<string,unknown>)[field]=edits[field];
    const raw=JSON.stringify(store);expect(isUneditedPriorSample03(store.problems[2]!,store)).toBe(false);expect(JSON.stringify(store)).toBe(raw);
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
  expect(isUneditedPriorSample03(store.problems[2]!,store)).toBe(false);
});
it('never resurrects an already removed problem or changes the revised catalog',()=>{
  const before=fixture();before.problems=before.problems.filter(p=>p.id!=='p2');seed(before);expect(load().problems).toEqual(before.problems);expect(load().attempts).toEqual(before.attempts);
  const revised=fixture();revised.problems[2]={...createSampleProblems().problems[2]!,id:'p2',tagIds:['tag']};seed(revised);expect(load().problems).toEqual(revised.problems);
});
it.each(['replace','merge'] as const)('backs up and retires an old JSON %s on the next load without regrading answers',mode=>{
  seed(emptyStore());const old=fixture();const r=repo.importJson(load(),JSON.stringify(old),mode);if(!r.ok)throw Error(r.reason);
  const p=r.store.problems.find(p=>p.sample?.itemId==='sample-v2-03')!;expect(p.acceptedDiscards).toEqual(['4s']);
  const retired=load();expect(retired.problems.some(x=>x.id===p.id)).toBe(false);
  expect(retired.study.find(s=>s.problemId===p.id)!.contentRevision).toBe(3);
  expect(retired.attempts[0]).toMatchObject({problemId:p.id,contentRevision:3,result:'correct',selectedTile:'4s'});
  const restored=repo.restoreSampleCatalog(retired,retired.sampleCatalogUpdates!.at(-1)!.id);if(!restored.ok)throw Error(restored.reason);
  expect(restored.store.problems.some(x=>x.id===p.id)).toBe(true);expect(load().problems).toEqual(restored.store.problems);
});
it.each(['quota','access','size','conflict'])('keeps the old store on correction %s failure',kind=>{
  const before=fixture();if(kind==='size')before.problems[0]!.privateMemo='x'.repeat(LIMITS.storageMaxBytes);seed(before);const raw=localStorage.getItem(KEY);
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;let expected=raw;
  if(kind==='quota'||kind==='access')vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw kind==='quota'?new DOMException('quota','QuotaExceededError'):new Error('denied');});
  if(kind==='conflict'){let reads=0;vi.spyOn(Storage.prototype,'getItem').mockImplementation(function(this: Storage, key){if(key===KEY&&++reads===3){const external={...before,settings:{autoSort:false}};expected=JSON.stringify(external);set.call(this,KEY,expected);}return get.call(this,key);});}
  expect(repo.load().ok).toBe(false);expect(get.call(localStorage,KEY)).toBe(expected);
});
it('can undo an actual old catalog addition after retiring old 03 without touching its deletion backup',()=>{
  for(const [key,value]of Object.entries(oldStorage))localStorage.setItem(key,value);
  const originalSnapshotKey=Object.keys(oldStorage).find(k=>k.includes(':sample-catalog-backup:'))!;
  const retired=load();expect(retired.problems).toHaveLength(9);
  const r=repo.restoreSampleCatalog(retired,retired.sampleCatalogUpdates![0]!.id);if(!r.ok)throw Error(r.reason);
  expect(r.store.problems).toHaveLength(0);expect(localStorage.getItem(originalSnapshotKey)).toBe(oldStorage[originalSnapshotKey as keyof typeof oldStorage]);
  const restored=repo.restoreSampleCatalog(r.store,retired.sampleCatalogUpdates!.at(-1)!.id);if(!restored.ok)throw Error(restored.reason);
  expect(restored.store.problems).toHaveLength(1);expect(restored.store.problems[0]!.acceptedDiscards).toEqual(['4s']);expect(load().problems).toHaveLength(1);
});
it('does not delete edited old content even if it matches the latest catalog',()=>{
  const old=fixture();old.problems[2]={...createSampleProblems().problems[2]!,id:'p2',tagIds:['tag'],sample:old.problems[2]!.sample};seed(old);
  expect(load().problems).toEqual(old.problems);expect(getSampleUpdatePreview(old).additions).toBe(0);
});
it('restores actual old removal snapshots without correcting or re-deleting old 03',()=>{
  for(const [key,value]of Object.entries(removalStorage))localStorage.setItem(key,value);
  const before=load();const oldAttempt=before.attempts[0]!;
  const r=repo.restoreSampleCatalog(before,before.sampleCatalogUpdates!.at(-1)!.id);if(!r.ok)throw Error(r.reason);
  expect(r.store.problems.find(p=>p.id===oldAttempt.problemId)!.acceptedDiscards).toEqual(['4s']);
  expect(r.store.attempts).toEqual(before.attempts);expect(r.store.study).toEqual(before.study);expect(r.store.daily).toEqual(before.daily);expect(load().problems).toHaveLength(10);
});
it('does not delete if backup readback fails',()=>{
  const before=fixture();seed(before);const raw=localStorage.getItem(KEY);const get=Storage.prototype.getItem;
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(function(this:Storage,key){if(key.includes(':sample-catalog-backup:'))return null;return get.call(this,key);});
  expect(repo.load().ok).toBe(false);expect(get.call(localStorage,KEY)).toBe(raw);
});
it('retains the raw tag-edit exclusion through merge normalization and repeated reloads',()=>{
  const incoming=fixture();incoming.tags[0]!.name=' サンプル ';
  seed(emptyStore());const result=repo.importJson(load(),JSON.stringify(incoming),'merge');if(!result.ok)throw Error(result.reason);
  const p=result.store.problems.find(p=>p.sample?.itemId==='sample-v2-03')!;
  expect(p.acceptedDiscards).toEqual(['4s']);expect(p.sample!.retirementSkipped).toBe('sample03-2026-10-07.1');
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
  expect(p.acceptedDiscards).toEqual(['4s']);expect(p.sample!.retirementSkipped).toBe('sample03-2026-10-07.1');
  expect(load().problems.find(x=>x.id===p.id)).toEqual(p);expect(getSampleUpdatePreview(load()).additions).toBe(0);
});
