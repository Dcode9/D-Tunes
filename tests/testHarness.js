/**
 * D-Tunes Web Test Harness & Browser Environment Simulator
 * 
 * Provides a lightweight, high-fidelity browser environment simulation for Node.js native testing.
 * Includes DOM emulation, Storage (localStorage/sessionStorage), Web Audio API mocks,
 * HTMLAudioElement mock, Navigator (vibrate, mediaSession), and Fetch mocking.
 */

const fs = require('fs');
const path = require('path');

// --- In-Memory Storage Mock ---
class MockStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(String(key)) ? this.store.get(String(key)) : null;
    }
    setItem(key, value) {
        this.store.set(String(key), String(value));
    }
    removeItem(key) {
        this.store.delete(String(key));
    }
    clear() {
        this.store.clear();
    }
    key(index) {
        const keys = Array.from(this.store.keys());
        return keys[index] || null;
    }
    get length() {
        return this.store.size;
    }
    getAllKeys() {
        return Array.from(this.store.keys());
    }
}

// --- Mock DOM ClassList ---
class MockClassList {
    constructor(element) {
        this.element = element;
        this.classes = new Set();
    }
    add(...classNames) {
        for (const cls of classNames) {
            if (cls) {
                cls.split(/\s+/).filter(Boolean).forEach(c => this.classes.add(c));
            }
        }
    }
    remove(...classNames) {
        for (const cls of classNames) {
            if (cls) {
                cls.split(/\s+/).filter(Boolean).forEach(c => this.classes.delete(c));
            }
        }
    }
    toggle(className, force) {
        if (typeof force === 'boolean') {
            if (force) this.add(className);
            else this.remove(className);
            return force;
        }
        if (this.contains(className)) {
            this.remove(className);
            return false;
        } else {
            this.add(className);
            return true;
        }
    }
    contains(className) {
        return this.classes.has(className);
    }
    toString() {
        return Array.from(this.classes).join(' ');
    }
}

// --- Mock DOM Element ---
class MockElement {
    constructor(tagName = 'div', id = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.classList = new MockClassList(this);
        this._innerHTML = '';
        this.textContent = '';
        this.value = '';
        this.disabled = false;
        this.style = {
            _properties: {},
            setProperty(prop, val) { this._properties[prop] = String(val); this[prop] = String(val); },
            getPropertyValue(prop) { return this._properties[prop] || this[prop] || ''; },
            removeProperty(prop) { delete this._properties[prop]; delete this[prop]; }
        };
        this.dataset = {};
        this.attributes = new Map();
        this.children = [];
        this.parentElement = null;
        this.offsetParent = {};
        this.offsetWidth = 300;
        this.offsetHeight = 60;
        this.clientWidth = 300;
        this.clientHeight = 60;
        this.scrollWidth = 300;
        this.scrollHeight = 60;
        this._eventListeners = new Map();
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(html) {
        this._innerHTML = String(html || '');
        if (!this.textContent && !this._innerHTML.includes('<')) {
            this.textContent = this._innerHTML;
        }
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this.id = value;
        if (name === 'class') {
            this.classList.classes.clear();
            this.classList.add(value);
        }
        if (name.startsWith('data-')) {
            const camelKey = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
            this.dataset[camelKey] = String(value);
        }
    }

    getAttribute(name) {
        if (name === 'id') return this.id || null;
        if (name === 'class') return this.classList.toString() || null;
        return this.attributes.get(name) || null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === 'id') this.id = '';
        if (name === 'class') this.classList.classes.clear();
    }

