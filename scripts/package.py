#!/usr/bin/env python3
"""Build a deterministic source-only ZIP. No dependencies, builds, credentials or caches."""
import argparse,hashlib,json,os,stat,zipfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=root.parent/'output'/'RPG_BAY_V1_Source.zip');args=parser.parse_args()
output=args.output.resolve();output.parent.mkdir(parents=True,exist_ok=True)
skip={'.git','node_modules','target','dist','__pycache__','.cache','coverage','output','.vite'}
files=[]
for path in sorted(root.rglob('*')):
 if not path.is_file() or path.is_symlink():continue
 rel=path.relative_to(root)
 if any(part in skip for part in rel.parts) or rel.as_posix().startswith('apps/web/public/pdfjs/'):continue
 if path.name.startswith('.env') and not path.name.endswith('.example'):continue
 if path.suffix.lower() in {'.key','.pem','.log','.zip','.bak','.dump'}:continue
 if path.resolve()==output:continue
 files.append((rel,path.read_bytes()))
manifest={'schema':1,'root':'rpg-bay/','sourceOnly':True,'timestamp':'2026-01-01T00:00:00Z','files':[{'path':p.as_posix(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for p,b in files]}
manifest_bytes=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for rel,data in files+[(Path('SOURCE_MANIFEST.json'),manifest_bytes)]:
  entry=zipfile.ZipInfo('rpg-bay/'+rel.as_posix(),(2026,1,1,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.create_system=3
  mode=0o755 if rel.suffix in {'.sh','.py'} else 0o644
  entry.external_attr=(stat.S_IFREG|mode)<<16;z.writestr(entry,data)
digest=hashlib.sha256(output.read_bytes()).hexdigest();output.with_suffix(output.suffix+'.sha256').write_text(f'{digest}  {output.name}\n')
print(json.dumps({'file':str(output),'bytes':output.stat().st_size,'files':len(files)+1,'sha256':digest},indent=2))
