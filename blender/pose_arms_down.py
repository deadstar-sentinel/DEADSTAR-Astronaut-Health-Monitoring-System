from lib import *
import sys
g=Glb("/tmp/twin_v7.glb")
ss=lambda a,b,x: (lambda t: t*t*(3-2*t))(np.clip((x-a)/(b-a),0,1))
def rot(P,pivot,axis,ang):  # per-vertex angle (N,), Rodrigues about axis through pivot
    v=P-pivot; c=np.cos(ang)[:,None]; s=np.sin(ang)[:,None]
    return pivot+v*c+np.cross(axis,v)*s+axis*(v@axis)[:,None]*(1-c)
def rotn(N,axis,ang):
    c=np.cos(ang)[:,None]; s=np.sin(ang)[:,None]
    return N*c+np.cross(axis,N)*s+axis*(N@axis)[:,None]*(1-c)
body=[(nd,p) for nd,p in g.meshes() if nd["name"]=="Body"][0]
PB=g.world(*body)
# centerline of the right arm (x>0), shoulder -> tip
A=PB[(PB[:,0]>0.195)&(PB[:,1]>0.88)]; tip=A[np.argmax(A[:,0])]; dist=np.linalg.norm(A-tip,axis=1)
cl=[]
for a in np.arange(0,dist.max(),0.03):
    S=A[(dist>=a)&(dist<a+0.03)]
    if len(S)>3: cl.append(S.mean(0))
cl=np.array([tip]+cl)[::-1]                      # shoulder first
# smooth the centerline a little
for _ in range(2): cl[1:-1]=(cl[:-2]+2*cl[1:-1]+cl[2:])/4
seg=np.linalg.norm(np.diff(cl,axis=0),axis=1); arc=np.concatenate([[0],np.cumsum(seg)])
def project(P):
    best_r=np.full(len(P),1e9); best_s=np.zeros(len(P))
    for i in range(len(cl)-1):
        a,b=cl[i],cl[i+1]; ab=b-a; L2=ab@ab
        t=np.clip(((P-a)@ab)/L2,0,1); q=a+t[:,None]*ab; r=np.linalg.norm(P-q,axis=1)
        m=r<best_r; best_r[m]=r[m]; best_s[m]=arc[i]+t[m]*np.sqrt(L2)
    return best_s,best_r
at=lambda s: np.array([np.interp(s,arc,cl[:,k]) for k in range(3)])
S_SH=0.03; S_EL=arc[-1]-0.44; S_WR=arc[-1]-0.19        # arc positions of shoulder pivot, elbow, wrist
SH,EL,WR=at(S_SH),at(S_EL),at(S_WR)
u=(EL-SH)/np.linalg.norm(EL-SH); f=(WR-EL)/np.linalg.norm(WR-EL)
bend=np.degrees(np.arccos(u@f)); print("arc",arc[-1].round(3),"SH",SH.round(3),"EL",EL.round(3),"WR",WR.round(3),"bend",bend.round(1),"upper",np.linalg.norm(EL-SH).round(3),"fore",np.linalg.norm(WR-EL).round(3))
RES=float(sys.argv[1]) if len(sys.argv)>1 else 10.0; OUT=float(sys.argv[2]) if len(sys.argv)>2 else 12.0
ax1=np.cross(f,u); ax1/=np.linalg.norm(ax1); ang1=np.radians(max(0,bend-RES))
tgt=np.array([np.sin(np.radians(OUT)),-np.cos(np.radians(OUT)),0.035]); tgt/=np.linalg.norm(tgt)
ax2=np.cross(u,tgt); ax2/=np.linalg.norm(ax2); ang2=np.arccos(np.clip(u@tgt,-1,1))
print("elbow rot",np.degrees(ang1).round(1),"shoulder rot",np.degrees(ang2).round(1))
def skin(P,N=None,R0=0.085,R1=0.125):
    s,r=project(P)
    m=1-ss(R0,R1,r)
    w1=m*ss(S_EL-0.06,S_EL+0.06,s); w2=m*ss(S_SH-0.01,S_SH+0.11,s)
    P1=rot(P,EL,ax1,ang1*w1); P2=rot(P1,SH,ax2,ang2*w2)
    if N is not None: N=rotn(rotn(N,ax1,ang1*w1),ax2,ang2*w2)
    return P2,N
