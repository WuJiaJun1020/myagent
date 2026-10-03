import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/library-models'))
import threading
import unittest
import urllib.request
import urllib.error
from server import validate, InputError, ContextError, make_server, EMBEDDING, RERANKER

class Tests(unittest.TestCase):
    def test_validation(self):
        valid = {'model': EMBEDDING, 'input': ['原文'], 'truncate': False}
        self.assertEqual(validate('/api/embed', valid), valid)
        for change in [{'input': []}, {'model': 'wrong'}, {'truncate': True}, {'input_type': 'invalid'}]:
            with self.assertRaises(InputError):
                validate('/api/embed', {**valid, **change})
        with self.assertRaises(InputError):
            validate('/rerank', {'model': RERANKER, 'query': '问题', 'documents': ['原文'], 'top_n': True})
        rank = {'model': RERANKER, 'query': '问题', 'documents': ['原文']}
        for batch in [1, 2, 4, 8, 16]:
            self.assertEqual(validate('/rerank', {**rank, 'batch_size': batch})['batch_size'], batch)
        for batch in [True, 0, 3, 32, '4']:
            with self.assertRaises(InputError):
                validate('/rerank', {**rank, 'batch_size': batch})

    def test_http(self):
        class FakeModels:
            def health(self): return {'ready': True}
            def infer(self, path, body):
                if body.get('query') == 'long': raise ContextError()
                return {'results': [{'index': 0, 'relevance_score': 0.9}]}
        server = make_server(FakeModels(), port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def request(body, origin=None):
            headers = {'Content-Type': 'application/json'}
            if origin: headers['Origin'] = origin
            req = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/rerank', data=json.dumps(body).encode(), headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=3) as r: return r.status
            except urllib.error.HTTPError as e: return e.code
        body = {'model': RERANKER, 'query': '问题', 'documents': ['原文']}
        try:
            self.assertEqual(request(body), 200)
            self.assertEqual(request(body, 'https://example.com'), 403)
            self.assertEqual(request({**body, 'model': 'bad'}), 400)
            self.assertEqual(request({**body, 'query': 'long'}), 422)
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == '__main__': unittest.main()
