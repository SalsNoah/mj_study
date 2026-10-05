import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { WanpaiDora } from './WanpaiDora';
import { HandBoard } from './HandBoard';
import type { TileCode } from '@/domain/types';
import { tileLabel } from '@/domain/tiles';
let host: HTMLDivElement; let root: Root;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const order=()=>[...host.querySelector('.wanpai')!.children].map(el=>el.classList.contains('is-back')?'back':el.getAttribute('aria-label'));
const sequence:TileCode[]=['4z','1m','0p','7z','4z'];
it.each([0,1,2,3,4,5])('reveals %s indicators from the left with exactly five slots',async(n)=>{
 const input=sequence.slice(0,n);await act(async()=>root.render(<WanpaiDora doras={input}/>));
 expect(order()).toEqual([...input.map(tileLabel),...Array(5-n).fill('back')]);expect(input).toEqual(sequence.slice(0,n));
});
it('uses the original duplicate indicator index and compacts after removal without sorting',async()=>{
 let values=[...sequence];const remove=vi.fn((index:number)=>{values=values.filter((_,i)=>i!==index);});
 await act(async()=>root.render(<WanpaiDora doras={values} onRemove={remove}/>));
 await act(async()=>(host.querySelectorAll('button')[4] as HTMLButtonElement).click());
 expect(remove).toHaveBeenCalledWith(4);expect(values).toEqual(sequence.slice(0,4));
 await act(async()=>root.render(<WanpaiDora doras={values} onRemove={remove}/>));
 await act(async()=>(host.querySelectorAll('button')[1] as HTMLButtonElement).click());
 await act(async()=>root.render(<WanpaiDora doras={values} onRemove={remove}/>));
 expect(order()).toEqual(['北','赤五筒','中','back','back']);
});
it('caps display at five without mutating legacy overflow data, including HandBoard previews',async()=>{
 const values:TileCode[]=[...sequence,'2z'];await act(async()=>root.render(<HandBoard concealed={[]} melds={[]} doraIndicators={values}/>));
 expect(order()).toEqual(sequence.map(tileLabel));expect(values).toHaveLength(6);expect(host.querySelectorAll('.wanpai > button')).toHaveLength(0);
});
