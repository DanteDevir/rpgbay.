#!/usr/bin/env python3
import hashlib,json,sys,zipfile
from pathlib import PurePosixPath
with zipfile.ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 if any(not n.startswith('rpg-bay/') or '..' in PurePosixPath(n).parts or n.startswith('/') for n in names):raise SystemExit('Unsafe archive path')
 manifest=json.loads(z.read('rpg-bay/SOURCE_MANIFEST.json'))
 if len(set(names))!=len(names):raise SystemExit('Duplicate archive entries')
 expected={'rpg-bay/'+e['path'] for e in manifest['files']}|{'rpg-bay/SOURCE_MANIFEST.json'}
 if set(names)!=expected:raise SystemExit('Unexpected/missing archive entries')
 for f in manifest['files']:
  content=z.read('rpg-bay/'+f['path'])
  if len(content)!=f['bytes'] or hashlib.sha256(content).hexdigest()!=f['sha256']:raise SystemExit(f'Hash mismatch: {f["path"]}')
 if z.testzip():raise SystemExit('ZIP CRC failed')
 print(f'Validated {len(manifest["files"])} source file hashes, single root and CRC.')
