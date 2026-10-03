import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/library-question-bank'))
from dedup import screen
def q(identifier,question,answer,key='',start=0,end=0):
    return {'sample_id':identifier,'question':question,'answer':answer,'event_key':key,'evidence':[{'start_utf16':start,'end_utf16':end}]}
class DedupTest(unittest.TestCase):
    def test_reworded_punctuation(self):
        pairs=screen([q('old','为什么购买法宝？','原因'),q('new','为什么购买法宝!','另一个说法')],{'new'})
        self.assertTrue(pairs[0]['blocking'])
    def test_same_knowledge_point(self):
        self.assertTrue(screen([q('a','问法一','答案甲','购买动机'),q('b','问法二','答案乙','购买动机')],{'b'})[0]['blocking'])
    def test_shared_source_is_not_automatically_duplicate(self):
        self.assertEqual(screen([q('a','如何辨别符宝真伪','使用神识观察纹路','鉴别',0,100),q('b','交易花了多少灵石','支付三百灵石','价格',0,100)],{'b'}),[])
    def test_old_pairs_not_reclassified(self):
        self.assertEqual(screen([q('a','重复题','相同答案'),q('b','重复题','相同答案')],{'new'}),[])
if __name__=='__main__':unittest.main()