# new joints (for rigid mapping of bones / vessels)
J,_=skin(np.array([SH,EL,WR])); SHn,ELn,WRn=J
print("new EL",ELn.round(3),"new WR",WRn.round(3))
mir=np.array([-1,1,1.0])
def apply_side(P,N,fn,side):
    Pm=P*([side,1,1]); Nm=N*([side,1,1]) if N is not None else None
    Pm,Nm=fn(Pm,Nm); return Pm*([side,1,1]), (Nm*([side,1,1]) if Nm is not None else None)
def write(nd,p,P,N):
    T=np.array(nd.get("translation",[0,0,0])); v=g.view(p["attributes"]["POSITION"]); v[:]=(P-T).astype(np.float32)
    a=g.j["accessors"][p["attributes"]["POSITION"]]; a["min"]=[float(x) for x in v.min(0)]; a["max"]=[float(x) for x in v.max(0)]
    if N is not None:
        n=g.view(p["attributes"]["NORMAL"]); N=N/(np.linalg.norm(N,axis=1,keepdims=True)+1e-12); n[:]=N.astype(np.float32)
# ---- body skin
nd,p=body; P=PB.copy(); N=g.view(p["attributes"]["NORMAL"]).astype(np.float64)
for side in (1,-1):
    sel=(P[:,0]*side>0.12)&(P[:,1]>0.85)
    Ps,Ns=apply_side(P[sel],N[sel],skin,side); P[sel]=Ps; N[sel]=Ns
write(nd,p,P,N)
# ---- arm bones / vessels / hotspot: rigid map old straight line -> new line, blended in from the shoulder
bones=[(nd,p) for nd,p in g.meshes() if nd["name"]=="ORG_bones_arm"][0]
Pb=g.world(*bones); R=Pb[Pb[:,0]>0.1]; c=R.mean(0); d=np.linalg.svd(R-c,full_matrices=False)[2][0]; d=d if d[1]<0 else -d
t=(R-c)@d; O0=c+d*t.min(); O1=c+d*t.max(); Lold=t.max()-t.min()
print("old bone line",O0.round(3),O1.round(3),Lold.round(3))
N0=SHn+ (ELn-SHn)*0.02; N1=WRn-(WRn-ELn)/np.linalg.norm(WRn-ELn)*0.005; dn=(N1-N0)/np.linalg.norm(N1-N0); k=np.linalg.norm(N1-N0)/Lold
axr=np.cross(d,dn); axr/=np.linalg.norm(axr); angr=np.arccos(np.clip(d@dn,-1,1))
def rigid(P,N=None):
    q=(P-O0)@d; rr=np.linalg.norm((P-O0)-np.outer(q,d),axis=1)
    w=ss(-0.02,0.07,q)*(1-ss(0.08,0.14,rr))
    Pr=rot(P,O0,axr,angr*w)
    dd=rotn(np.tile(d,(len(P),1)),axr,angr*w)                  # local axis after rotation
    Pr=Pr+dd*((q*(k-1))*w)[:,None]+ (N0-O0)*w[:,None]
    if N is not None: N=rotn(N,axr,angr*w)
    return Pr,N
for name in ("ORG_bones_arm","ORG_vessels"):
    nd,p=[(a,b) for a,b in g.meshes() if a["name"]==name][0]
    P=g.world(nd,p); N=g.view(p["attributes"]["NORMAL"]).astype(np.float64)
    for side in (1,-1):
        sel=P[:,0]*side>0.12
        Ps,Ns=apply_side(P[sel],N[sel],lambda a,b: skin(a,b,0.16,0.22),side); P[sel]=Ps; N[sel]=Ns
    write(nd,p,P,N)
for ndx in g.j["nodes"]:
    if ndx["name"]=="HS_blood":
        t0=np.array(ndx["translation"]); side=1 if t0[0]>0 else -1
        Pn,_=apply_side(t0[None,:],None,lambda a,b: skin(a,b,0.16,0.22),side); ndx["translation"]=[float(x) for x in Pn[0]]; print("HS_blood",t0.round(3),"->",Pn[0].round(3))
g.save("/tmp/glb/twin_v8.glb")
g2=Glb("/tmp/glb/twin_v8.glb"); parts=[]; cols={"Body":(120,200,230)}
for nd,p in g2.meshes():
    if nd["name"]=="Body": parts.append((g2.world(nd,p),g2.view(p["indices"]).reshape(-1,3).astype(int),(120,200,230)))
