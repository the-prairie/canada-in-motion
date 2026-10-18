"""Build display-only BCER geometry generalized at 10 metres in EPSG:3005.

Original normalized source geometry remains a separate full download. Douglas-Peucker
retains endpoints and bounds every removed source vertex's perpendicular deviation
from its retained segment by ten metres in the BC Albers metre grid. This is not a
survey, navigational or engineering product. Points retain original six decimals.
"""
import json,pathlib,hashlib,math
from pyproj import Transformer
ROOT=pathlib.Path(__file__).resolve().parent
FORWARD=Transformer.from_crs('EPSG:4326','EPSG:3005',always_xy=True)

def point_segment_sq(point,start,end):
 dx=end[0]-start[0];dy=end[1]-start[1];den=dx*dx+dy*dy
 t=max(0,min(1,((point[0]-start[0])*dx+(point[1]-start[1])*dy)/den)) if den else 0
 return (point[0]-start[0]-t*dx)**2+(point[1]-start[1]-t*dy)**2

def simplify(path,tolerance=10):
 projected=[FORWARD.transform(*p) for p in path]
 keep={0,len(path)-1};stack=[(0,len(path)-1)]
 while stack:
  a,b=stack.pop();best=0;idx=None
  for i in range(a+1,b):
   d=point_segment_sq(projected[i],projected[a],projected[b])
   if d>best:best=d;idx=i
  if best>tolerance*tolerance:
   keep.add(idx);stack.extend([(a,idx),(idx,b)])
 return [path[i] for i in sorted(keep)], sorted(keep)
def run():
 original=json.loads((ROOT/'bc-permitted-infrastructure.geojson').read_text());features=[];before=after=0;maxdeviation=0
 for f in original['features']:
  p=f['properties'];geom=f['geometry']
  if geom['type']=='MultiLineString':
   paths=[]
   for path in geom['coordinates']:
    simplified,indices=simplify(path);paths.append(simplified);before+=len(path);after+=len(simplified)
    projected=[FORWARD.transform(*point) for point in path]
    for a,b in zip(indices,indices[1:]):
     for i in range(a+1,b):maxdeviation=max(maxdeviation,math.sqrt(point_segment_sq(projected[i],projected[a],projected[b])))
   geom={'type':'MultiLineString','coordinates':paths}
  features.append({'type':'Feature','id':f['id'],'geometry':geom,'properties':{'kind':p['kind'],'sourceId':p['sourceId'],'sourceStatus':p['sourceStatus'],'approvalDate':p['approvalDate'],'operatingStatus':None}})
 meta={**original['metadata'],'displayGeometry':{'method':'Douglas-Peucker','toleranceMetres':10,'projectedCRS':'EPSG:3005','retainedCoordinates':'Original six-decimal WGS84 vertices; points unchanged','maximumRemovedVertexDeviationMetres':maxdeviation,'notForEngineering':True},'fullRecordLookup':'Join feature id to full.geojson; each sourceId resolves to metadata.sources[sourceId] including source title and URL.'}
 out={'type':'FeatureCollection','metadata':meta,'features':features};path=ROOT/'bc-permitted-map.geojson';path.write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False));raw=path.read_bytes()
 proof={'features':len(features),'originalVertices':before,'displayVertices':after,'maxRemovedVertexDeviationM':maxdeviation,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 (ROOT/'BCER-MAP-VERIFIED.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof,indent=2))
if __name__=='__main__':run()
