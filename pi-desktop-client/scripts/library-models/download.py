"""Download pinned official Qwen safetensors; verify every file before activation."""
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.request

ROOT = Path(os.environ.get('PI_LIBRARY_MODELS', Path(__file__).resolve().parents[2] / 'models/smart-library')).resolve()
MANIFEST = json.loads(Path(__file__).with_name('manifest.json').read_text(encoding='utf-8'))

def verified(path, spec):
    if not path.exists() or path.stat().st_size != spec['size']:
        return False
    h = hashlib.sha256() if 'lfs' in spec else hashlib.sha1(f"blob {spec['size']}\0".encode())
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest() == (spec['lfs']['sha256'] if 'lfs' in spec else spec['blobId'])

def main():
    for model, data in MANIFEST.items():
        for spec in data['files']:
            name = spec['rfilename']
            target = ROOT / model / name
            if verified(target, spec):
                print('Verified:', model, name, flush=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            partial = target.with_suffix(target.suffix + '.partial')
            repo = data.get('repo', f'Qwen/{model}')
            url = f"https://huggingface.co/{repo}/resolve/{data['revision']}/{name}"
            for attempt in range(5):
                try:
                    offset = partial.stat().st_size if partial.exists() else 0
                    if offset >= spec['size']:
                        if verified(partial, spec):
                            partial.replace(target)
                            break
                        offset = 0
                    request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
                    with urllib.request.urlopen(request, timeout=60) as source:
                        resume = offset and source.status == 206
                        if resume and not source.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                            raise RuntimeError('Invalid download range')
                        with partial.open('ab' if resume else 'wb') as output:
                            while block := source.read(1024 * 1024):
                                output.write(block)
                    if not verified(partial, spec):
                        raise RuntimeError('Checksum mismatch')
                    partial.replace(target)
                    print('Downloaded and verified:', model, name, flush=True)
                    break
                except Exception as error:
                    print('Retry', attempt + 1, model, name, type(error).__name__, flush=True)
                    if attempt == 4:
                        raise
                    time.sleep(2)

if __name__ == '__main__':
    main()
