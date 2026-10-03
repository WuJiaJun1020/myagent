"""Exercise batching/index preservation without loading torch or model weights."""
import contextlib
import re
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/library-models'))
from server import Models, RERANKER, ContextError


class Tensor:
    def __init__(self, values, width=1):
        self.values = values
        self.shape = (len(values), width)
    def __getitem__(self, _): return self
    def float(self): return self
    def flatten(self): return self
    def sigmoid(self): return self
    def log_softmax(self, dim): return self
    def exp(self): return self
    def numel(self): return len(self.values)
    def tolist(self): return self.values
    def long(self): return self
    def cumsum(self, _): return self
    def __sub__(self, _): return self
    def __eq__(self, _): return self
    def masked_fill_(self, mask, value): return self


class Inputs(dict):
    def to(self, _): return self


def model_fixture(name):
    batches = []
    def tokenizer(first, second=None, **options):
        documents = second if second is not None else first
        assert isinstance(documents, list)
        assert options['padding'] is True and options['truncation'] is False
        if second is not None:
            assert first == ['问题'] * len(second)
        values = [(int(re.search(r'D(\d+)', text)[1]) + 1) / 10 for text in documents]
        return Inputs(input_ids=Tensor(values, max(map(len, documents))), attention_mask=Tensor(values))
    def forward(**inputs):
        values = inputs['input_ids'].values
        batches.append(len(values))
        return SimpleNamespace(last_hidden_state=Tensor(values))
    class Rank:
        model = staticmethod(forward)
        lm_head = SimpleNamespace(weight=Tensor([]))
        def __call__(self, **inputs):
            output = forward(**inputs)
            return SimpleNamespace(logits=output.last_hidden_state)
    model = Models.__new__(Models)
    model.torch = SimpleNamespace(inference_mode=contextlib.nullcontext,
        nn=SimpleNamespace(functional=SimpleNamespace(linear=lambda last, head: last)))
    model.rank = Rank()
    model.rank_name = name
    model.rank_tokenizer = tokenizer
    model.ids = [0, 1]
    model.load_rank = lambda _: None
    return model, batches


class BatchTests(unittest.TestCase):
    def test_configured_batch_and_partial_tail(self):
        for size, expected in [(1, [1]*9), (2, [2, 2, 2, 2, 1]), (8, [8, 1])]:
            model, batches = model_fixture(RERANKER)
            result = model.infer('/rerank', {'model': RERANKER, 'query': '问题', 'documents': [f'D{i}' for i in range(9)], 'batch_size': size})
            self.assertEqual(batches, expected)
            self.assertEqual([r['index'] for r in result['results']], list(range(8, -1, -1)))

    def test_qwen_tail_batch_and_original_indices(self):
        model, batches = model_fixture(RERANKER)
        documents = [f'D{i} ' + '原文' * (i + 1) for i in range(9)]
        result = model.infer('/rerank', {'model': RERANKER, 'query': '问题', 'documents': documents})
        self.assertEqual(batches, [4, 4, 1])
        self.assertEqual([r['index'] for r in result['results']], list(range(8, -1, -1)))
        self.assertEqual([r['relevance_score'] for r in result['results']], [(i + 1) / 10 for i in range(8, -1, -1)])

    def test_classifier_models_and_top_n(self):
        for name in ['BAAI/bge-reranker-base', 'BAAI/bge-reranker-v2-m3']:
            with self.subTest(name=name):
                model, batches = model_fixture(name)
                result = model.infer('/rerank', {'model': name, 'query': '问题', 'documents': [f'D{i}' for i in range(5)], 'top_n': 2})
                self.assertEqual(batches, [4, 1])
                self.assertEqual([r['index'] for r in result['results']], [4, 3])

    def test_oversized_batch_is_rejected_before_inference_without_truncation(self):
        for name, limit in [(RERANKER, 4096), ('BAAI/bge-reranker-base', 512), ('BAAI/bge-reranker-v2-m3', 4096)]:
            with self.subTest(name=name):
                model, batches = model_fixture(name)
                with self.assertRaises(ContextError):
                    model.infer('/rerank', {'model': name, 'query': '问题', 'documents': ['D0', 'D1 ' + '长' * limit]})
                self.assertEqual(batches, [])


if __name__ == '__main__': unittest.main()
