import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
const assets = [
 ['icon-16.png',16,'e97d322739949465588ebe1fe201d3e472c97efe11a37aba3a9bc38d14a29675'],
 ['icon-32.png',32,'a074c1b6d693ed182798769044241ede29f686aab12af82347e68d3f4b2b1a94'],
 ['icon-192.png',192,'d6521de090c4b9e038124bab2489201cb986b5ce0275da85a621a9a6bf98507d'],
 ['icon-512.png',512,'90ef073b0ce398946ca0ba023a0b3593c4b6fbd3c2975e31f4b5a3a884fd1fff'],
 ['apple-touch-icon.png',180,'8fe131ec98f59196373562aa2bdc0ffa60632a6edacee5998eabb75ab7cdd794'],
] as const;
it.each(assets)('packages the approved icon as %s (%s px)',(file,size,hash)=>{
 const png=readFileSync(`public/icons/${file}`);expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
 expect(png.readUInt32BE(16)).toBe(size);expect(png.readUInt32BE(20)).toBe(size);expect(png[25]).toBe(2);
 expect(createHash('sha256').update(png).digest('hex')).toBe(hash);
});
it('wires favicon, Apple touch and opaque PWA masks to the approved set',()=>{
 const html=readFileSync('index.html','utf8');for(const size of [16,32,192])expect(html).toContain(`sizes="${size}x${size}" href="./icons/icon-${size}.png"`);
 expect(html).toContain('rel="apple-touch-icon" href="./icons/apple-touch-icon.png"');
 const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
 expect(manifest.icons).toEqual([{src:'./icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'./icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]);
 expect(existsSync('public/favicon.svg')).toBe(false);
});
