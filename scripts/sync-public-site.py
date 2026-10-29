#!/usr/bin/env python3
"""Download and verify the public browser distribution."""
import argparse,hashlib,json,re,stat,tempfile,urllib.parse,urllib.request,zipfile
from pathlib import Path,PurePosixPath
ROOT_FILES={'404.html','index.html','conquest.html','cookie-policy.html','game-timeline.html','privacy.html','squads.html','terms.html','firebase-config.js','favicon.ico','robots.txt','site.webmanifest','sitemap.xml','sw.js','.nojekyll','site-release.json'}
DIRECTORIES={'assets','conquest','cookie-policy','game-timeline','privacy','squads','terms'}
EXTENSIONS={'.html','.css','.js','.mjs','.json','.svg','.png','.webp','.jpg','.jpeg','.ico','.woff','.woff2','.ttf','.txt','.mp3','.mp4','.glb','.bin','.webmanifest'}
def allowed(name):
 p=PurePosixPath(name)
 if name in {'assets/data/digest-state.json','assets/data/client-version.json'}:return False
 if not name or chr(92) in name or chr(0) in name or p.is_absolute() or '..' in p.parts:return False
 return name in ROOT_FILES or bool(p.parts and p.parts[0] in DIRECTORIES and p.suffix.lower() in EXTENSIONS and not any(x.startswith('.') for x in p.parts))
def fetch_json(url):
 with urllib.request.urlopen(url,timeout=30) as response:
  data=response.read(65537)
  if len(data)>65536:raise ValueError('Release metadata exceeds limit.')
  return json.loads(data)
def unpack(archive,output):
 output=output.resolve();output.mkdir(parents=True,exist_ok=True)
 if any(output.iterdir()):raise ValueError('Website output must start empty.')
 with zipfile.ZipFile(archive) as z:
  names=set();total=0
  for entry in z.infolist():
   if entry.is_dir():continue
   if entry.filename in names or not allowed(entry.filename):raise ValueError('Unexpected or duplicate published path.')
   names.add(entry.filename);total+=entry.file_size
   if len(names)>10000 or total>768*1024*1024 or stat.S_ISLNK(entry.external_attr>>16):raise ValueError('Unsafe published archive.')
  if 'index.html' not in names or 'site-release.json' not in names:raise ValueError('Incomplete published archive.')
  for entry in z.infolist():
   if entry.is_dir():continue
   destination=(output/entry.filename).resolve()
   if not destination.is_relative_to(output):raise ValueError('Unsafe extraction destination.')
   destination.parent.mkdir(parents=True,exist_ok=True)
   with z.open(entry) as reader,destination.open('wb') as writer:
    while chunk:=reader.read(1024*1024):writer.write(chunk)
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--upstream',required=True);parser.add_argument('--current',required=True)
 parser.add_argument('--output',type=Path,required=True);parser.add_argument('--status',type=Path,required=True)
 args=parser.parse_args();base=args.upstream.rstrip('/')+'/'
 if urllib.parse.urlparse(base).scheme!='https':raise ValueError('HTTPS distribution required.')
 manifest=fetch_json(base+'release.json');digest=manifest.get('contentDigest','')
 if manifest.get('schema')!=1 or not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError('Invalid release metadata.')
 try:current=fetch_json(args.current).get('contentDigest')
 except (OSError,ValueError):current=None
 status={'changed':current!=digest,'contentDigest':digest}
 if status['changed']:
  parts=manifest.get('parts',[])
  if not 1<=len(parts)<=50:raise ValueError('Invalid archive-part count.')
  total=0;args.output.resolve().parent.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(prefix='swgoh-release-',dir=args.output.resolve().parent) as temp:
   archive=Path(temp)/'site.zip'
   with archive.open('wb') as writer:
    for i,part in enumerate(parts):
     if part.get('name')!=f'site.part{i:03d}' or not re.fullmatch('[a-f0-9]{64}',part.get('sha256','')):raise ValueError('Invalid archive-part metadata.')
     expected=part.get('bytes')
     if not isinstance(expected,int) or not 0<expected<=20*1024*1024:raise ValueError('Invalid archive-part length.')
     h=hashlib.sha256();received=0
     with urllib.request.urlopen(base+part['name'],timeout=60) as response:
      while chunk:=response.read(1024*1024):
       received+=len(chunk);total+=len(chunk)
       if received>expected or total>512*1024*1024:raise ValueError('Archive transfer exceeds limit.')
       h.update(chunk);writer.write(chunk)
     if received!=expected or h.hexdigest()!=part['sha256']:raise ValueError('Published archive checksum mismatch.')
   unpack(archive,args.output)
  site=json.loads((args.output/'site-release.json').read_text(encoding='utf-8'))
  if site.get('contentDigest')!=digest:raise ValueError('Website release identity mismatch.')
 args.status.write_text(json.dumps(status),encoding='utf-8');print(json.dumps(status))
if __name__=='__main__':main()
