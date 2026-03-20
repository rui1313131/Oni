// www/ フォルダにWebアセットをコピーするビルドスクリプト
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');

// wwwフォルダをクリーン＆作成
if (fs.existsSync(www)) {
  fs.rmSync(www, { recursive: true });
}
fs.mkdirSync(www, { recursive: true });

// コピー対象
const files = [
  'index.html',
  'manifest.json',
  'sw.js'
];

const dirs = [
  'css',
  'js',
  'assets',
  'legal'
];

// ファイルコピー
files.forEach(f => {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(www, f));
    console.log(`Copied: ${f}`);
  }
});

// ディレクトリコピー（再帰）
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

dirs.forEach(d => {
  copyDir(path.join(root, d), path.join(www, d));
  console.log(`Copied dir: ${d}/`);
});

console.log('\nBuild complete → www/');
