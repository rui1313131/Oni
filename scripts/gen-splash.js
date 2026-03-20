const sharp = require('sharp');
const path = require('path');

const size = 2732; // largest splash
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0a0a0f"/>
  <text x="${size/2}" y="${size*0.45}" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="280" fill="#00f0ff" text-anchor="middle" dominant-baseline="central" opacity="0.9">ONI</text>
  <text x="${size/2}" y="${size*0.53}" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="60" fill="#ff2266" text-anchor="middle" letter-spacing="12">REAL-TIME TAG BATTLE</text>
</svg>`;

const outDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

async function main() {
  const buf = Buffer.from(svg);

  // メインスプラッシュ
  await sharp(buf).resize(480, 480).png().toFile(path.join(outDir, 'drawable', 'splash.png'));
  console.log('drawable/splash.png');

  // 各密度のスプラッシュ（ランドスケープ・ポートレート）
  const densities = {
    mdpi: { land: [480, 320], port: [320, 480] },
    hdpi: { land: [800, 480], port: [480, 800] },
    xhdpi: { land: [1280, 720], port: [720, 1280] },
    xxhdpi: { land: [1600, 960], port: [960, 1600] },
    xxxhdpi: { land: [1920, 1280], port: [1280, 1920] }
  };

  for (const [density, sizes] of Object.entries(densities)) {
    for (const [orient, [w, h]] of Object.entries(sizes)) {
      const dir = path.join(outDir, `drawable-${orient}-${density}`);
      const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" fill="#0a0a0f"/>
        <text x="${w/2}" y="${h*0.45}" font-family="Arial,sans-serif" font-weight="900" font-size="${Math.round(Math.min(w,h)*0.18)}" fill="#00f0ff" text-anchor="middle" dominant-baseline="central">ONI</text>
      </svg>`;
      await sharp(Buffer.from(splashSvg)).resize(w, h).png().toFile(path.join(dir, 'splash.png'));
      console.log(`drawable-${orient}-${density}/splash.png (${w}x${h})`);
    }
  }

  console.log('\nSplash screens generated!');
}

main().catch(console.error);
