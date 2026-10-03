"""Unified offline CUDA service for embedding and selectable reranker diagnostics."""
import json
import gc
import os
from pathlib import Path
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
EMBEDDING = 'Qwen/Qwen3-Embedding-0.6B'
RERANKER = 'Qwen/Qwen3-Reranker-0.6B'
RERANKERS = {RERANKER: ('qwen', 'bfloat16', 4096), 'BAAI/bge-reranker-base': ('classifier', 'float32', 512), 'BAAI/bge-reranker-v2-m3': ('classifier', 'float32', 4096)}
MAX_TOKENS = 4096
MAX_ITEMS = 16
RERANK_BATCH_SIZE = 4
ROOT = Path(os.environ.get('PI_LIBRARY_MODELS', Path(__file__).resolve().parents[2] / 'models/smart-library')).resolve()
EMBEDDING_REVISION = json.loads((Path(__file__).parent / 'manifest.json').read_text(encoding='utf-8'))['Qwen3-Embedding-0.6B']['revision']
INSTRUCTION = 'Given a question, retrieve passages that answer the question'
PREFIX = '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n'
SUFFIX = '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n'

class InputError(Exception):
    pass

class ContextError(Exception):
    pass

def texts(value):
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_ITEMS:
        raise InputError()
    if not all(isinstance(t, str) and t.strip() and len(t) <= 32000 for t in value):
        raise InputError()
    return value

def validate(path, body):
    if not isinstance(body, dict):
        raise InputError()
    if path == '/api/embed':
        if body.get('model') != EMBEDDING or body.get('truncate', False) is not False:
            raise InputError()
        texts(body.get('input'))
        if body.get('input_type', 'document') not in ['query', 'document']:
            raise InputError()
    elif path == '/rerank':
        if body.get('model') not in RERANKERS:
            raise InputError()
        texts([body.get('query')])
        documents = texts(body.get('documents'))
        top_n = body.get('top_n', len(documents))
        if type(top_n) is not int or not 1 <= top_n <= len(documents):
            raise InputError()
        if type(body.get('batch_size', RERANK_BATCH_SIZE)) is not int or body.get('batch_size', RERANK_BATCH_SIZE) not in [1, 2, 4, 8, 16]:
            raise InputError()
    else:
        raise InputError()
    return body

