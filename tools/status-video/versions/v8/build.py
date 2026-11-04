#!/usr/bin/env python3
"""Rebuild the D'Tunes WhatsApp Status video (1080x1920, 24 fps, 30.09 s).

    python3 build.py /path/to/audio-3ae9e05b.mp3 out.mp4
    python3 build.py --frames 580 700 --preview        # render a range only, no encode

Needs Google Chrome and ffmpeg. No Python packages beyond the standard library.
Every frame is drawn by scene.js in headless Chrome and captured over the DevTools protocol.
"""
import argparse, base64, functools, http.server, json, os, shutil, socket, struct, subprocess, sys, tempfile, threading, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FPS, DUR = 24, 30.09
NF = int(DUR * FPS)


def find_chrome():
    env = os.environ.get('CHROME')
    if env:
        return env
    for name in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'):
        p = shutil.which(name)
        if p:
            return p
    for p in (r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
              os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
              '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'):
        if os.path.exists(p):
            return p
    sys.exit('Google Chrome not found (set CHROME=/path/to/chrome)')


class CDP:
    """Minimal DevTools-protocol client over a raw WebSocket."""

    def __init__(self, ws_url):
        hostport, path = ws_url[len('ws://'):].split('/', 1)
        host, port = hostport.split(':')
        self.sock = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f'GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                           f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        self.f = self.sock.makefile('rb')
        if b' 101 ' not in self.f.readline():
            raise RuntimeError('DevTools websocket handshake failed')
        while self.f.readline() not in (b'\r\n', b''):
            pass
        self.n = 0

    def _send(self, text):
        data = text.encode()
        n = len(data)
        head = bytearray([0x81])
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126); head += struct.pack('>H', n)
        else:
            head.append(0x80 | 127); head += struct.pack('>Q', n)
        mask = os.urandom(4)
        m = (mask * (n // 4 + 1))[:n]
        body = (int.from_bytes(data, 'big') ^ int.from_bytes(m, 'big')).to_bytes(n, 'big') if n else b''
        self.sock.sendall(bytes(head) + mask + body)

    def _recv(self):
        parts = []
        while True:
            b0, b1 = self.f.read(2)
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack('>H', self.f.read(2))[0]
            elif n == 127:
                n = struct.unpack('>Q', self.f.read(8))[0]
            payload = self.f.read(n)
            op = b0 & 0x0F
            if op == 8:
                raise EOFError('DevTools connection closed')
            if op in (0, 1, 2):
                parts.append(payload)
                if b0 & 0x80:
                    return b''.join(parts)

    def call(self, method, **params):
        self.n += 1
        self._send(json.dumps({'id': self.n, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self._recv())
            if msg.get('id') == self.n:
                if 'error' in msg:
                    raise RuntimeError(f'{method}: {msg["error"]}')
                return msg.get('result', {})

    def eval(self, expr, await_promise=False):
        r = self.call('Runtime.evaluate', expression=expr, awaitPromise=await_promise, returnByValue=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:2000])
        return r.get('result', {}).get('value')


def serve(root):
    handler = functools.partial(type('Quiet', (http.server.SimpleHTTPRequestHandler,), {'log_message': lambda *a: None}), directory=root)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def render(frames_dir, indices, quality):
    chrome = find_chrome()
    srv = serve(HERE)
    profile = tempfile.mkdtemp(prefix='dtunes-chrome-')
    proc = subprocess.Popen([chrome, '--headless=new', '--remote-debugging-port=0', f'--user-data-dir={profile}', '--no-first-run',
                             '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
                             '--disable-gpu', '--window-size=1080,1920', 'about:blank'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        port_file = os.path.join(profile, 'DevToolsActivePort')
        for _ in range(300):
            if os.path.exists(port_file) and open(port_file).read().strip():
                break
            time.sleep(0.1)
        port = open(port_file).read().split()[0]
        pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list'))
        cdp = CDP(next(p for p in pages if p['type'] == 'page')['webSocketDebuggerUrl'])
        cdp.call('Emulation.setDeviceMetricsOverride', width=1080, height=1920, deviceScaleFactor=1, mobile=False)
        cdp.call('Page.enable')
        cdp.call('Page.navigate', url=f'http://127.0.0.1:{srv.server_address[1]}/scene.html')
        for _ in range(600):
            state = cdp.eval('window.__error || (window.__ready === true)')
            if state is True:
                break
            if isinstance(state, str):
                sys.exit('scene.js failed: ' + state)
            time.sleep(0.1)
        else:
            sys.exit('scene.js did not become ready')
        os.makedirs(frames_dir, exist_ok=True)
        t0 = time.time()
        for done, i in enumerate(indices, 1):
            cdp.eval(f'renderFrame({i})', await_promise=True)
            shot = cdp.call('Page.captureScreenshot', format='jpeg', quality=quality, optimizeForSpeed=False)
            with open(os.path.join(frames_dir, f'{i:04d}.jpg'), 'wb') as fh:
                fh.write(base64.b64decode(shot['data']))
            if done % 48 == 1 or done == len(indices):
                print(f'  frame {i:4d}  ({done}/{len(indices)}, {(time.time() - t0) / done:.2f}s/frame)', flush=True)
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('mp3', nargs='?', help="the soundtrack, audio-3ae9e05b.mp3 (54.12 s)")
    ap.add_argument('out', nargs='?', default='dtunes_status_feature_video.mp4')
    ap.add_argument('--frames', nargs=2, type=int, metavar=('FIRST', 'LAST'), help='render frames FIRST..LAST-1 only')
    ap.add_argument('--at', help='comma-separated times in seconds to render (implies --preview)')
    ap.add_argument('--preview', action='store_true', help='render frames only, skip audio and encode')
    ap.add_argument('--quality', type=int, default=96, help='JPEG quality of the intermediate frames')
    a = ap.parse_args()
    if a.at:
        a.preview = True
    if not a.preview and not a.mp3:
        ap.error('path to the soundtrack mp3 is required (or use --preview)')
    frames = os.path.join(HERE, 'frames')
    if a.at:
        indices = sorted({min(NF - 1, round(float(s) * FPS)) for s in a.at.split(',')})
    else:
        first, last = a.frames if a.frames else (0, NF)
        indices = list(range(first, min(last, NF)))
    print(f'rendering {len(indices)} frames', flush=True)
    render(frames, indices, a.quality)
    if a.preview:
        return
    mix = os.path.join(HERE, 'mix.wav')
    # soundtrack: the first 30.09 s of the supplied MP3, 0.1 s fade in, fade out 23.09-30.09, loudnorm. No SFX.
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', '0', '-t', str(DUR), '-i', os.path.abspath(a.mp3), '-af',
                    'aresample=44100,afade=t=in:d=0.1,afade=t=out:st=23.09:d=7.0,loudnorm=I=-15:TP=-1.5:LRA=11', mix], check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', os.path.join(frames, '%04d.jpg'), '-i', mix,
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-x264-params', 'aq-mode=3', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', os.path.abspath(a.out)], check=True)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
