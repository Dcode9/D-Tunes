const fs = require('fs'),path = require('path'),vm = require('vm'),assert = require('assert/strict');
const src=fs.readFileSync(path.join(__dirname, '../src/js/ui.js'),'utf8');
const state={likedIds:[],libraryIds:[],playHistory:[],queue:[],userQueue:[],currentTrack:null,likedArtists:[]};
const songStore={songs:new Map(),counter:0,add(s){let id='song_'+this.counter++;this.songs.set(id,s);return id}};
const nodes=new Map();let rendered=[];
const ctx={state,songStore,document:{getElementById:id=>nodes.get(id)||null},updateMarquees(){},console};
vm.createContext(ctx);vm.runInContext(src+';globalThis.ui=ui;',ctx);const ui=ctx.ui;
ui.createSongPill=(s,handler)=>{assert.equal(typeof s,'object');assert(s.id);rendered.push(s.id);return '<song>'+s.id+'</song>'};
ui.updateLibraryStats=()=>{};ui.renderDownloads=()=>{};
const A={id:'a',name:'Liked Amber',artist:'Fixture'},B={id:'b',name:'Library Blue',artist:'Fixture'},C={id:3,name:'Legacy Coral'};
function ids(xs){return Array.from(ui.resolveStoredSongList(xs).songs,x=>x.id)}
let count=0;function test(label,fn){fn();count++;console.log('PASS',label)}
test('objects/order preserved',()=>assert.deepEqual(ids([A,B]),['a','b']));
test('history ID metadata',()=>{state.playHistory=[A];assert.deepEqual(ids(['a']),['a'])});
test('library ID metadata',()=>{state.libraryIds=[B];assert.deepEqual(ids(['b']),['b'])});
test('liked ID metadata',()=>{state.likedIds=[A];assert.deepEqual(ids(['a']),['a'])});
test('current queue metadata',()=>{state.queue=[C];assert.deepEqual(ids(['3']),[3])});
test('song store metadata',()=>{songStore.songs.set('x',C);state.queue=[];assert.deepEqual(ids([3]),[3])});
test('dedupe normalized ID',()=>assert.deepEqual(ids([C,'3',3]),[3]));
test('bad entries safe',()=>assert.deepEqual(ids([null,undefined,false,{},[],{id:{}}]),[]));
test('unresolved IDs never become song strings',()=>assert.equal(ui.resolveStoredSongList(['unknown']).unresolved,1));
test('no state mutation',()=>{const s=JSON.stringify(state);ui.resolveStoredSongList(['unknown',A]);assert.equal(JSON.stringify(state),s)});
function draw(likes,library,withLibrary=true){nodes.clear();if(withLibrary)nodes.set('library-songs',{innerHTML:''});nodes.set('full-liked-list',{innerHTML:''});state.likedIds=likes;state.libraryIds=library;ui.renderLibraryLists();return {liked:nodes.get('full-liked-list').innerHTML,library:nodes.get('library-songs')?.innerHTML}}
test('liked excludes library-only',()=>{const x=draw([A],[A,B]);assert(x.liked.includes('<song>a</song>'));assert(!x.liked.includes('<song>b</song>'));assert(!x.library.includes('<song>b</song>'))});
test('empty likes despite saved library',()=>{const x=draw([],[B]);assert(x.liked.includes('No liked songs yet'));assert(!x.liked.includes('<song>b</song>'))});
test('liked works without library DOM',()=>assert(draw([A],[],false).liked.includes('<song>a</song>')));
test('unlike retains library only',()=>{draw([A],[A,B]);const x=draw([],[A,B]);assert(!x.liked.includes('<song>a</song>'));assert(!x.library.includes('<song>a</song>'))});
test('uncached legacy honest state',()=>{const x=draw(['missing'],[]);assert(x.liked.includes('Some liked songs need details'));assert(!x.liked.includes('No liked songs yet'));assert(x.liked.includes('Open Liked Songs'))});
test('preview equals full liked list',()=>{const x=draw([A],[A,B]);assert.equal(x.liked,x.library)});
console.log(count+' cases passed');