class Models:
    def __init__(self):
        import torch
        from transformers import AutoModel, AutoModelForCausalLM, AutoTokenizer
        if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
            raise RuntimeError('CUDA with BF16 support is required; no CPU or quantized fallback')
        self.torch = torch
        torch.set_num_threads(4)
        self.embed_tokenizer = AutoTokenizer.from_pretrained(ROOT / EMBEDDING.split('/')[-1], local_files_only=True, padding_side='left')
        options = dict(local_files_only=True, use_safetensors=True, torch_dtype=torch.bfloat16, attn_implementation='sdpa')
        self.embed = AutoModel.from_pretrained(ROOT / EMBEDDING.split('/')[-1], **options).eval().to('cuda:0')
        self.rank = None
        self.rank_name = None
        self.load_rank(RERANKER)

    def load_rank(self, name):
        if self.rank_name == name and self.rank is not None:
            return
        from transformers import AutoTokenizer, AutoModelForCausalLM, AutoModelForSequenceClassification
        torch = self.torch
        directory = ROOT / name.split('/')[-1]
        if not (directory / 'model.safetensors').exists():
            raise RuntimeError('Requested model is not downloaded')
        # Only one reranker occupies GPU memory at a time. Do not keep old models on CPU either.
        self.rank = None
        self.rank_name = None
        gc.collect()
        torch.cuda.empty_cache()
        kind, precision, _ = RERANKERS[name]
        self.rank_tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True, padding_side='left' if kind == 'qwen' else 'right')
        loader = AutoModelForCausalLM if kind == 'qwen' else AutoModelForSequenceClassification
        self.rank = loader.from_pretrained(directory, local_files_only=True, use_safetensors=True,
            dtype=getattr(torch, precision), attn_implementation='sdpa').eval().to('cuda:0')
        self.rank_name = name
        self.ids = [self.rank_tokenizer.convert_tokens_to_ids(t) for t in ['no', 'yes']]
        if kind == 'qwen' and any(i is None or i == self.rank_tokenizer.unk_token_id for i in self.ids):
            raise RuntimeError('Missing yes/no tokens')

    def health(self):
        torch = self.torch
        return {'ready': True, 'device': str(self.embed.device), 'gpu': torch.cuda.get_device_name(0),
                'dtype': str(self.embed.dtype), 'rerankerDevice': str(self.rank.device) if self.rank is not None else None, 'rerankerDtype': str(self.rank.dtype) if self.rank is not None else None,
                'models': [EMBEDDING, self.rank_name], 'availableRerankers': list(RERANKERS), 'maxTokens': MAX_TOKENS, 'rerankBatchSize': RERANK_BATCH_SIZE,
                'allocatedMiB': round(torch.cuda.memory_allocated() / 1024 ** 2),
                'peakAllocatedMiB': round(torch.cuda.max_memory_allocated() / 1024 ** 2)}

    def tokens(self, tokenizer, values):
        encoded = tokenizer(values, padding=True, truncation=False, return_tensors='pt')
        if encoded['input_ids'].shape[1] > MAX_TOKENS:
            raise ContextError()
        return encoded.to('cuda:0')

    def infer(self, path, body):
        torch = self.torch
        with torch.inference_mode():
            if path == '/api/embed':
                values = body['input']
                if body.get('input_type') == 'query':
                    values = [f'Instruct: {INSTRUCTION}\nQuery:{t}' for t in values]
                vectors = []
                for start in range(0, len(values), 2):
                    inputs = self.tokens(self.embed_tokenizer, values[start:start + 2])
                    hidden = self.embed(**inputs, use_cache=False).last_hidden_state[:, -1, :].float()
                    vectors.extend(torch.nn.functional.normalize(hidden, p=2, dim=1).cpu().tolist())
                return {'model': EMBEDDING, 'model_revision': EMBEDDING_REVISION, 'embeddings': vectors}
            self.load_rank(body['model'])
            results = []
            batch_size = body.get('batch_size', RERANK_BATCH_SIZE)
            for start in range(0, len(body['documents']), batch_size):
                documents = body['documents'][start:start + batch_size]
                if RERANKERS[self.rank_name][0] == 'classifier':
                    inputs = self.rank_tokenizer([body['query']] * len(documents), documents,
                        padding=True, truncation=False, return_tensors='pt')
                    if inputs['input_ids'].shape[1] > RERANKERS[self.rank_name][2]:
                        raise ContextError()
                    logits = self.rank(**inputs.to('cuda:0')).logits.float().flatten()
                    if logits.numel() != len(documents):
                        raise RuntimeError('Unexpected classifier output')
                    scores = logits.sigmoid().tolist()
                else:
                    prompts = [PREFIX + f'<Instruct>: {INSTRUCTION}\n<Query>: {body["query"]}\n<Document>: {document}' + SUFFIX for document in documents]
                    inputs = self.tokens(self.rank_tokenizer, prompts)
                    # Keep real-token positions identical to a standalone passage despite left padding.
                    positions = inputs['attention_mask'].long().cumsum(-1) - 1
                    positions.masked_fill_(inputs['attention_mask'] == 0, 0)
                    # Qwen uses left padding, so every row's final token is the scoring token.
                    # Project only the yes/no head, retaining the existing FP32 accumulation.
                    last = self.rank.model(**inputs, position_ids=positions, use_cache=False).last_hidden_state[:, -1, :]
                    head = self.rank.lm_head.weight[self.ids]
                    logits = torch.nn.functional.linear(last.float(), head.float())
                    scores = logits.log_softmax(dim=-1)[:, 1].exp().tolist()
                results.extend({'index': start + offset, 'relevance_score': score} for offset, score in enumerate(scores))
            results.sort(key=lambda r: r['relevance_score'], reverse=True)
            return {'model': self.rank_name, 'results': results[:body.get('top_n', len(results))]}

