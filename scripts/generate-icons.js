// PWA/Android用アイコンを自動生成するスクリプト
// sharp不要 - 純粋なSVGからPNGへの変換をCanvasで行う

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = path.join(__dirname, '..', 'assets', 'icons');

// SVGアイコンテンプレート（ONIロゴ）
function generateSVG(size) {
  const padding = Math.round(size * 0.15);
  const fontSize = Math.round(size * 0.38);
  const subSize = Math.round(size * 0.1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0d0d14"/>
      <stop offset="100%" style="stop-color:#0a0a0f"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${size * 0.02}" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="url(#bg)"/>
  <rect x="${padding * 0.5}" y="${padding * 0.5}" width="${size - padding}" height="${size - padding}" rx="${Math.round(size * 0.14)}" fill="none" stroke="#00f0ff" stroke-width="${Math.max(1, Math.round(size * 0.01))}" opacity="0.3"/>
  <text x="${size / 2}" y="${size * 0.52}" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif" font-weight="900" font-size="${fontSize}" fill="#00f0ff" text-anchor="middle" dominant-baseline="central" filter="url(#glow)">ONI</text>
  <text x="${size / 2}" y="${size * 0.74}" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif" font-weight="600" font-size="${subSize}" fill="#ff2266" text-anchor="middle" letter-spacing="${Math.round(size * 0.02)}">TAG BATTLE</text>
  <line x1="${padding}" y1="${size * 0.63}" x2="${size - padding}" y2="${size * 0.63}" stroke="#00f0ff" stroke-width="${Math.max(0.5, size * 0.005)}" opacity="0.2"/>
</svg>`;
}

// SVGをそのまま保存（ブラウザ不要の方法）
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// まずSVGファイルを生成
sizes.forEach(size => {
  const svg = generateSVG(size);
  const svgPath = path.join(outDir, `icon-${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`Generated SVG: icon-${size}.svg`);
});

console.log('\nSVG icons generated. Converting to PNG...');

// sharpでPNG変換を試行
try {
  const sharp = require('sharp');
  sizes.forEach(size => {
    const svgPath = path.join(outDir, `icon-${size}.svg`);
    const pngPath = path.join(outDir, `icon-${size}.png`);
    sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(pngPath)
      .then(() => {
        console.log(`Converted: icon-${size}.png`);
        fs.unlinkSync(svgPath); // SVG削除
      });
  });
} catch (e) {
  // sharpがなければresvg-jsを試行
  try {
    const { Resvg } = require('@aspect-run/resvg-js') || require('@aspect-run/resvg');
    sizes.forEach(size => {
      const svg = generateSVG(size);
      const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
      const png = resvg.render().asPng();
      fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
      console.log(`Converted: icon-${size}.png`);
    });
  } catch (e2) {
    console.log('\nPNG conversion library not available. Using alternative method...');
    // HTMLベースの変換ツールを生成
    generateHTMLConverter();
  }
}

function generateHTMLConverter() {
  const html = `<!DOCTYPE html>
<html>
<head><title>Icon Generator</title></head>
<body style="background:#111;color:#fff;font-family:sans-serif;padding:20px">
<h2>ONI Icon Generator</h2>
<p>Click to download all icons as PNG:</p>
<button id="gen" style="padding:12px 24px;font-size:16px;cursor:pointer;background:#00f0ff;color:#000;border:none;border-radius:8px">Generate All Icons</button>
<div id="preview" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:20px"></div>
<script>
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
function genSVG(s){
  const p=Math.round(s*0.15),f=Math.round(s*0.38),sub=Math.round(s*0.1);
  return \`<svg xmlns="http://www.w3.org/2000/svg" width="\${s}" height="\${s}" viewBox="0 0 \${s} \${s}">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#0d0d14"/><stop offset="100%" style="stop-color:#0a0a0f"/></linearGradient></defs>
  <rect width="\${s}" height="\${s}" rx="\${Math.round(s*0.18)}" fill="url(#bg)"/>
  <rect x="\${p*0.5}" y="\${p*0.5}" width="\${s-p}" height="\${s-p}" rx="\${Math.round(s*0.14)}" fill="none" stroke="#00f0ff" stroke-width="\${Math.max(1,Math.round(s*0.01))}" opacity="0.3"/>
  <text x="\${s/2}" y="\${s*0.52}" font-family="Arial,sans-serif" font-weight="900" font-size="\${f}" fill="#00f0ff" text-anchor="middle" dominant-baseline="central">ONI</text>
  <text x="\${s/2}" y="\${s*0.74}" font-family="Arial,sans-serif" font-weight="600" font-size="\${sub}" fill="#ff2266" text-anchor="middle" letter-spacing="\${Math.round(s*0.02)}">TAG BATTLE</text>
  </svg>\`;
}
document.getElementById('gen').onclick=async()=>{
  const preview=document.getElementById('preview');
  preview.innerHTML='';
  for(const s of sizes){
    const svg=genSVG(s);
    const blob=new Blob([svg],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.src=url;
    await new Promise(r=>img.onload=r);
    const c=document.createElement('canvas');
    c.width=s;c.height=s;
    const ctx=c.getContext('2d');
    ctx.drawImage(img,0,0,s,s);
    const png=c.toDataURL('image/png');
    const a=document.createElement('a');
    a.href=png;a.download='icon-'+s+'.png';a.click();
    const p=document.createElement('div');
    p.innerHTML='<img src="'+png+'" style="width:'+Math.min(s,128)+'px;border:1px solid #333;border-radius:8px"><br><small>'+s+'x'+s+'</small>';
    preview.appendChild(p);
  }
  alert('All icons downloaded!');
};
<\/script>
</body></html>`;
  fs.writeFileSync(path.join(outDir, 'generate-icons.html'), html);
  console.log('Created HTML icon generator: assets/icons/generate-icons.html');
  console.log('Open it in a browser to download PNG icons.');
}
