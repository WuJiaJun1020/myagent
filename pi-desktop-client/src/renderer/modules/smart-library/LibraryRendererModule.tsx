import { DesktopPetControl } from "../../features/desktop-pet/DesktopPetControl";
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { BookOpen, Library, Upload, ArrowLeft, ChevronLeft, ChevronRight, PanelLeft, Search, Settings, FlaskConical } from "lucide-react";
import { TopBar } from "../../components/layout/TopBar";
import { HintButton } from "../../components/ui/tooltip";
import { useUiStore } from "../../stores/ui-store";
import { useLibrary } from "./library-store";
import "./library.css";
const LibraryStrategyDialog = lazy(() => import("./LibraryStrategyDialog"));
const LibrarySearchDialog = lazy(() => import("./LibrarySearchDialog"));
const LibraryQuestionBankDialog = lazy(() => import("./LibraryQuestionBankDialog"));
const LibraryEvaluationDialog = lazy(() => import("./LibraryEvaluationDialog"));
const LibraryQaPanel = lazy(() => import("./LibraryQaPanel"));
export function LibrarySidebar() {
 const { books, selected, back, open } = useLibrary();
 return <><div className="library-sidebar"><button className={!selected ? "active" : ""} onClick={back}><Library size={16}/>书架<span>{books.length}</span></button><h3>最近导入</h3>{books.slice(0,8).map(book => <button key={book.id} className={selected?.id === book.id ? "active" : ""} onClick={() => void open(book)}><BookOpen size={16}/><span className="library-title">{book.title}</span></button>)}</div><div className="sidebar-footer"><span className="connection"><BookOpen size={15}/>本地图书</span><div className="sidebar-footer-actions"><DesktopPetControl /><HintButton className="icon-button" hint="设置" onClick={() => useUiStore.getState().setSettingsOpen(true)}><Settings size={15}/></HintButton></div></div></>;
}
export function LibraryTopBar() { const book = useLibrary(s => s.selected); return <TopBar heading="智慧图书" section={book?.title ?? "书架"} detailAvailable={false}/>; }
export function LibraryDetailPanel() { return null; }
export function LibraryWorkspace() {
 const [strategiesOpen,setStrategiesOpen]=useState(false);
 const [searchOpen, setSearchOpen] = useState(false);
 const [evaluationOpen, setEvaluationOpen] = useState(false);
 const [bankOpen,setBankOpen] = useState(false);
 const [qaOpen, setQaOpen] = useState(false);
 const state = useLibrary(); const { selected, chapter, text, loading, importing, error, open, back } = state;
 const [query,setQuery] = useState(""); const [directory,setDirectory] = useState(true); const [chapterQuery,setChapterQuery] = useState(""); const [limit,setLimit] = useState(100); const [size,setSize] = useState(17);
 const [qaWidth, setQaWidth] = useState(40);
 const layout = useRef<HTMLDivElement>(null);
 const resizeQa = (clientX: number) => {
  const bounds = layout.current?.getBoundingClientRect();
  if (bounds) setQaWidth(Math.max(25, Math.min(70, (bounds.right-clientX)/bounds.width*100)));
 };
 const reader = useRef<HTMLDivElement>(null);
 useEffect(() => { void state.load(); }, []);
 useEffect(() => { reader.current?.scrollTo(0,0); }, [selected?.id, chapter]);
 useEffect(() => { if (state.highlight && text) reader.current?.querySelector("mark")?.scrollIntoView({ block: "center", inline: "nearest" }); }, [text, state.highlight]);
 useEffect(() => { setChapterQuery(""); setLimit(100); }, [selected?.id]);
 const chapters = selected?.chapters.filter(c => c.title.toLowerCase().includes(chapterQuery.toLowerCase())) ?? [];
 return <div className="library-workspace">
 {bankOpen && selected && <Suspense fallback={<div role="status">正在打开题库…</div>}><LibraryQuestionBankDialog key={selected.id} book={selected} onClose={()=>setBankOpen(false)}/></Suspense>}
 {evaluationOpen && selected && <Suspense fallback={<div role="status">正在打开评测…</div>}><LibraryEvaluationDialog key={selected.id} book={selected} onClose={()=>setEvaluationOpen(false)}/></Suspense>}
 {strategiesOpen&&<Suspense fallback={<div role="status">正在打开策略管理…</div>}><LibraryStrategyDialog book={selected??undefined} onClose={()=>setStrategiesOpen(false)}/></Suspense>}
 {searchOpen && selected && <Suspense fallback={<div role="status">正在打开检索…</div>}><LibrarySearchDialog key={selected.id} book={selected} page={chapter} onClose={() => setSearchOpen(false)}/></Suspense>}
 {!selected && <div className="library-model-entry"><HintButton hint="策略管理" onClick={()=>setStrategiesOpen(true)}><Settings size={15}/><span>策略管理</span></HintButton></div>}
 {error && <div className="library-error" role="alert">{error}<button onClick={() => useLibrary.setState({error:""})} aria-label="关闭错误提示">×</button></div>}
 {!selected ? <><header className="library-toolbar"><div><h1>书架</h1><span>{state.books.length} 本图书</span></div><button className="library-import" disabled={importing} onClick={() => void state.importBooks()}><Upload size={16}/>{importing ? "正在导入…" : "导入图书"}</button></header><label className="library-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索书名或作者" aria-label="搜索图书"/></label>
 <div className="library-shelf">{state.books.filter(b => `${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase())).map(book => <button className="library-book" key={book.id} onClick={() => void open(book)}><div className={`library-cover ${book.format}`}><span>{book.format.toUpperCase()}</span><BookOpen size={30}/><strong>{book.title}</strong></div><strong>{book.title}</strong><small>{book.author || "作者未知"} · {book.chapters.length} 节</small><small>{book.chapter ? `读至 ${book.chapters[book.chapter]?.title}` : "开始阅读"}</small></button>)}</div>
 {!state.books.length && <div className="library-empty"><BookOpen size={40}/><h2>把想读的书放进来</h2><p>支持 TXT、EPUB，本地保存，随时阅读。</p></div>}
 {!!state.books.length && !state.books.some(b=>`${b.title} ${b.author}`.toLowerCase().includes(query.toLowerCase())) && <p className="library-empty">没有找到相关图书</p>}
 </> : <><header className="library-reader-toolbar"><HintButton hint="返回书架" onClick={back}><ArrowLeft size={17}/></HintButton><HintButton hint={directory?"收起目录":"展开目录"} onClick={()=>setDirectory(!directory)}><PanelLeft size={17}/></HintButton><strong>{selected.title}</strong><div className="library-model-entry"><HintButton hint="图书问答" aria-pressed={qaOpen} onClick={() => {setQaOpen(!qaOpen);if(!qaOpen)setDirectory(false);}}><BookOpen size={15}/><span>图书问答</span></HintButton><HintButton hint="查找原文" onClick={() => setSearchOpen(true)}><Search size={15}/><span>查找原文</span></HintButton><HintButton hint="策略管理" onClick={()=>setStrategiesOpen(true)}><Settings size={15}/><span>策略管理</span></HintButton><HintButton hint="题库与审核" onClick={()=>setBankOpen(true)}><Library size={15}/><span>题库与审核</span></HintButton><HintButton hint="召回评测" onClick={()=>setEvaluationOpen(true)}><FlaskConical size={15}/><span>召回评测</span></HintButton></div><HintButton hint="缩小正文" disabled={size<=14} onClick={()=>setSize(size-1)}>A−</HintButton><HintButton hint="放大正文" disabled={size>=24} onClick={()=>setSize(size+1)}>A+</HintButton></header>
 <div ref={layout} style={{"--library-qa-width": `${qaWidth}%`} as CSSProperties} className={`library-reader-layout ${directory?"":"without-directory"} ${qaOpen?"has-qa":""}`}>
 {directory && <aside className="library-directory"><label className="library-search"><Search size={14}/><input placeholder="查找章节" aria-label="查找章节" value={chapterQuery} onChange={e=>{setChapterQuery(e.target.value);setLimit(100);}}/></label><nav aria-label="章节目录">{chapters.slice(0,limit).map(c=><button aria-current={c.id===chapter?"page":undefined} className={c.id===chapter?"active":""} key={c.id} onClick={()=>void open(selected,c.id)}>{c.title}</button>)}{chapters.length>limit && <button onClick={()=>setLimit(limit+100)}>显示更多章节</button>}{!chapters.length && <p>没有匹配的章节</p>}</nav></aside>}
 <article className="library-reader" ref={reader} style={{fontSize:size}} aria-busy={loading}>{loading ? <p className="library-empty">正在加载章节…</p> : <div className="library-prose"><h1>{selected.chapters[chapter]?.title}</h1>{Array.from(text.matchAll(/[^\n]+/g)).filter((m,i)=>i !== 0 || m[0].trim() !== selected.chapters[chapter]?.title).map(m=>{ const start=m.index!, value=m[0]; const a=Math.max(0,(state.highlight?.start ?? 0)-start), b=Math.min(value.length,(state.highlight?.end ?? 0)-start); return <p key={start}>{b>a ? <>{value.slice(0,a)}<mark>{value.slice(a,b)}</mark>{value.slice(b)}</> : value}</p>; })}<div className="library-chapter-actions"><button disabled={chapter===0} onClick={()=>void open(selected,chapter-1)}><ChevronLeft size={16}/>上一节</button><span>{chapter+1} / {selected.chapters.length}</span><button disabled={chapter===selected.chapters.length-1} onClick={()=>void open(selected,chapter+1)}>下一节<ChevronRight size={16}/></button></div></div>}</article>
 {qaOpen && <div className="library-qa-resizer" role="separator" aria-label="调整阅读与问答宽度" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={70} aria-valuenow={Math.round(qaWidth)} tabIndex={0}
 onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resizeQa(e.clientX);}}
 onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onDoubleClick={()=>setQaWidth(40)} onKeyDown={e=>{if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;e.preventDefault();setQaWidth(value=>Math.max(25,Math.min(70,value+(e.key==="ArrowLeft"?2:-2))));}}/>}
 {qaOpen&&<Suspense fallback={<aside className="library-qa-panel">正在打开图书问答…</aside>}><LibraryQaPanel key={selected.id} book={selected} page={chapter} onClose={()=>setQaOpen(false)} onJump={()=>{if((reader.current?.parentElement?.clientWidth??0)<680)setQaOpen(false);}}/></Suspense>}
 </div></>}
 </div>;
}