    appendChild(child) {
        if (child) {
            child.parentElement = this;
            this.children.push(child);
        }
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.parentElement = null;
        }
        return child;
    }

    addEventListener(event, handler) {
        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, []);
        }
        this._eventListeners.get(event).push(handler);
    }

    removeEventListener(event, handler) {
        if (!this._eventListeners.has(event)) return;
        const list = this._eventListeners.get(event);
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
    }

    dispatchEvent(event) {
        const type = typeof event === 'string' ? event : event.type;
        const evtObj = typeof event === 'string' ? { type: event, target: this } : { ...event, target: this };
        const handlers = this._eventListeners.get(type) || [];
        for (const handler of handlers) {
            handler.call(this, evtObj);
        }
        return true;
    }

    click() {
        this.dispatchEvent({ type: 'click' });
    }

    focus() {
        this.dispatchEvent({ type: 'focus' });
    }

    blur() {
        this.dispatchEvent({ type: 'blur' });
    }

    querySelector(selector) {
        if (selector.startsWith('#')) {
            const targetId = selector.slice(1);
            if (this.id === targetId) return this;
            for (const child of this.children) {
                if (child.id === targetId) return child;
                const found = child.querySelector(selector);
                if (found) return found;
            }
        }
        if (selector.startsWith('.')) {
            const targetClass = selector.slice(1);
            if (this.classList.contains(targetClass)) return this;
            for (const child of this.children) {
                if (child.classList.contains(targetClass)) return child;
                const found = child.querySelector(selector);
                if (found) return found;
            }
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const match = (el) => {
            if (selector.startsWith('#') && el.id === selector.slice(1)) results.push(el);
            else if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) results.push(el);
            else if (selector.toUpperCase() === el.tagName) results.push(el);
            for (const child of el.children) match(child);
        };
        match(this);
        return results;
    }
}

// --- Mock Audio Context ---
class MockAudioParam {
    constructor(defaultValue = 0) {
        this.value = defaultValue;
        this.timeline = [];
    }
    setValueAtTime(val, time) {
        this.value = val;
        this.timeline.push({ type: 'set', value: val, time });
    }
    linearRampToValueAtTime(val, time) {
        this.value = val;
        this.timeline.push({ type: 'linear', value: val, time });
    }
    exponentialRampToValueAtTime(val, time) {
        this.value = val;
        this.timeline.push({ type: 'exponential', value: val, time });
    }
}

class MockAudioNode {
    constructor(type = 'node') {
        this.type = type;
        this.connectedTo = [];
    }
    connect(target) {
        this.connectedTo.push(target);
        return target;
    }
    disconnect() {
        this.connectedTo = [];
    }
}

class MockGainNode extends MockAudioNode {
    constructor() {
        super('gain');
        this.gain = new MockAudioParam(1.0);
    }
}

class MockBiquadFilterNode extends MockAudioNode {
    constructor() {
        super('biquad');
        this.frequency = new MockAudioParam(1000);
        this.gain = new MockAudioParam(0);
        this.Q = new MockAudioParam(1.414);
        this.type = 'peaking';
    }
}

class MockDynamicsCompressorNode extends MockAudioNode {
    constructor() {
        super('compressor');
        this.threshold = new MockAudioParam(-24);
        this.knee = new MockAudioParam(30);
        this.ratio = new MockAudioParam(12);
        this.attack = new MockAudioParam(0.003);
        this.release = new MockAudioParam(0.25);
    }
}

class MockAnalyserNode extends MockAudioNode {
    constructor() {
        super('analyser');
        this.fftSize = 2048;
        this.frequencyBinCount = 1024;
    }
    getByteFrequencyData(array) {
        for (let i = 0; i < array.length; i++) array[i] = 128;
    }
}

