// Reproducible 2D crop/mask of official source pixels; no synthesis or relabeling.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../assets/chips');
const {Resvg}=require(path.resolve(__dirname,'../../../../automotive-video/node_modules/@resvg/resvg-js'));
const sources=JSON.parse(fs.readFileSync(path.join(root,'sources.json')));
for(const s of sources) {
  const source=fs.readFileSync(path.join(root,s.original));
  if(crypto.createHash('sha256').update(source).digest('hex')!==s.originalSha256)throw Error(`Changed original: ${s.id}`);
  const clip=s.polygon?`<defs><clipPath id="source"><polygon points="${s.polygon}"/></clipPath></defs>`:'';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${s.viewBox.join(' ')}">${clip}<image width="${s.width}" height="${s.height}" href="data:image/jpeg;base64,${source.toString('base64')}" ${s.polygon?'clip-path="url(#source)"':''}/></svg>`;
  const out=path.join(root,s.derived);
  fs.writeFileSync(out,new Resvg(svg).render().asPng());
  console.log(`${s.id}: ${fs.statSync(out).size} bytes`);
}
