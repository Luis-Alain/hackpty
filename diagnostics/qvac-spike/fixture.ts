import { deflateSync } from 'node:zlib';
/** Synthetic, non-clinical fixture drawn with an embedded 5x7 bitmap font. */
export const SYNTHETIC_SOURCE = [
  'SYNTHETIC TRAINING NOTE',
  'SOURCE ID: DEMO-001',
  'REPORTS POOR SLEEP FOR THREE NIGHTS.',
  'NO DIAGNOSIS RECORDED.',
  'FOLLOW UP: REVIEW SLEEP LOG.',
].join('\n');
const glyphs:Record<string,string>={
  A:'01110 10001 10001 11111 10001 10001 10001',B:'11110 10001 10001 11110 10001 10001 11110',C:'01111 10000 10000 10000 10000 10000 01111',
  D:'11110 10001 10001 10001 10001 10001 11110',E:'11111 10000 10000 11110 10000 10000 11111',F:'11111 10000 10000 11110 10000 10000 10000',
  G:'01111 10000 10000 10111 10001 10001 01110',H:'10001 10001 10001 11111 10001 10001 10001',I:'11111 00100 00100 00100 00100 00100 11111',
  J:'00111 00010 00010 00010 00010 10010 01100',K:'10001 10010 10100 11000 10100 10010 10001',L:'10000 10000 10000 10000 10000 10000 11111',
  M:'10001 11011 10101 10101 10001 10001 10001',N:'10001 11001 10101 10011 10001 10001 10001',O:'01110 10001 10001 10001 10001 10001 01110',
  P:'11110 10001 10001 11110 10000 10000 10000',Q:'01110 10001 10001 10001 10101 10010 01101',R:'11110 10001 10001 11110 10100 10010 10001',
  S:'01111 10000 10000 01110 00001 00001 11110',T:'11111 00100 00100 00100 00100 00100 00100',U:'10001 10001 10001 10001 10001 10001 01110',
  V:'10001 10001 10001 10001 10001 01010 00100',W:'10001 10001 10001 10101 10101 11011 10001',X:'10001 10001 01010 00100 01010 10001 10001',
  Y:'10001 10001 01010 00100 00100 00100 00100',Z:'11111 00001 00010 00100 01000 10000 11111',
  '0':'01110 10001 10011 10101 11001 10001 01110','1':'00100 01100 00100 00100 00100 00100 01110',
  ':':'00000 00100 00100 00000 00100 00100 00000','.':'00000 00000 00000 00000 00000 00100 00100','-':'00000 00000 00000 11111 00000 00000 00000',' ':'00000 00000 00000 00000 00000 00000 00000',
};
function crc32(bytes:Buffer){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type:string,data:Buffer){const kind=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,crc]);}
export function syntheticImage():Buffer {
  const width=1160,height=450,scale=5;
  const pixels=Buffer.alloc(width*height*3,255);
  const lines=SYNTHETIC_SOURCE.split('\n');
  for(let line=0;line<lines.length;line++)for(let col=0;col<lines[line].length;col++){
    const glyph=glyphs[lines[line][col]];if(!glyph)throw new Error(`Missing synthetic glyph ${lines[line][col]}`);
    const rows=glyph.split(' ');
    for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(rows[y][x]==='1')for(let py=0;py<scale;py++)for(let px=0;px<scale;px++){
      const index=((45+line*75+y*scale+py)*width+(45+col*6*scale+x*scale+px))*3;pixels[index]=15;pixels[index+1]=15;pixels[index+2]=15;
    }
  }
  const raw=Buffer.alloc(height*(width*3+1));for(let y=0;y<height;y++)pixels.copy(raw,y*(width*3+1)+1,y*width*3,(y+1)*width*3);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
