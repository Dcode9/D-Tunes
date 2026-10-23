'use strict';

// Windows system (master) volume control via Core Audio, with zero native
// dependencies: a single long-lived PowerShell worker compiles a tiny C#
// CoreAudio helper once, then reads volume values from stdin.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

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
        Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(v, Guid.Empty));
    }

    public static float Get() {
        Ensure();
        float v;
        Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out v));
        return v;
    }
}
'@
if ($?) { [Console]::Out.WriteLine('VOLREADY') } else { [Console]::Out.WriteLine('VOLFAIL') }
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

let child = null;
let ready = false;
let unusable = false;
let startFailed = false;
let lastSet = null;
let stdoutBuf = '';
const waiters = [];
const getQueue = [];

function start() {
  if (child || startFailed || process.platform !== 'win32') return;
  try {
    const scriptPath = path.join(os.tmpdir(), `dtunes-volume-${process.pid}.ps1`);
    fs.writeFileSync(scriptPath, PS_SCRIPT, 'utf8');
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', onData);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => {});
    child.on('exit', () => { child = null; ready = false; });
    child.on('error', () => { startFailed = true; child = null; });
  } catch (err) {
    startFailed = true;
    child = null;
  }
}

function onData(chunk) {
  stdoutBuf += chunk;
  let nl;
  while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (line === 'VOLREADY') {
      ready = true;
      if (lastSet !== null) writeLine(lastSet);
      while (waiters.length) waiters.shift()(true);
      continue;
    }
    if (line === 'VOLFAIL') {
      unusable = true;
      while (waiters.length) waiters.shift()(false);
      continue;
    }
    if (line.startsWith('VAL ')) {
      const cb = getQueue.shift();
      if (cb) cb(parseFloat(line.slice(4)));
      continue;
    }
    if (line === 'ERR') {
      const cb = getQueue.shift();
      if (cb) cb(null);
      continue;
    }
  }
}

function writeLine(value) {
  if (!child || !ready) return;
  try { child.stdin.write(`${value}\n`); } catch (err) {}
}

function whenReady(timeoutMs, cb) {
  if (ready) { cb(true); return; }
  if (unusable || startFailed) { cb(false); return; }
  start();
  let done = false;
  const timer = setTimeout(() => { if (!done) { done = true; cb(false); } }, timeoutMs);
  waiters.push((ok) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    cb(ok);
  });
}

function setVolume(value) {
  const val = Math.max(0, Math.min(1, Number(value)));
  if (!Number.isFinite(val)) return;
  lastSet = val;
  if (ready) { writeLine(val); return; }
  whenReady(10000, (ok) => { if (ok) writeLine(lastSet); });
}

function getVolume(timeoutMs = 8000) {
  return new Promise((resolve) => {
    whenReady(timeoutMs, (ok) => {
      if (!ok || !ready) { resolve(null); return; }
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs);
      getQueue.push((v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      });
      try { child.stdin.write('GET\n'); } catch (err) { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } }
    });
  });
}

function dispose() {
  if (child) {
    try { child.kill(); } catch (err) {}
    child = null;
  }
  ready = false;
}

module.exports = { setVolume, getVolume, dispose, isSupported: () => process.platform === 'win32' };
