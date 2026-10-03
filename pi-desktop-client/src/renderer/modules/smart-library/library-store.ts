import { create } from "zustand";
import type { LibraryBook } from "../../../shared/contracts/smart-library";
let request = 0;
export const useLibrary = create<{
 books: LibraryBook[]; selected: LibraryBook | null; chapter: number; text: string; loading: boolean; importing: boolean; error: string; highlight?: { start: number; end: number };
 load: () => Promise<void>; importBooks: () => Promise<void>; open: (book: LibraryBook, chapter?: number, highlight?: { start: number; end: number }) => Promise<void>; back: () => void;
}>((set, get) => ({
 books: [], selected: null, chapter: 0, text: "", loading: false, importing: false, error: "",
 load: async () => { try { set({ books: await window.piDesktop.library.list() }); } catch(e) { set({ error: String(e) }); } },
 importBooks: async () => { if(get().importing)return; set({ importing: true, error: "" }); try { const result = await window.piDesktop.library.importBooks(); set({ books: result.books, error: result.errors.join("\n") }); } catch(e) { set({ error: String(e) }); } finally { set({ importing: false }); } },
 open: async (book, chapter = book.chapter, highlight) => {
   const token = ++request; set({ selected: book, chapter, text: "", loading: true, error: "", highlight });
   try { const text = await window.piDesktop.library.chapter(book.id, chapter); if(token !== request)return;
     set({ text, loading: false, books: get().books.map(b => b.id === book.id ? { ...b, chapter } : b), selected: { ...book, chapter } });
     await window.piDesktop.library.remember(book.id, chapter);
   } catch(e) { if(token === request)set({ error: String(e), loading: false }); }
 },
 back: () => { ++request; set({ selected: null, text: "", loading: false, error: "", highlight: undefined }); },
}));
