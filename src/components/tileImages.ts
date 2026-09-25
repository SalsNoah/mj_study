import type { TileCode } from '@/domain/types';

/** pai-images のファイル名。赤は aka3=萬 aka1=筒 aka2=索。字牌は ji5=發 ji6=白。 */
const STEM: Record<TileCode, string> = {
  '1m': 'man1', '2m': 'man2', '3m': 'man3', '4m': 'man4', '5m': 'man5',
  '0m': 'aka3', '6m': 'man6', '7m': 'man7', '8m': 'man8', '9m': 'man9',
  '1p': 'pin1', '2p': 'pin2', '3p': 'pin3', '4p': 'pin4', '5p': 'pin5',
  '0p': 'aka1', '6p': 'pin6', '7p': 'pin7', '8p': 'pin8', '9p': 'pin9',
  '1s': 'sou1', '2s': 'sou2', '3s': 'sou3', '4s': 'sou4', '5s': 'sou5',
  '0s': 'aka2', '6s': 'sou6', '7s': 'sou7', '8s': 'sou8', '9s': 'sou9',
  '1z': 'ji1', '2z': 'ji2', '3z': 'ji3', '4z': 'ji4',
  '5z': 'ji6', '6z': 'ji5', '7z': 'ji7',
};

export function tileImageUrl(code: TileCode, sideways = false): string {
  const stem = STEM[code];
  const file = sideways ? `${stem}-yoko.png` : `${stem}.png`;
  return `${import.meta.env.BASE_URL}tiles/${file}`;
}