class MockAudioContext {
    constructor() {
        this.currentTime = 0;
        this.state = 'running';
        this.destination = new MockAudioNode('destination');
    }
    createGain() { return new MockGainNode(); }
    createBiquadFilter() { return new MockBiquadFilterNode(); }
    createDynamicsCompressor() { return new MockDynamicsCompressorNode(); }
    createAnalyser() { return new MockAnalyserNode(); }
    createMediaElementSource(mediaEl) {
        const source = new MockAudioNode('mediaElementSource');
        source.mediaElement = mediaEl;
        return source;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
}

// --- Mock HTMLAudioElement ---
class MockAudioElement {
    constructor() {
        this.src = '';
        this.currentTime = 0;
        this.duration = 240;
        this.volume = 1.0;
        this.paused = true;
        this.ended = false;
        this.loop = false;
        this.muted = false;
        this._listeners = new Map();
    }
    play() {
        this.paused = false;
        this.ended = false;
        this.dispatchEvent('play');
        return Promise.resolve();
    }
    pause() {
        this.paused = true;
        this.dispatchEvent('pause');
    }
    load() {
        this.dispatchEvent('load');
    }
    addEventListener(evt, fn) {
        if (!this._listeners.has(evt)) this._listeners.set(evt, []);
        this._listeners.get(evt).push(fn);
    }
    removeEventListener(evt, fn) {
        if (!this._listeners.has(evt)) return;
        const list = this._listeners.get(evt);
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
    }
    dispatchEvent(evtName) {
        const list = this._listeners.get(evtName) || [];
        for (const fn of list) fn({ type: evtName, target: this });
    }
}

// --- Mock Canvas Context ---
class MockCanvasContext2D {
    constructor() {
        this.fillStyle = '';
        this.strokeStyle = '';
        this.lineWidth = 1;
    }
    fillRect() {}
    clearRect() {}
    beginPath() {}
    moveTo() {}
    lineTo() {}
    arc() {}
    stroke() {}
    fill() {}
    setTransform() {}
    save() {}
    restore() {}
}

class MockCanvasElement extends MockElement {
    constructor(id = '') {
        super('canvas', id);
        this.width = 300;
        this.height = 150;
        this._ctx = new MockCanvasContext2D();
    }
    getContext(type) {
        if (type === '2d') return this._ctx;
        return null;
    }
}

// --- DOM Document Simulator ---
class MockDocument {
    constructor() {
        this.elements = new Map();
        this.body = new MockElement('body', 'body');
        this.documentElement = new MockElement('html', 'html');
        this._eventListeners = new Map();
        this.visibilityState = 'visible';
    }

    getElementById(id) {
        if (this.elements.has(id)) return this.elements.get(id);
        const el = id === 'visualizer-canvas' ? new MockCanvasElement(id) : new MockElement('div', id);
        this.elements.set(id, el);
        return el;
    }

    createElement(tagName) {
        if (tagName.toLowerCase() === 'canvas') return new MockCanvasElement();
        if (tagName.toLowerCase() === 'textarea') {
            const el = new MockElement('textarea');
            return el;
        }
        return new MockElement(tagName);
    }

    querySelector(selector) {
        if (selector.startsWith('#')) {
            return this.getElementById(selector.slice(1));
        }
        return this.body.querySelector(selector);
    }

    querySelectorAll(selector) {
        const res = [];
        if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            for (const el of this.elements.values()) {
                if (el.classList.contains(cls)) res.push(el);
            }
        }
        return res;
    }

    addEventListener(event, handler) {
        if (!this._eventListeners.has(event)) this._eventListeners.set(event, []);
        this._eventListeners.get(event).push(handler);
    }

    removeEventListener(event, handler) {
        if (!this._eventListeners.has(event)) return;
        const list = this._eventListeners.get(event);
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
    }

    dispatchEvent(event) {
        const type = typeof event === 'string' ? event : event.type;
        const evtObj = typeof event === 'string' ? { type: event, target: this } : { ...event, target: this };
        const handlers = this._eventListeners.get(type) || [];
        for (const handler of handlers) handler.call(this, evtObj);
        return true;
    }
}

