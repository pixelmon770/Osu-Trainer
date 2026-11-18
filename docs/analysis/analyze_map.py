import sys, math, statistics as st

def parse(path):
    sec=None; tps=[]; objs=[]; meta={}
    for line in open(path, encoding='utf-8-sig'):
        line=line.strip()
        if line.startswith('['): sec=line; continue
        if not line or line.startswith('//'): continue
        if sec in ('[Metadata]','[Difficulty]') and ':' in line:
            k,v=line.split(':',1); meta[k]=v
        elif sec=='[TimingPoints]':
            p=line.split(',')
            t=float(p[0]); bl=float(p[1]); un = (p[6]=='1') if len(p)>6 else bl>0
            if un: tps.append((t,bl))
        elif sec=='[HitObjects]':
            p=line.split(','); x,y,t,typ=int(float(p[0])),int(float(p[1])),int(p[2]),int(p[3])
            if typ & 8: continue  # spinner
            objs.append((t,x,y,'S' if typ&2 else 'C'))
    return meta,tps,objs

def bl_at(tps,t):
    b=tps[0][1]
    for tt,bb in tps:
        if tt<=t+1: b=bb
    return b

def analyze(path):
    meta,tps,objs=parse(path)
    cs=float(meta['CircleSize']); radius=54.4-4.48*cs
    streams=[]; cur=[objs[0]]
    for a,b in zip(objs,objs[1:]):
        q=bl_at(tps,a[0])/4
        if b[0]-a[0] <= q*1.15: cur.append(b)
        else:
            if len(cur)>=5: streams.append(cur)
            cur=[b]
    if len(cur)>=5: streams.append(cur)
    length=(objs[-1][0]-objs[0][0])/1000
    out=[]
    for s in streams:
        gaps=[b[0]-a[0] for a,b in zip(s,s[1:])]
        g=st.median(gaps); bpm=60000/(4*g)
        dist=[math.hypot(b[1]-a[1],b[2]-a[2]) for a,b in zip(s,s[1:])]
        out.append(dict(start=s[0][0]/1000,n=len(s),dur=(s[-1][0]-s[0][0])/1000,bpm=bpm,
                        sp=st.mean(dist)/(2*radius), spmax=max(dist)/(2*radius)))
    # rests between streams
    rests=[out[i+1]['start']-(out[i]['start']+out[i]['dur']) for i in range(len(out)-1)]
    # 30s window: share of time in streams / stream notes
    def win_load(w=30):
        best=(0,0)
        t=objs[0][0]/1000
        while t < objs[-1][0]/1000:
            n=sum(min(x['start']+x['dur'],t+w)-max(x['start'],t) for x in out if x['start']<t+w and x['start']+x['dur']>t)
            if n>best[0]: best=(n,t)
            t+=1
        return best
    return meta,length,out,rests,win_load(), objs

for path in sys.argv[1:]:
    meta,length,out,rests,wl,objs=analyze(path)
    tot_notes=sum(x['n'] for x in out); tot_dur=sum(x['dur'] for x in out)
    print('='*70); print(meta['Title'],'['+meta['Version']+']')
    print(f"dlugosc {length:.0f}s, obiektow {len(objs)}, streamow(>=5) {len(out)}, nut w streamach {tot_notes} ({tot_notes/len(objs)*100:.0f}%), czas w streamach {tot_dur:.0f}s ({tot_dur/length*100:.0f}%)")
    ns=[x['n'] for x in out]
    print(f"dl. streamu: mediana {st.median(ns)} nut, max {max(ns)} nut / {max(x['dur'] for x in out):.1f}s")
    buckets={'5-8':0,'9-16':0,'17-32':0,'33-64':0,'65+':0}
    for n in ns:
        k='5-8' if n<=8 else '9-16' if n<=16 else '17-32' if n<=32 else '33-64' if n<=64 else '65+'
        buckets[k]+=1
    print('rozklad dlugosci:',buckets)
    print(f"nieparzyste streamy: {sum(n%2 for n in ns)}/{len(ns)}")
    bpms=[round(x['bpm']) for x in out]
    print('BPM streamow (wazone nutami):', round(sum(x['bpm']*x['n'] for x in out)/tot_notes), 'zakres', min(bpms),'-',max(bpms))
    print(f"spacing (srednia odl./srednica kola): sredni {sum(x['sp']*x['n'] for x in out)/tot_notes:.2f}, max w streamie {max(x['spmax'] for x in out):.2f}")
    sp_long=[x['sp'] for x in out if x['n']>=17]
    if sp_long: print(f"spacing w streamach 17+ nut: {st.mean(sp_long):.2f}")
    print(f"przerwy miedzy streamami: mediana {st.median(rests):.1f}s, <1s: {sum(r<1 for r in rests)}, <2s: {sum(r<2 for r in rests)} z {len(rests)}")
    print(f"najciezsze 30s: {wl[0]:.1f}s streamowania (od {wl[1]:.0f}s)")
    # quartiles of map
    q=length/4; t0=objs[0][0]/1000
    for i in range(4):
        part=[x for x in out if t0+i*q<=x['start']<t0+(i+1)*q]
        if part:
            print(f"  cwiartka {i+1}: {sum(x['dur'] for x in part):.0f}s streamow, {sum(x['n'] for x in part)} nut, BPM {round(sum(x['bpm']*x['n'] for x in part)/sum(x['n'] for x in part))}, spacing {sum(x['sp']*x['n'] for x in part)/sum(x['n'] for x in part):.2f}, najdl. {max(x['n'] for x in part)} nut")
    print('top 8 najdluzszych:')
    for x in sorted(out,key=lambda x:-x['n'])[:8]:
        m,s=divmod(int(x['start']),60)
        print(f"   {m}:{s:02d}  {x['n']} nut  {x['dur']:.1f}s  {x['bpm']:.0f}bpm  spacing {x['sp']:.2f}")
