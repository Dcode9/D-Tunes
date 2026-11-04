import sys, math, numpy as np
from PIL import Image, ImageFilter, ImageChops
from multiprocessing import Pool
W,H,FPS=1080,1920,24
DUR=30.09; N=int(DUR*FPS)
SCN=[('s1.webp','t1','h',1100,1270),('s5.webp','t2','w',1080,1270),('s2.webp','t3','h',1100,1300),('s6.webp','t4','w',1080,1270),('s7.webp','t5','w',1080,1280)]
STS=[5.09,7.09,10.09,13.09,15.09]; SDS=[2.0,3.0,3.0,2.0,3.0]
OUT=18.09; BTN=20.09; DV0=23.09
def ease(x): x=min(1,max(0,x)); return 1-(1-x)**4      # expo-ish out
def eio(x): x=min(1,max(0,x)); return 4*x**3 if x<.5 else 1-(-2*x+2)**3/2
def pulse(t): return math.exp(-((t-0.25)%0.955)*6.0)
bg0=Image.open('bplate_phone.png').convert('RGB').resize((int(W*1.2),int(H*1.2)),Image.LANCZOS)
def prep(k):
    im=Image.open(k).convert('RGBA'); a=np.array(im).astype(float); h,w=a.shape[:2]
    yy,xx=np.mgrid[0:h,0:w]; d=np.hypot((xx-w/2)/(w/2),(yy-h/2)/(h/2))
    m=np.clip((1.0-d)/0.28,0,1); m=m*m*(3-2*m); a[...,3]*=m
    return Image.fromarray(a.astype('uint8'),'RGBA')
obj={s[0]:prep(s[0]) for s in SCN}
txt={k:Image.open(k+'.png').convert('RGBA') for k in ['t0','t1','t2','t3','t4','t5','t6']}
icon=prep('icon_color.png')
def bg(t):
    z=1.0+0.08*t/DUR; s=1.0/z
    cw,ch=int(bg0.width*s*0.83),int(bg0.height*s*0.83)
    x=int((bg0.width-cw)*(0.5+0.25*math.sin(t*0.25))); y=int((bg0.height-ch)*(0.5-0.2*math.cos(t*0.2)))
    im=bg0.crop((x,y,x+cw,y+ch)).resize((W,H),Image.BILINEAR)
    g=1.0+0.07*pulse(t)
    im=im.point(lambda v:min(255,int(v*g)))
    return im.convert('RGBA')
def mulalpha(im,a):
    if a>=0.999: return im
    r,g,b,al=im.split(); return Image.merge('RGBA',(r,g,b,al.point(lambda v:int(v*max(0,a)))))
def put(cv,im,x,y,a=1.0):
    if a<=0.004: return
    im=mulalpha(im,a); cv.paste(im,(int(x),int(y)),im)
def objput(cv,im,s,tilt,a,cx,cy):
    ow,oh=im.size; o=im.resize((max(8,int(ow*s)),int(oh*s)),Image.BILINEAR)
    if abs(tilt)>0.01: o=o.rotate(tilt,resample=Image.BICUBIC,expand=True)
    put(cv,o,cx-o.width/2,cy-o.height/2,a)
def line(cv,T,y0,y1,dy,a,m=34):
    """masked line reveal: the line slides inside a fixed window (y0..y1)"""
    if a<=0.004: return
    c=T.crop((0,y0-dy,W,y1-dy)); ar=np.array(c).astype(float); h=ar.shape[0]
    ramp=np.minimum(1,np.minimum(np.arange(h)+1,h-np.arange(h))/float(m))[:,None]; ar[...,3]*=ramp
    c=Image.fromarray(ar.astype('uint8'),'RGBA'); put(cv,c,0,y0,a)
