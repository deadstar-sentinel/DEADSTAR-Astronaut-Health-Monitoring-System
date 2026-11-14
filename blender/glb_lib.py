import json,struct,numpy as np
from PIL import Image, ImageDraw
class Glb:
    def __init__(s,path):
        s.b=bytearray(open(path,"rb").read())
        n=struct.unpack("<I",s.b[12:16])[0]; s.jlen=n; s.j=json.loads(s.b[20:20+n]); s.bin0=20+n+8
    def view(s,i):
        a=s.j["accessors"][i]; bv=s.j["bufferViews"][a["bufferView"]]
        off=s.bin0+bv.get("byteOffset",0)+a.get("byteOffset",0)
        comp={5126:"<f4",5123:"<u2",5125:"<u4",5121:"u1"}[a["componentType"]]; k={"VEC3":3,"SCALAR":1,"VEC2":2,"VEC4":4}[a["type"]]
        arr=np.frombuffer(s.b,comp,a["count"]*k,off)   # writable view on bytearray
        return arr.reshape(-1,k) if k>1 else arr
    def meshes(s):
        for nd in s.j["nodes"]:
            if "mesh" in nd:
                for p in s.j["meshes"][nd["mesh"]]["primitives"]:
                    yield nd,p
    def world(s,nd,p):
        return s.view(p["attributes"]["POSITION"]).astype(np.float64)+np.array(nd.get("translation",[0,0,0]))
    def save(s,path):
        js=json.dumps(s.j,separators=(",",":")).encode(); js+=b" "*((4-len(js)%4)%4)
        binchunk=bytes(s.b[s.bin0-8:])
        out=bytearray(b"glTF"+struct.pack("<II",2,12+8+len(js)+len(binchunk))+struct.pack("<I",len(js))+b"JSON"+js+binchunk)
        open(path,"wb").write(out)
def render(parts,path,view="front",W=700,H=900,ylim=(-0.05,1.9)):
    """parts: list of (P world Nx3, tris Mx3, rgb)"""
    img=Image.new("RGB",(W,H),(8,12,20)); d=ImageDraw.Draw(img)
    sc=H/(ylim[1]-ylim[0])
    allt=[]
    for P,T,col in parts:
        if view=="front": X,Y,Z=P[:,0],P[:,1],P[:,2]
        else: X,Y,Z=-P[:,2],P[:,1],P[:,0]
        a,b,c=P[T[:,0]],P[T[:,1]],P[T[:,2]]
        n=np.cross(b-a,c-a); n/= (np.linalg.norm(n,axis=1,keepdims=True)+1e-12)
        nz=n[:,2] if view=="front" else n[:,0]
        depth=(Z[T]).mean(1)
        sx=W/2+X[T]*sc; sy=H-(Y[T]-ylim[0])*sc
        for i in range(len(T)):
            allt.append((depth[i],sx[i],sy[i],nz[i],col))
    allt.sort(key=lambda t:t[0])
    for dp,sx,sy,nz,col in allt:
        if nz<0: continue
        k=0.25+0.75*max(0,nz)
        d.polygon([(sx[0],sy[0]),(sx[1],sy[1]),(sx[2],sy[2])],fill=tuple(int(c*k) for c in col))
    img.save(path)
