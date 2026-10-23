const fs = require('fs');
const path = require('path');

async function build() {
  console.log('--- Step 1: Generating Transparent Icons ---');
  require('./make_ico_pure.js');

  console.log('--- Step 2: Packaging D-Tunes Desktop App ---');
  const packager = require('@electron/packager');

  const outDir = path.join(__dirname, 'dist');
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  const appPaths = await packager({
    dir: __dirname,
    out: outDir,
    name: 'D-Tunes',
    executableName: 'D-Tunes',
    platform: 'win32',
    arch: 'x64',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    appVersion: '1.4.0',
    appCopyright: 'Copyright © 2026 D-Tunes',
    win32metadata: {
      CompanyName: 'D-Tunes',
      FileDescription: 'D-Tunes Native Desktop Music Player',
      OriginalFilename: 'D-Tunes.exe',
      ProductName: 'D-Tunes',
      InternalName: 'D-Tunes'
    },
    overwrite: true,
    asar: true,
    prune: true,
    ignore: [
      /^\/(dist|dist_appx|dist_store|ms_store_package|winui3|build|\.git|downloads|tests|__pycache__)($|\/)/
    ]
  });

  console.log('--- Step 3: Package Complete! ---');
  console.log('Output Directory:', appPaths[0]);
  const packagedExe = path.join(appPaths[0], 'D-Tunes.exe');
  console.log('Standalone Executable:', packagedExe);
  console.log('Exists:', fs.existsSync(packagedExe));
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