// --- Environment Factory ---
function createTestEnvironment(customFetchHandler = null) {
    const localStorage = new MockStorage();
    const sessionStorage = new MockStorage();
    const document = new MockDocument();
    const audioInstance = new MockAudioElement();

    const vibrations = [];
    const navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 5,
        vibrate: (pattern) => {
            vibrations.push(pattern);
            return true;
        },
        mediaSession: {
            metadata: null,
            playbackState: 'none',
            setActionHandler: () => {},
            setPositionState: () => {}
        }
    };

    const mockFetch = customFetchHandler || (async (url, options = {}) => {
        const urlStr = String(url);
        // Default Mock JioSaavn / API responses
        if (urlStr.includes('/api/songs') || urlStr.includes('song=')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: [
                        {
                            id: 'mock_s1',
                            name: 'Kesariya',
                            title: 'Kesariya',
                            artist: 'Arijit Singh, Pritam',
                            primaryArtists: 'Arijit Singh',
                            album: 'Brahmastra',
                            year: '2022',
                            duration: 268,
                            duration_seconds: 268,
                            image: 'https://example.com/art1.jpg',
                            img: 'https://example.com/art1.jpg',
                            url: 'https://example.com/audio1.mp4'
                        }
                    ]
                })
            };
        }

        if (urlStr.includes('/api/albums') || urlStr.includes('album=')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        id: 'mock_alb1',
                        name: 'Rockstar',
                        title: 'Rockstar',
                        artist: 'A.R. Rahman',
                        primaryArtists: 'A.R. Rahman',
                        year: '2011',
                        image: 'https://example.com/rockstar.jpg',
                        songs: [
                            { id: 'mock_r1', name: 'Kun Faya Kun', title: 'Kun Faya Kun', artist: 'A.R. Rahman, Javed Ali', duration: 473, duration_seconds: 473, image: 'https://example.com/rockstar.jpg', url: 'https://example.com/kunfaya.mp4' },
                            { id: 'mock_r2', name: 'Nadaan Parindey', title: 'Nadaan Parindey', artist: 'A.R. Rahman, Mohit Chauhan', duration: 386, duration_seconds: 386, image: 'https://example.com/rockstar.jpg', url: 'https://example.com/nadaan.mp4' },
                            { id: 'mock_r3', name: 'Tum Ho', title: 'Tum Ho', artist: 'Mohit Chauhan, Suzanne D\'Mello', duration: 318, duration_seconds: 318, image: 'https://example.com/rockstar.jpg', url: 'https://example.com/tumho.mp4' }
                        ]
                    }
                })
            };
        }

        if (urlStr.includes('/api/artists') || urlStr.includes('artist=')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        id: 'mock_art1',
                        name: 'Arijit Singh',
                        image: 'https://example.com/arijit.jpg',
                        topSongs: [
                            { id: 'mock_a1', name: 'Tum Hi Ho', title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: 262, image: 'https://example.com/aashiqui.jpg', url: 'https://example.com/tumhiho.mp4' },
                            { id: 'mock_a2', name: 'Channa Mereya', title: 'Channa Mereya', artist: 'Arijit Singh, Pritam', duration: 289, image: 'https://example.com/adhm.jpg', url: 'https://example.com/channa.mp4' },
                            { id: 'mock_a3', name: 'Shayad', title: 'Shayad', artist: 'Arijit Singh, Pritam', duration: 247, image: 'https://example.com/laj2.jpg', url: 'https://example.com/shayad.mp4' },
                            { id: 'mock_a4', name: 'Agar Tum Saath Ho', title: 'Agar Tum Saath Ho', artist: 'Arijit Singh, Alka Yagnik', duration: 341, image: 'https://example.com/tamasha.jpg', url: 'https://example.com/tamasha.mp4' },
                            { id: 'mock_a5', name: 'Ae Dil Hai Mushkil', title: 'Ae Dil Hai Mushkil', artist: 'Arijit Singh, Pritam', duration: 269, image: 'https://example.com/adhm.jpg', url: 'https://example.com/adhm.mp4' }
                        ],
                        albums: [
                            { id: 'mock_alb_a1', name: 'Aashiqui 2', year: '2013', image: 'https://example.com/aashiqui.jpg' },
                            { id: 'mock_alb_a2', name: 'Ae Dil Hai Mushkil', year: '2016', image: 'https://example.com/adhm.jpg' }
                        ]
                    }
                })
            };
        }

        // Default empty successful response
        return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [] })
        };
    });

    const window = {
        localStorage,
        sessionStorage,
        document,
        navigator,
        fetch: mockFetch,
        Audio: function() { return audioInstance; },
        AudioContext: MockAudioContext,
        webkitAudioContext: MockAudioContext,
        devicePixelRatio: 2,
        innerWidth: 1024,
        innerHeight: 768,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame: (cb) => setTimeout(cb, 16),
        cancelAnimationFrame: (id) => clearTimeout(id),
        performance: { now: () => Date.now() },
        addEventListener: (evt, fn) => document.addEventListener(evt, fn),
        removeEventListener: (evt, fn) => document.removeEventListener(evt, fn),
        dispatchEvent: (evt) => document.dispatchEvent(evt)
    };

    return {
        window,
        document,
        localStorage,
        sessionStorage,
        navigator,
        audio: audioInstance,
        vibrations,
        fetch: mockFetch
    };
}

module.exports = {
    MockStorage,
    MockElement,
    MockDocument,
    MockAudioElement,
    MockAudioContext,
    createTestEnvironment
};
