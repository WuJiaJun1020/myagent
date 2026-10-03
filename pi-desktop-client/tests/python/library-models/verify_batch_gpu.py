"""Manual CUDA parity/throughput check, reusing offline weights read-only."""
import argparse
import gc
import json
import math
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/library-models'))
import server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models', nargs='+', default=[server.RERANKER])
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is required for this manual acceptance test')
    torch.set_num_threads(4)
    model = server.Models.__new__(server.Models)
    model.torch = torch
    model.rank = None
    model.rank_name = None
    query = '林舟把铜钥匙交给了谁？'
    bases = ['山顶下起小雨，众人回屋休息。', '林舟把铜钥匙交给苏禾，请她保管。',
        '周远将银钥匙交给陈渡，随后独自离开。', '苏禾把铜钥匙还给林舟，这是第二天的事。',
        '林舟准备把账本交给苏禾，但还没出发。', '木箱里没有钥匙，只有一叠旧纸。',
        '陈渡在清点铜钱，周远在寻找钥匙。', '药铺今天关门，掌柜去了山下。']
    documents = bases + [text + ('院外风声渐起，树影随着月光摇动。' * (3 + i * 3)) for i, text in enumerate(bases)]
    body = {'query': query, 'documents': documents}
    reports = []
    try:
        for name in args.models:
            model.load_rank(name)
            request = {**body, 'model': name}
            measurements = {}
            for batch_size in [1, 4]:
                server.RERANK_BATCH_SIZE = batch_size
                model.infer('/rerank', request)  # Warm-up is outside the measurements.
                times = []
                for _ in range(3):
                    torch.cuda.synchronize()
                    started = time.perf_counter()
                    output = model.infer('/rerank', request)
                    torch.cuda.synchronize()
                    times.append((time.perf_counter() - started) * 1000)
                measurements[batch_size] = {'meanMs': sum(times) / len(times), 'output': output['results']}
            single = {r['index']: r['relevance_score'] for r in measurements[1]['output']}
            batch = {r['index']: r['relevance_score'] for r in measurements[4]['output']}
            assert set(single) == set(batch) == set(range(len(documents)))
            difference = max(abs(single[i] - batch[i]) for i in single)
            single_order = [r['index'] for r in measurements[1]['output']]
            batch_order = [r['index'] for r in measurements[4]['output']]
            reports.append({'model': name, 'dtype': str(model.rank.dtype), 'documents': len(documents),
                'singleMs': measurements[1]['meanMs'], 'batch4Ms': measurements[4]['meanMs'],
                'speedup': measurements[1]['meanMs'] / measurements[4]['meanMs'],
                'maxScoreDifference': difference, 'sameFullRanking': single_order == batch_order,
                'singleRanking': single_order, 'batchRanking': batch_order, 'singleScores': single, 'batchScores': batch})
            assert all(math.isfinite(score) and 0 <= score <= 1 for score in [*single.values(), *batch.values()])
            if name == server.RERANKER:
                # One model remains loaded; the original service and its weights are untouched.
                model.rank.float()
                full_precision = {}
                for batch_size in [1, 4]:
                    server.RERANK_BATCH_SIZE = batch_size
                    full_precision[batch_size] = model.infer('/rerank', request)['results']
                fp32_single = {r['index']: r['relevance_score'] for r in full_precision[1]}
                fp32_batch = {r['index']: r['relevance_score'] for r in full_precision[4]}
                reports[-1]['fp32Diagnostic'] = {
                    'maxScoreDifference': max(abs(fp32_single[i] - fp32_batch[i]) for i in fp32_single),
                    'singleRanking': [r['index'] for r in full_precision[1]],
                    'batchRanking': [r['index'] for r in full_precision[4]],
                    'singleScores': fp32_single, 'batchScores': fp32_batch,
                }
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps({'passed': False, 'results': reports}, indent=2), encoding='utf-8')
            # BF16 kernels round differently with batching. Require a high-precision
            # control to establish padding/math parity, rather than exact BF16 ordering.
            if name == server.RERANKER:
                diagnostic = reports[-1]['fp32Diagnostic']
                assert diagnostic['maxScoreDifference'] < 1e-4, (name, diagnostic)
                assert diagnostic['singleRanking'] == diagnostic['batchRanking'], (name, diagnostic)
                assert difference < .05, (name, difference)
                # Materially separated candidates must not invert in this fixture.
                assert all(batch[i] > batch[j] for i in single for j in single if single[i] - single[j] > .1)
            else:
                assert difference < .005, (name, difference)
            assert single_order[0] == batch_order[0], (name, single_order, batch_order)
            assert single_order[0] == 1, (name, 'Direct answer must be first', single_order)
            model.rank = None
            model.rank_name = None
            gc.collect()
            torch.cuda.empty_cache()
        report = {'passed': True, 'gpu': torch.cuda.get_device_name(0), 'results': reports}
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
    finally:
        server.RERANK_BATCH_SIZE = 4


if __name__ == '__main__': main()
