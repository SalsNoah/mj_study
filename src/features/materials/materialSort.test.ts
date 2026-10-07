import {expect,it} from 'vitest';
import type {LearningMaterial,MaterialStudyEvent} from '@/domain/types';
import {sortMaterials,type MaterialSortKey,type MaterialSortDirection} from './materialSort';
const item=(id:string,date:string):LearningMaterial=>({id,title:id,url:`https://example.com/${id}`,comment:'preserved',createdAt:'2026-01-01T00:00:00Z',updatedAt:date});
const materials=[item('a','2026-10-01T10:00:00+09:00'),item('b','2026-10-01T02:00:00Z'),item('c','2026-10-01T03:00:00Z'),item('d','2026-10-01T03:00:00Z')];
const event=(id:string,materialId:string,at:string):MaterialStudyEvent=>({id,materialId,at,title:materialId,url:`https://example.com/${materialId}`,comment:'history'});
const events=[...Array.from({length:10},(_,i)=>event(`a${i}`,'a','2026-10-01T10:00:00+09:00')),event('b0','b','2026-10-01T00:00:00Z'),event('b1','b','2026-10-01T02:00:00Z')];
it.each<[MaterialSortKey,MaterialSortDirection,string[]]>([
 ['studyCount','asc',['c','d','b','a']],['studyCount','desc',['a','b','c','d']],
 ['updatedAt','asc',['a','b','c','d']],['updatedAt','desc',['c','d','b','a']],
 ['lastStudiedAt','asc',['a','b','c','d']],['lastStudiedAt','desc',['b','a','c','d']],
])('sorts %s %s with stable equal values and real dates', (key,direction,ids)=>{
 const before=JSON.stringify({materials,events});expect(sortMaterials(materials,events,key,direction).map(m=>m.id)).toEqual(ids);expect(JSON.stringify({materials,events})).toBe(before);
});
it('deduplicates event IDs and derives the latest remaining date after undo',()=>{
 const withDuplicate=[...events,events[0]!];expect(sortMaterials(materials,withDuplicate,'studyCount','desc')).toEqual(sortMaterials(materials,events,'studyCount','desc'));
 const undone=events.filter(e=>e.id!=='b1');expect(sortMaterials(materials,undone,'lastStudiedAt','desc').map(m=>m.id)).toEqual(['a','b','c','d']);
});
it('keeps never-studied distinct from a genuine epoch date in both directions',()=>{
 const past=[event('epoch','b','1970-01-01T00:00:00Z')];for(const direction of ['asc','desc'] as const)expect(sortMaterials(materials,past,'lastStudiedAt',direction).map(m=>m.id)).toEqual(['b','a','c','d']);
});
it('preserves archived rows and saved-array ties across direction changes',()=>{
 const archived=materials.map(m=>({...m,archivedAt:'2026-10-05T00:00:00Z'}));for(const direction of ['asc','desc'] as const)expect(sortMaterials(archived,undefined,'lastStudiedAt',direction)).toEqual(archived);
});