BANDS=((165,262,0.00),(238,512,0.07),(488,610,0.16))
def scene(cv,t,k):
    t0=STS[k]; SD=SDS[k]; f,tl,o,sz,cy=SCN[k][0],SCN[k][1],SCN[k][2],SCN[k][3],SCN[k][4]
    lt=t-t0
    if lt<-0.02 or lt>SD+0.02: return
    q=0.8 if SD<2.5 else 1.0
    en=ease(lt/(0.7*q)); ex=eio((lt-(SD-0.42))/0.42)     # exit starts just before the next mark, overlaps its entry
    im=obj[f]; ow,oh=im.size; sc=(sz/oh if o=='h' else sz/ow)
    s=sc*(0.93+0.07*en)*(1+0.05*(lt/SD))*(1-0.05*ex)
    tilt=2.2*math.sin(lt*0.9+k)*(1 if k%2==0 else -1)
    cx=W/2; fy=cy+150*(1-en)-170*ex+8*math.sin(lt*1.7+k)
    objput(cv,im,s,tilt,min(1,en*1.6)*(1-ex),cx,fy)
    T=txt[tl]
    for y0,y1,dl in BANDS:
        e=ease((lt-dl)/(0.6*q)); x2=eio((lt-(SD-0.42)-dl*0.4)/0.4)
        line(cv,T,y0,y1,int(60*(1-e)-70*x2),min(1,e*1.8)*(1-x2))
def frame(i):
    t=i/FPS; cv=bg(t)
    if t<STS[0]+0.6:
        lt=t; en=ease(lt/1.1); ex=eio((lt-(STS[0]-0.42))/0.42)
        s=(460/icon.width)*(0.9+0.1*en)*(1+0.04*lt/5)
        objput(cv,icon,s,0,en*(1-ex),W/2,700+80*(1-en)-150*ex)
        T=txt['t0']
        for y0,y1,dl in ((1000,1180,0.8),(1180,1290,1.0)):
            e=ease((lt-dl)/0.8); x2=eio((lt-(STS[0]-0.42)-0.04)/0.4)
            line(cv,T,y0,y1,int(60*(1-e)-70*x2),e*(1-x2),m=30)
    for k in range(5): scene(cv,t,k)
    if OUT<=t<DV0+1.2:
        lt=t-OUT; en=ease(lt/0.8); ex=eio((t-DV0)/0.7)
        s=(280/icon.width)*(0.9+0.1*en)
        objput(cv,icon,s,0,en*(1-ex),W/2,760+60*(1-en)-100*ex)
        T=txt['t6']; OFF=170
        for hy0,hy1,dd in ((0,300,0.1),(300,560,0.2)):
            e=ease((lt-dd)/0.7); line(cv,T,hy0,hy1,int(70*(1-e)-80*ex),e*(1-ex),m=30)
        for y0,y1,d in ((880,1040,2.0),(1040,1200,2.2),(1230,1330,2.5)):
            e=ease((lt-d)/0.6)
            if e<=0: continue
            c=T.crop((0,y0,W,y1))
            put(cv,c,0,y0+OFF+int(60*(1-e))-int(80*ex),e*(1-ex))
    # D'Verse: the coded WwdcTextEffect, rendered frame by frame from its own layers
    j=i-int(24.4*FPS)
    if 0<=j and t>=24.3:
        import os
        f='beam_frames/%04d.png'%i
        if os.path.exists(f):
            d=Image.open(f).convert('RGB')
            base=cv.convert('RGB'); layer=Image.new('RGB',(W,H),(0,0,0)); layer.paste(d,(0,460))
            cv=ImageChops.screen(base,layer).convert('RGBA')
    out=cv.convert('RGB')
    if t<0.3: out=Image.blend(Image.new('RGB',(W,H)),out,t/0.3)
    if t>28.7: out=Image.blend(Image.new('RGB',(W,H)),out,max(0.0,(DUR-t)/(DUR-28.7)))
    return out
def work(i):
    frame(i).save(f'frames/{i:04d}.jpg',quality=93); return i
if __name__=='__main__':
    import os; os.makedirs('frames',exist_ok=True)
    a,b=int(sys.argv[1]),int(sys.argv[2])
    with Pool(3) as p: list(p.imap(work,range(a,min(b,N)),chunksize=4))
