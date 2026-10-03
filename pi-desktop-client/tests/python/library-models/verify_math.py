"""Compare optimized rank head against the official full-model last-token logits."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/library-models'))
from server import Models, PREFIX, SUFFIX, INSTRUCTION, EMBEDDING

m = Models()
torch = m.torch
query = '林舟把铜钥匙交给了谁？'
rows = []
with torch.inference_mode():
    for document in ['山顶下起了小雨，众人回屋休息。', '林舟把铜钥匙交给了苏禾，请她保管。']:
        prompt = PREFIX + f'<Instruct>: {INSTRUCTION}\n<Query>: {query}\n<Document>: {document}' + SUFFIX
        inputs = m.tokens(m.rank_tokenizer, [prompt])
        official = m.rank(**inputs, use_cache=False, logits_to_keep=1).logits[0, -1, m.ids].float().softmax(-1)[1].item()
        from server import RERANKER
        actual = m.infer('/rerank', {'model': RERANKER, 'query': query, 'documents': [document]})['results'][0]['relevance_score']
        assert abs(actual - official) < 0.005, (actual, official)
        rows.append({'officialBF16': official, 'fp32HeadAccumulation': actual})
    v = m.infer('/api/embed', {'model': EMBEDDING, 'input': ['短句', '这是一段长度不同的示例文本。']})['embeddings']
    assert all(len(x) == 1024 and abs(sum(n*n for n in x) - 1) < 1e-5 for x in v)
    assert rows[1]['officialBF16'] > rows[0]['officialBF16']
print(json.dumps({'parity': rows, 'health': m.health(), 'passed': True}, indent=2))
