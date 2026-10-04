import {expect,it} from 'vitest';
import {tileAdditionIssue,tileSupplyIssues} from './tileSupply';
import {TILE_CODES} from './types';
import {normalizeRedAsFive} from './tiles';
it('all 34 physical kinds are allowed up to four, red rules included',()=>{
 for(const code of TILE_CODES){const normal=normalizeRedAsFive(code);expect(tileAdditionIssue([normal,normal,normal],[code])).toBeNull();expect(tileAdditionIssue([normal,normal,normal,normal],[code])).toContain('最大4枚');}
 expect(tileAdditionIssue(['0m'],['0m'])).toContain('最大1枚');expect(tileAdditionIssue(['0m'],['5m','5m','5m'])).toBeNull();expect(tileSupplyIssues(['1m','1m','1m','1m','1m'])).toHaveLength(1);
});
it('complete candidate contributes all copies; invalid old state is never normalized',()=>{
 const before=['1m','1m','1m','1m','1m'] as const;expect(tileAdditionIssue(before,['2m'])).toBeNull();expect(before).toHaveLength(5);expect(tileAdditionIssue(['1m'],['1m','1m','1m','1m'])).toContain('最大4枚');expect(tileAdditionIssue(['2m','2m','2m','2m'],['1m','2m','3m'])).toContain('二萬');
});