render(parts,"/tmp/glb/f.png"); render(parts,"/tmp/glb/s.png",view="side")
parts2=[]
for nd,p in g2.meshes():
    if nd["name"] in("ORG_bones_arm","ORG_vessels","ORG_bones_leg","ORG_shoulders","ORG_ribs","ORG_spine","ORG_pelvis","ORG_skull"):
        parts2.append((g2.world(nd,p),g2.view(p["indices"]).reshape(-1,3).astype(int),(240,90,120) if "vessel" in nd["name"] else (235,235,220)))
render(parts2,"/tmp/glb/b.png")
bf=Image.open("/tmp/glb/f.png").convert("RGB"); bb=Image.open("/tmp/glb/b.png").convert("RGB")
ov=Image.fromarray(np.maximum((np.asarray(bf)*0.45).astype(np.uint8),np.asarray(bb)))
im=Image.new("RGB",(2100,900)); im.paste(bf,(0,0)); im.paste(Image.open("/tmp/glb/s.png"),(700,0)); im.paste(ov,(1400,0)); im.save("/tmp/glb/v8.png")

# ---- leg vessels: recentre inside the realistic legs (they were authored for the placeholder body)
g=Glb("/tmp/glb/twin_v8.glb"); M={nd["name"]:(nd,p) for nd,p in g.meshes()}
PB=g.world(*M["Body"]); nd,p=M["ORG_vessels"]; V=g.world(nd,p)
ys=np.array([0.62,0.5,0.4,0.3,0.14]); cx=[];cz=[];vx=[];vz=[]
for y in ys:
    b=PB[(np.abs(PB[:,1]-y)<0.045)&(PB[:,0]>0.02)&(PB[:,0]<0.27)]; v=V[(np.abs(V[:,1]-y)<0.03)&(V[:,0]>0.02)]
    hw=(b[:,0].max()-b[:,0].min())/2
    cx.append((b[:,0].max()+b[:,0].min())/2-0.22*hw); cz.append((b[:,2].max()+b[:,2].min())/2+0.01); vx.append(v[:,0].mean()); vz.append(v[:,2].mean())
o=np.argsort(ys); ys=ys[o]; dx=(np.array(cx)-np.array(vx))[o]; dz=(np.array(cz)-np.array(vz))[o]
print("leg vessel shift dx",dx.round(3),"dz",dz.round(3))
for side in (1,-1):
    sel=(V[:,0]*side>0.02)&(V[:,1]<0.82)
    y=V[sel,1]; w=1-ss(0.62,0.82,y)
    V[sel,0]+=side*np.interp(y,ys,dx)*w; V[sel,2]+=np.interp(y,ys,dz)*w
write(nd,p,V,None); g.save("/tmp/glb/twin_v8.glb")
g2=Glb("/tmp/glb/twin_v8.glb"); body=None; inner=[]
pal={"ORG_vessels":(240,80,110),"ORG_heart":(255,120,120),"ORG_lung_L":(150,220,255),"ORG_lung_R":(150,220,255),"ORG_liver":(200,140,90),"ORG_brain":(255,170,190),"ORG_kidney_L":(210,150,120),"ORG_kidney_R":(210,150,120),"ORG_gut":(230,200,150),"ORG_stomach":(240,180,160)}
for nd,p in g2.meshes():
    T=g2.view(p["indices"]).reshape(-1,3).astype(int); P=g2.world(nd,p)
    if nd["name"]=="Body": body=(P,T,(120,200,230))
    elif nd["name"].startswith("ORG_"): inner.append((P,T,pal.get(nd["name"],(235,235,220))))
im=Image.new("RGB",(1400,900))
for i,view in enumerate(("front","side")):
    render([body],"/tmp/glb/_b.png",view=view); render(inner,"/tmp/glb/_i.png",view=view)
    ov=Image.fromarray(np.maximum((np.asarray(Image.open("/tmp/glb/_b.png"))*0.4).astype(np.uint8),np.asarray(Image.open("/tmp/glb/_i.png"))))
    im.paste(ov,(700*i,0))
im.save("/tmp/glb/v8_inner.png")
import os; print(os.path.getsize("/tmp/glb/twin_v8.glb"))