def make_server(models, port=18081):
    lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_):
            pass  # Never log book text or queries.

        def reply(self, status, data):
            encoded = json.dumps(data, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self):
            if self.headers.get('Origin'):
                return self.reply(403, {'error': 'Browser origins not allowed'})
            if self.path != '/health':
                return self.reply(404, {'error': 'Not found'})
            self.reply(200, {**models.health(), 'busy': lock.locked()})

        def do_POST(self):
            # Consume bounded request bodies before a refusal. Closing a socket with unread
            # bytes can turn HTTP 403/429 into a connection reset on Windows.
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size <= 0 or self.headers.get('Transfer-Encoding'):
                    return self.reply(400, {'error': 'Invalid request length'})
                if size > 256 * 1024:
                    return self.reply(413, {'error': 'Request too large'})
                raw = self.rfile.read(size)
            except (ValueError, TimeoutError, ConnectionError):
                return
            if self.headers.get('Origin'):
                return self.reply(403, {'error': 'Browser origins not allowed'})
            if self.path not in ['/api/embed', '/rerank']:
                return self.reply(404, {'error': 'Not found'})
            if not lock.acquire(blocking=False):
                return self.reply(429, {'error': 'Model service busy'})
            try:
                try:
                    body = validate(self.path, json.loads(raw))
                except (ValueError, InputError, UnicodeError):
                    return self.reply(400, {'error': 'Invalid model, input or options'})
                result = models.infer(self.path, body)
                self.reply(200, result)
            except ContextError:
                self.reply(422, {'error': 'Input exceeds selected model token budget; split input instead of truncating'})
            except (ConnectionError, TimeoutError):
                pass
            except Exception as error:
                # Keep payloads private, but leave a useful operator-side error category.
                print('Inference failed:', type(error).__name__, flush=True)
                self.reply(503, {'error': 'GPU inference failed; check memory and local service'})
            finally:
                lock.release()
    return ThreadingHTTPServer(('127.0.0.1', port), Handler)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=18081)
    parser.add_argument('--exit-on-stdin-close', action='store_true')
    args = parser.parse_args()
    if args.exit_on_stdin_close:
        # Finish native-library initialization before starting a pipe-waiting thread.
        import torch
        import transformers
        import sys
        if os.name == 'nt':
            import ctypes
            import msvcrt
            from ctypes import wintypes
            read_pipe = ctypes.WinDLL('kernel32', use_last_error=True).ReadFile
            read_pipe.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
            read_pipe.restype = wintypes.BOOL
            pipe_handle = msvcrt.get_osfhandle(sys.stdin.fileno())
        def parent_watchdog():
            if os.name == 'nt':
                # CRT read() holds the stdin descriptor lock; NumPy's DLL initialization
                # also needs that lock. Wait on the OS handle without taking CRT locks.
                buffer = ctypes.create_string_buffer(1)
                received = wintypes.DWORD()
                while read_pipe(pipe_handle, buffer, 1, ctypes.byref(received), None) and received.value:
                    pass
            else:
                while os.read(sys.stdin.fileno(), 1):
                    pass
            os._exit(0)  # Release GPU even if Electron was forcefully restarted.
        threading.Thread(target=parent_watchdog, daemon=True).start()
    print('Loading official Qwen models on CUDA, BF16…', flush=True)
    models = Models()
    print(json.dumps(models.health()), flush=True)
    server = make_server(models, port=args.port)
    print(f'Ready: http://127.0.0.1:{args.port} (embedding + reranking, offline)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
