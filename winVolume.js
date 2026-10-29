'use strict';

// Windows system (master) volume control via Core Audio, with zero native
// dependencies: a single long-lived PowerShell worker compiles a tiny C#
// CoreAudio helper once, reads volume values from stdin, and watches for
// external volume changes (e.g. keyboard media keys or taskbar slider)
// to push them back to the app in real time.

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevel, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevel);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevel, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevel);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
    int GetState(out int pdwState);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
    int RegisterEndpointNotificationCallback(IntPtr pClient);
    int UnregisterEndpointNotificationCallback(IntPtr pClient);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumerator { }

public static class DTunesAudio {
    static readonly Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    static IAudioEndpointVolume endpoint;
    static float lastVol = -1f;
    static Thread watchThread;
    static volatile bool running = false;
    static readonly object syncRoot = new object();

    static void Ensure() {
        if (endpoint != null) return;
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice device;
        Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 0, out device));
        object o;
        Guid iid = IID_IAudioEndpointVolume;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out o));
        endpoint = (IAudioEndpointVolume)o;
    }

    public static void Set(float v) {
        Ensure();
        if (v < 0f) v = 0f;
        if (v > 1f) v = 1f;
        lock (syncRoot) {
            lastVol = v;
        }
        Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(v, Guid.Empty));
    }

    public static float Get() {
        Ensure();
        float v;
        Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out v));
        return v;
    }

    public static void StartWatcher() {
        if (running) return;
        running = true;
        try {
            float initial = Get();
            lock (syncRoot) { lastVol = initial; }
            Console.WriteLine("VOL " + initial.ToString(System.Globalization.CultureInfo.InvariantCulture));
        } catch {}
        watchThread = new Thread(() => {
            while (running) {
                try {
                    Thread.Sleep(150);
                    Ensure();
                    float cur;
                    if (endpoint.GetMasterVolumeLevelScalar(out cur) == 0) {
                        bool changed = false;
                        lock (syncRoot) {
                            if (lastVol < 0f || Math.Abs(cur - lastVol) >= 0.008f) {
                                lastVol = cur;
                                changed = true;
                            }
                        }
                        if (changed) {
                            Console.WriteLine("VOL " + cur.ToString(System.Globalization.CultureInfo.InvariantCulture));
                        }
                    }
                } catch {
                    endpoint = null;
                }
            }
        });
        watchThread.IsBackground = true;
        watchThread.Start();
    }

    public static void StopWatcher() {
        running = false;
    }
}
'@

if ($?) {
    [DTunesAudio]::StartWatcher()
    [Console]::Out.WriteLine('VOLREADY')
} else {
    [Console]::Out.WriteLine('VOLFAIL')
}
[Console]::Out.Flush()

while (($line = [Console]::In.ReadLine()) -ne $null) {
    $line = $line.Trim()
    if ($line.Length -eq 0) { continue }
    if ($line -eq 'GET') {
        try { [Console]::Out.WriteLine('VAL ' + [DTunesAudio]::Get().ToString([Globalization.CultureInfo]::InvariantCulture)) }
        catch { [Console]::Out.WriteLine('ERR') }
    } else {
        try {
            $v = [float]::Parse($line, [Globalization.CultureInfo]::InvariantCulture)
            [DTunesAudio]::Set($v)
            [Console]::Out.WriteLine('OK')
        } catch { [Console]::Out.WriteLine('ERR') }
    }
    [Console]::Out.Flush()
}
`;

class WinVolumeManager extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.ready = false;
    this.unusable = false;
    this.startFailed = false;
    this.lastSet = null;
    this.lastKnown = null;
    this.stdoutBuf = '';
    this.waiters = [];
    this.getQueue = [];
    this.scriptPath = null;
  }

  isSupported() {
    return process.platform === 'win32';
  }

  start() {
    if (this.child || this.startFailed || process.platform !== 'win32') return;
    try {
      this.scriptPath = path.join(os.tmpdir(), `dtunes-volume-${process.pid}.ps1`);
      fs.writeFileSync(this.scriptPath, PS_SCRIPT, 'utf8');
      this.child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      this.child.stdout.setEncoding('utf8');
      this.child.stdout.on('data', (chunk) => this._onData(chunk));
      this.child.stderr.setEncoding('utf8');
      this.child.stderr.on('data', () => {});
      this.child.on('exit', () => {
        this.child = null;
        this.ready = false;
        try { if (this.scriptPath && fs.existsSync(this.scriptPath)) fs.unlinkSync(this.scriptPath); } catch (_) {}
      });
      this.child.on('error', () => {
        this.startFailed = true;
        this.child = null;
      });
    } catch (err) {
      this.startFailed = true;
      this.child = null;
    }
  }

  _onData(chunk) {
    this.stdoutBuf += chunk;
    let nl;
    while ((nl = this.stdoutBuf.indexOf('\n')) !== -1) {
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (line === 'VOLREADY') {
        this.ready = true;
        if (this.lastSet !== null) this._writeLine(this.lastSet);
        while (this.waiters.length) this.waiters.shift()(true);
        continue;
      }
      if (line === 'VOLFAIL') {
        this.unusable = true;
        while (this.waiters.length) this.waiters.shift()(false);
        continue;
      }
      if (line.startsWith('VOL ')) {
        const vol = parseFloat(line.slice(4));
        if (Number.isFinite(vol)) {
          this.lastKnown = vol;
          this.emit('change', vol);
        }
        continue;
      }
      if (line.startsWith('VAL ')) {
        const cb = this.getQueue.shift();
        const vol = parseFloat(line.slice(4));
        if (Number.isFinite(vol)) this.lastKnown = vol;
        if (cb) cb(vol);
        continue;
      }
      if (line === 'ERR') {
        const cb = this.getQueue.shift();
        if (cb) cb(null);
        continue;
      }
    }
  }

  _writeLine(value) {
    if (!this.child || !this.ready) return;
    try { this.child.stdin.write(`${value}\n`); } catch (err) {}
  }

  whenReady(timeoutMs, cb) {
    if (this.ready) { cb(true); return; }
    if (this.unusable || this.startFailed) { cb(false); return; }
    this.start();
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; cb(false); } }, timeoutMs);
    this.waiters.push((ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cb(ok);
    });
  }

  setVolume(value) {
    const val = Math.max(0, Math.min(1, Number(value)));
    if (!Number.isFinite(val)) return;
    this.lastSet = val;
    this.lastKnown = val;
    if (this.ready) { this._writeLine(val); return; }
    this.whenReady(10000, (ok) => { if (ok) this._writeLine(this.lastSet); });
  }

  getVolume(timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (this.lastKnown !== null && this.ready) {
        // Return known volume quickly if available
      }
      this.whenReady(timeoutMs, (ok) => {
        if (!ok || !this.ready) { resolve(this.lastKnown); return; }
        let settled = false;
        const timer = setTimeout(() => { if (!settled) { settled = true; resolve(this.lastKnown); } }, timeoutMs);
        this.getQueue.push((v) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(v !== null ? v : this.lastKnown);
        });
        try { this.child.stdin.write('GET\n'); } catch (err) {
          if (!settled) { settled = true; clearTimeout(timer); resolve(this.lastKnown); }
        }
      });
    });
  }

  dispose() {
    if (this.child) {
      try { this.child.kill(); } catch (err) {}
      this.child = null;
    }
    this.ready = false;
    try { if (this.scriptPath && fs.existsSync(this.scriptPath)) fs.unlinkSync(this.scriptPath); } catch (_) {}
  }
}

const manager = new WinVolumeManager();
if (process.platform === 'win32') {
  manager.start();
}

module.exports = manager;
