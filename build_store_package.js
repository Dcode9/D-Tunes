const builder = require('electron-builder');
const path = require('path');
const fs = require('fs');

async function build() {
  console.log('--- Packaging D-Tunes for Microsoft Store (APPX/MSIX) with Custom On-Device Tiles ---');
  
  // Clean previous build
  const distDir = path.join(__dirname, 'dist_store');
  if (fs.existsSync(distDir)) {
    try {
      fs.rmSync(distDir, { recursive: true, force: true });
    } catch (_) {}
  }

  const results = await builder.build({
    targets: builder.Platform.WINDOWS.createTarget(['appx'], builder.Arch.x64),
    config: {
      appId: 'DhairyaShah.DTunes',
      productName: "D'Tunes",
      directories: {
        output: 'dist_store',
        buildResources: 'build'
      },
      win: {
        target: 'appx',
        icon: 'assets/icon.ico'
      },
      appx: {
        identityName: 'DhairyaShah.DTunes',
        publisher: 'CN=2FF24EFD-6E5F-41DB-83A5-1FD44EC9F075',
        publisherDisplayName: 'Dhairya Shah',
        applicationId: 'DTunes',
        backgroundColor: '#09090b',
        showNameOnTiles: true,
        artifactName: 'D-Tunes-Store.appx'
      },
      files: [
        'main.js',
        'preload.js',
        'winVolume.js',
        'error.html',
        'index.html',
        'DTunes.svg',
        'src/**/*',
        'assets/**/*',
        'package.json'
      ]
    }
  });

  console.log('✅ Microsoft Store package created successfully with custom tiles:', results);
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
