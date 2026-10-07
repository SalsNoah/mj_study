import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useYoutubeTitle } from './useYoutubeTitle';
import { youtubeVideoId } from './youtube';
let root: Root, host: HTMLDivElement;
let draft: ReturnType<typeof useYoutubeTitle>;
function Harness({ active = true }: { active?: boolean }) { draft = useYoutubeTitle(active); return <p>{draft.title}</p>; }
beforeEach(async () => {
 vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 host=document.createElement('div'); root=createRoot(host);
 await act(async()=>root.render(<Harness/>));
});
afterEach(async()=>{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();});
const change=async(url:string)=>act(async()=>draft.changeUrl(url));
const tick=async(ms=300)=>act(async()=>vi.advanceTimersByTimeAsync(ms));
const reply=(title:unknown)=>({ok:true,json:async()=>({title})});
const urlA='https://youtu.be/M7lc1UVf-VE?si=private#fragment';
const urlB='https://www.youtube.com/shorts/abcdefghijk';

it.each(['https://youtube.com/watch?v=M7lc1UVf-VE','https://youtu.be/M7lc1UVf-VE','https://m.youtube.com/shorts/M7lc1UVf-VE','https://youtube.com/live/M7lc1UVf-VE','https://youtube.com/embed/M7lc1UVf-VE','https://www.youtube-nocookie.com/embed/M7lc1UVf-VE'])('recognizes %s',url=>expect(youtubeVideoId(url)).toBe('M7lc1UVf-VE'));
it.each(['https://note.com/a','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://youtube.com/watch?v=M7lc1UVf-VE&v=abcdefghijk','https://youtube.com:444/watch?v=M7lc1UVf-VE','https://youtu.be/short','https://youtube.com/playlist?list=M7lc1UVf-VE'])('does not fetch %s',async url=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await change(url);await tick();expect(fetch).not.toHaveBeenCalled();});
it('requests only canonical ID, omits credentials/referrer, preserves draft URL and replaces automatic titles',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(reply('最初')).mockResolvedValueOnce(reply('次'));vi.stubGlobal('fetch',fetch);
 await change(urlA);await tick();expect(draft.title).toBe('最初');expect(draft.url).toBe(urlA);
 const [endpoint,options]=fetch.mock.calls[0]!;expect(new URL(endpoint).searchParams.get('url')).toBe('https://www.youtube.com/watch?v=M7lc1UVf-VE');expect(endpoint).not.toContain('private');expect(options).toMatchObject({credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
 await change(urlB);expect(draft.title).toBe('');await tick();expect(draft.title).toBe('次');
 await change('https://note.com/test');expect(draft.title).toBe('');
});
it.each(['手動タイトル',''])('keeps intentional manual edits including clearing (%s)',async title=>{
 let resolve!:(v:unknown)=>void;const fetch=vi.fn(()=>new Promise(r=>resolve=r));vi.stubGlobal('fetch',fetch);
 await change(urlA);await tick();await act(async()=>draft.changeTitle(title));await act(async()=>resolve(reply('遅延応答')));expect(draft.title).toBe(title);
 await change(urlB);await tick();expect(draft.title).toBe(title);expect(fetch).toHaveBeenCalledTimes(1);
});
it('keeps titles entered before a URL without making requests',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await act(async()=>draft.changeTitle('先に入力'));await change(urlA);await tick();expect(draft.title).toBe('先に入力');expect(fetch).not.toHaveBeenCalled();});
it('debounces pastes and ignores out-of-order responses even when abort is ignored',async()=>{
 const pending:Array<(v:unknown)=>void>=[];vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>pending.push(r))));
 await change(urlA);await tick();await change(urlB);await tick();await act(async()=>pending[1]!(reply('新しい動画')));await act(async()=>pending[0]!(reply('古い動画')));expect(draft.title).toBe('新しい動画');
});
it('does not request abandoned partial URLs',async()=>{const fetch=vi.fn().mockResolvedValue(reply('次'));vi.stubGlobal('fetch',fetch);await change(urlA);await tick(100);await change(urlB);await tick();expect(fetch).toHaveBeenCalledTimes(1);});
it('invalidates closed/reopened sessions and save/unmount',async()=>{
 const pending:Array<(v:unknown)=>void>=[];vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>pending.push(r))));
 await change(urlA);await tick();await act(async()=>{draft.cancel();root.render(<Harness active={false}/>)});await act(async()=>root.render(<Harness/>));await tick();
 await act(async()=>pending[0]!(reply('閉じる前')));expect(draft.title).toBe('');await act(async()=>{draft.cancel();pending[1]!(reply('保存後'))});expect(draft.title).toBe('');
});
it.each([()=>Promise.reject(new Error('offline')),()=>Promise.resolve({ok:false}),()=>Promise.resolve(reply(null)),()=>Promise.resolve(reply('  ')),()=>Promise.resolve({ok:true,json:()=>Promise.reject(new Error('html'))})])('failure leaves a usable empty title',async fetch=>{vi.stubGlobal('fetch',vi.fn(fetch));await change(urlA);await tick();expect(draft.title).toBe('');expect(draft.status).toContain('手入力');await act(async()=>draft.changeTitle('自分のタイトル'));expect(draft.title).toBe('自分のタイトル');});
it('times out and ignores a later response',async()=>{let resolve!:(v:unknown)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>resolve=r)));await change(urlA);await tick();await tick(5000);expect(draft.status).toContain('取得できません');await act(async()=>resolve(reply('遅すぎる応答')));expect(draft.title).toBe('');});
it('shortens at the existing UTF-16 limit, explains it, and preserves surrogate pairs',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply('あ'.repeat(99)+'🀄長い')));await change(urlA);await tick();expect(draft.title).toBe('あ'.repeat(99));expect(draft.status).toContain('100文字以内に短縮');});
it('manual input during debounce never starts a request or leaves a loading message',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await change(urlA);await tick(100);await act(async()=>draft.changeTitle('手入力'));await tick();expect(fetch).not.toHaveBeenCalled();expect(draft.status).toBe('');});