# ---- keep the spine and skull inside the back surface (lumbar curve of the realistic body)
g=Glb("/tmp/glb/twin_v8.glb"); M={nd["name"]:(nd,p) for nd,p in g.meshes()}; PB=g.world(*M["Body"])
for name,margin in (("ORG_spine",0.016),("ORG_skull",0.012)):
    nd,p=M[name]; S=g.world(nd,p); grid=np.arange(S[:,1].min(),S[:,1].max()+0.01,0.01); sh=[]
    for y in grid:
        b=PB[(np.abs(PB[:,1]-y)<0.03)&(np.abs(PB[:,0])<0.08)]; s=S[np.abs(S[:,1]-y)<0.02]
        sh.append(max(0.0,margin-(s[:,2].min()-b[:,2].min())) if len(b) and len(s) else 0.0)
    sh=np.array(sh); k=np.ones(9)/9; sm=np.maximum(np.convolve(np.pad(sh,4,mode="edge"),k,mode="valid"),sh*0.85)
    S[:,2]+=np.interp(S[:,1],grid,sm); print(name,"max forward shift",sm.max().round(3)); write(nd,p,S,None)
nd,p=M["ORG_ribs"]; S=g.world(nd,p); zc=(S[:,2].max()+S[:,2].min())/2; w=ss(1.34,1.44,S[:,1]); S[:,2]=zc+(S[:,2]-zc)*(1-0.2*w); S[:,0]*=(1-0.06*w); write(nd,p,S,None)
g.save("/tmp/glb/twin_v8.glb")
g2=Glb("/tmp/glb/twin_v8.glb"); M={nd["name"]:(nd,p) for nd,p in g2.meshes()}; PB=g2.world(*M["Body"]); worst=[]
for name,(nd,p) in M.items():
    if not name.startswith("ORG_"): continue
    S=g2.world(nd,p)
    for y in np.arange(S[:,1].min()+0.01,S[:,1].max(),0.03):
        s=S[np.abs(S[:,1]-y)<0.015]
        for side in (1,-1) if (S[:,0].max()-S[:,0].min())>0.3 else (0,):
            ss_=s if side==0 else s[s[:,0]*side>0]
            if not len(ss_): continue
            cx=ss_[:,0].mean(); b=PB[(np.abs(PB[:,1]-y)<0.035)&(np.abs(PB[:,0]-cx)<0.09)]
            if len(b)<3: continue
            worst.append((min(ss_[:,2].min()-b[:,2].min(), b[:,2].max()-ss_[:,2].max()),name,round(float(y),2)))
worst.sort(); print("tightest depth clearances:",[(round(a,3),n,y) for a,n,y in worst[:8]])
names=[n["name"] for n in g2.j["nodes"]]; print(len(g2.j["meshes"]),"meshes",sum(n.startswith("HS_") for n in names),"hotspots")

def zoom(view,box,path):
    parts_b=[(g2.world(*M["Body"]),g2.view(M["Body"][1]["indices"]).reshape(-1,3).astype(int),(120,200,230))]
    parts_i=[(g2.world(*M[n]),g2.view(M[n][1]["indices"]).reshape(-1,3).astype(int),(240,80,110) if "vess" in n else (235,235,220)) for n in ("ORG_bones_arm","ORG_vessels","ORG_ribs","ORG_spine","ORG_shoulders","ORG_bones_leg","ORG_pelvis")]
    render(parts_b,"/tmp/glb/_b.png",view=view,W=1400,H=1800); render(parts_i,"/tmp/glb/_i.png",view=view,W=1400,H=1800)
    ov=Image.fromarray(np.maximum((np.asarray(Image.open("/tmp/glb/_b.png"))*0.45).astype(np.uint8),np.asarray(Image.open("/tmp/glb/_i.png"))))
    ov.crop(box).save(path)
zoom("front",(700,300,1150,1150),"/tmp/glb/z_front.png"); zoom("side",(450,300,950,1150),"/tmp/glb/z_side.png")
a=Image.open("/tmp/glb/z_front.png"); b=Image.open("/tmp/glb/z_side.png"); im=Image.new("RGB",(a.width+b.width,850)); im.paste(a,(0,0)); im.paste(b,(a.width,0)); im.save("/tmp/glb/zoom.png")
