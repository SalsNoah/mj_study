import { expect, it } from 'vitest';
import { canUseHundreds, parseScoreInput, scoreEntryFromValue } from './scoreInput';
it.each([['250',25000],['0',0],['999',99900],['-25',-2500],['-999',-99900],['',null],['001',100]] as const)('parses prefix %s without truncation', (draft,value) => expect(parseScoreInput(draft,'hundreds')).toEqual({ok:true,value}));
it.each(['1000','25000','-1000','1.5','1e2','-','+1',' 1','１','x','25\n'])('keeps invalid prefix %s invalid', draft=>expect(parseScoreInput(draft,'hundreds').ok).toBe(false));
it.each([null,0,25000,-25000,99999,12345,100000,-100000,200000])('round trips legacy score %s in compact and exact modes', value=>{
 for(const exact of [false,true]){const entry=scoreEntryFromValue(value,exact);expect(parseScoreInput(entry.draft,entry.mode)).toEqual({ok:true,value});expect(entry.mode).toBe(exact||!canUseHundreds(value)?'exact':'hundreds');}
});
