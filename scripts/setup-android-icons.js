// Android mipmap にアイコンを配置するスクリプト
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const iconsDir = path.join(__dirname, '..', 'assets', 'icons');

// Android mipmap サイズマッピング
const mipmaps = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

// SVGソース生成
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
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="url(#bg)"/>
  <rect x="${padding * 0.5}" y="${padding * 0.5}" width="${size - padding}" height="${size - padding}" rx="${Math.round(size * 0.14)}" fill="none" stroke="#00f0ff" stroke-width="${Math.max(1, Math.round(size * 0.01))}" opacity="0.3"/>
  <text x="${size / 2}" y="${size * 0.52}" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${fontSize}" fill="#00f0ff" text-anchor="middle" dominant-baseline="central">ONI</text>
  <text x="${size / 2}" y="${size * 0.74}" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="${subSize}" fill="#ff2266" text-anchor="middle" letter-spacing="${Math.round(size * 0.02)}">TAG BATTLE</text>
</svg>`;
}

// 丸アイコン用SVG
function generateRoundSVG(size) {
  const r = size / 2;
  const fontSize = Math.round(size * 0.35);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0d0d14"/>
      <stop offset="100%" style="stop-color:#0a0a0f"/>
    </linearGradient>
    <clipPath id="circle"><circle cx="${r}" cy="${r}" r="${r}"/></clipPath>
  </defs>
  <g clip-path="url(#circle)">
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <circle cx="${r}" cy="${r}" r="${r - 2}" fill="none" stroke="#00f0ff" stroke-width="${Math.max(1, Math.round(size * 0.01))}" opacity="0.3"/>
    <text x="${r}" y="${r * 1.05}" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${fontSize}" fill="#00f0ff" text-anchor="middle" dominant-baseline="central">ONI</text>
  </g>
</svg>`;
}

async function main() {
  for (const [folder, size] of Object.entries(mipmaps)) {
    const dir = path.join(resDir, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 通常アイコン
    const svg = Buffer.from(generateSVG(size));
    await sharp(svg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
    console.log(`${folder}/ic_launcher.png (${size}x${size})`);

    // 丸アイコン
    const roundSvg = Buffer.from(generateRoundSVG(size));
    await sharp(roundSvg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    console.log(`${folder}/ic_launcher_round.png (${size}x${size})`);

    // foreground (adaptive icon用)
    await sharp(svg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  console.log('\nAndroid icons setup complete!');
}

main().catch(console.error);
