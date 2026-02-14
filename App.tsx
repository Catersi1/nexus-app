
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Brain, Moon, Sun, Database, RefreshCw, 
  Zap, History, ShieldAlert, FileText, Globe,
  Loader2, Activity, Sparkles, BookOpen, Key, Settings,
  ShoppingBag, Landmark, Search, Users, Menu, X, Crown
} from 'lucide-react';
import { ProjectTab, DocumentData, CaseLogic, CanvasNode, CanvasLink, BountyQuestion, ForensicWiki, ManualSignal } from './types';
import { GeminiService } from './services/geminiService';
import { VaultService } from './services/vaultService';
import LibraryView from './components/LibraryView';
import CaseLogicView from './components/CaseLogicView';
import AnalyticsView from './components/AnalyticsView';
import AnalysisDashboard from './components/AnalysisDashboard';
import TimelineView from './components/TimelineView';
import ForensicCanvas from './components/ForensicCanvas';
import LocationsView from './components/LocationsView';
import ReaderView from './components/ReaderView';
import SettingsView from './components/SettingsView';
import PublicMarketplace from './components/PublicMarketplace';
import IntelligenceWiki from './components/IntelligenceWiki';
import WebResearchView from './components/WebResearchView';

function mergeEntitiesIntoManualSignals(
  existing: ManualSignal[],
  entities: { name: string; type: string }[]
): ManualSignal[] {
  const key = (s: ManualSignal) => `${s.category}|${s.value.trim().toLowerCase()}`;
  const existingKeys = new Set(existing.map(key));
  const added: ManualSignal[] = [];
  for (const e of entities) {
    const name = e.name.trim();
    if (!name) continue;
    const category: ManualSignal['category'] = e.type === 'Person' ? 'Person' : 'Entity';
    if (existingKeys.has(`${category}|${name.toLowerCase()}`)) continue;
    existingKeys.add(`${category}|${name.toLowerCase()}`);
    added.push({
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category,
      value: name,
      bias: 'Neutral',
      politicalBias: 'None',
      trustScore: 50,
      linkedBitIds: []
    });
  }
  return [...existing, ...added];
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
    pdfjsLib: any;
    webkitAudioContext: typeof AudioContext;
  }
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ProjectTab>(ProjectTab.LIBRARY);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentData | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [nlpRunningDocId, setNlpRunningDocId] = useState<string | null>(null);
  
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  
  const [canvasNodes, setCanvasNodes] = useState<CanvasNode[]>([]);
  const [canvasLinks, setCanvasLinks] = useState<CanvasLink[]>([]);
  
  const [caseLogic, setCaseLogic] = useState<CaseLogic>({
    hypothesis: 'Initial forensic sweep active.',
    aiHypothesis: '',
    facts: [],
    actors: []
  });

  const [bounties, setBounties] = useState<BountyQuestion[]>([]);
  const [wikis, setWikis] = useState<ForensicWiki[]>([]);

  const [activeTaskCount, setActiveTaskCount] = useState(0);
  const processingQueueRef = useRef<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const ocrReuploadInputRef = useRef<HTMLInputElement>(null);
  const ocrReuploadDocIdRef = useRef<string | null>(null);
  const pendingNeuralLinkDocIdRef = useRef<string | null>(null); // Run AI NER after OCR when user clicked Neural Link on pending doc
  const isSyncingRef = useRef(false);
  const isHydratedRef = useRef(false); // CRITICAL: Strict hydration guard
  const fileCacheRef = useRef<Map<string, File>>(new Map());
  const documentsRef = useRef<DocumentData[]>(documents);
  const activeTaskCountRef = useRef(activeTaskCount);
  documentsRef.current = documents;
  activeTaskCountRef.current = activeTaskCount;

  const checkKeyStatus = async () => {
    try {
      const selected = await window.aistudio?.hasSelectedApiKey();
      setHasApiKey(!!selected);
    } catch (e) {
      setHasApiKey(false);
    }
  };

  const bootSystem = useCallback(async () => {
    try {
      const cachedDocs = await VaultService.getAllDocuments();
      const cachedLogic = await VaultService.getProjectState<CaseLogic>("caseLogic");
      const cachedCanvas = await VaultService.getProjectState<any>("canvas");
      const cachedBounties = await VaultService.getProjectState<BountyQuestion[]>("bounties");
      const cachedWikis = await VaultService.getProjectState<ForensicWiki[]>("wikis");

      // Auto-remove zero-size and duplicate documents from vault in background (no UI)
      let docsToUse = cachedDocs || [];
      if (docsToUse.length > 0) {
        const zeroSizeIds = docsToUse.filter((d) => parseFloat(d.size) === 0).map((d) => d.id);
        if (zeroSizeIds.length > 0) {
          await VaultService.deleteDocuments(zeroSizeIds);
          docsToUse = docsToUse.filter((d) => !zeroSizeIds.includes(d.id));
        }
        const dupKey = (d: DocumentData) => {
          const name = (d.title.replace(/\\/g, '/').split('/').pop() || d.title).toLowerCase();
          return `${name}|${d.size}`;
        };
        const groups = new Map<string, DocumentData[]>();
        docsToUse.forEach((d) => {
          const k = dupKey(d);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(d);
        });
        const duplicateIds: string[] = [];
        groups.forEach((list) => {
          if (list.length <= 1) return;
          const sorted = [...list].sort((a, b) => {
            const score = (x: DocumentData) => (x.status === 'complete' ? 2 : 0) + (x.hasAiAnalysis ? 1 : 0);
            return score(b) - score(a);
          });
          sorted.slice(1).forEach((d) => duplicateIds.push(d.id));
        });
        if (duplicateIds.length > 0) {
          await VaultService.deleteDocuments(duplicateIds);
          docsToUse = docsToUse.filter((d) => !duplicateIds.includes(d.id));
        }
        localStorage.setItem('nexus_vault_mirror_doc_count', docsToUse.length.toString());
      }
      if (docsToUse.length > 0) setDocuments(docsToUse);
      if (cachedLogic) setCaseLogic(cachedLogic);
      if (cachedBounties) setBounties(cachedBounties);
      if (cachedWikis) setWikis(cachedWikis);
      if (cachedCanvas) {
        setCanvasNodes(cachedCanvas.nodes || []);
        setCanvasLinks(cachedCanvas.links || []);
      }

      const savedSelectedId = localStorage.getItem('nexus_selected_id');
      if (savedSelectedId && docsToUse.length > 0) {
        const found = docsToUse.find((d) => d.id === savedSelectedId);
        if (found) setSelectedDoc(found);
      }
      
      const savedDarkMode = localStorage.getItem('nexus_dark_mode');
      if (savedDarkMode) setIsDarkMode(savedDarkMode === 'true');

      await checkKeyStatus();
      
      // Mark as hydrated only AFTER all state updates have potentially fired
      isHydratedRef.current = true;
      setIsSystemReady(true);
      setBootError(null);
    } catch (e: any) {
      console.error("FATAL BOOT FAILURE:", e);
      setBootError(e?.message || "Nexus Registry Handshake Failed.");
    }
  }, []);

  useEffect(() => {
    bootSystem();
  }, [bootSystem]);

  useEffect(() => {
    // PROTECTIVE GUARD: Never sync unless hydration from disk is confirmed complete
    if (!isHydratedRef.current || !isSystemReady || uploading || bootError) return;
    
    const syncToVault = async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      setIsSaving(true);
      try {
        await Promise.all([
          VaultService.saveProjectState("caseLogic", caseLogic),
          VaultService.saveProjectState("canvas", { nodes: canvasNodes, links: canvasLinks }),
          VaultService.saveProjectState("bounties", bounties),
          VaultService.saveProjectState("wikis", wikis),
          documents.length > 0 ? VaultService.saveDocumentsBatch(documents) : Promise.resolve()
        ]);
        localStorage.setItem('nexus_dark_mode', isDarkMode.toString());
        if (selectedDoc) localStorage.setItem('nexus_selected_id', selectedDoc.id);
      } catch (e) {
        console.error("Vault Sync Failure:", e);
      } finally {
        setTimeout(() => {
          setIsSaving(false);
          isSyncingRef.current = false;
        }, 1500);
      }
    };

    const timer = setTimeout(syncToVault, 3000); 
    return () => clearTimeout(timer);
  }, [documents, selectedDoc, caseLogic, isDarkMode, canvasNodes, canvasLinks, isSystemReady, uploading, bounties, wikis, bootError]);

  const handleUpdateDoc = async (updatedDoc: DocumentData) => {
    setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    if (selectedDoc?.id === updatedDoc.id) setSelectedDoc(updatedDoc);
    if (isHydratedRef.current) await VaultService.saveDocument(updatedDoc);
  };

  const processSingleDoc = useCallback(async (docId: string) => {
    const doc = documentsRef.current.find(d => d.id === docId);
    if (!doc) return;
    if (doc.status === 'processing') return;

    let file = fileCacheRef.current.get(docId);
    if (!file) {
      const stored = await VaultService.getPdfFile(docId);
      if (stored) {
        file = new File([stored], doc.title, { type: 'application/pdf' });
        fileCacheRef.current.set(docId, file);
      } else {
        ocrReuploadDocIdRef.current = docId;
        ocrReuploadInputRef.current?.click();
        return;
      }
    }

    const currentTaskCount = activeTaskCountRef.current;
    if (currentTaskCount >= 2) {
      if (!processingQueueRef.current.includes(docId)) {
        processingQueueRef.current.push(docId);
        setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'pending' } : d));
      }
      return;
    }

    setActiveTaskCount(prev => prev + 1);
    activeTaskCountRef.current = currentTaskCount + 1;
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'processing', ocrProgress: 0 } : d));

    let lastReportedProgress = 0;

    try {
      const { text, previews } = await GeminiService.extractTextFromPDF(file, (prog) => {
        if (prog >= lastReportedProgress + 5 || prog === 100) {
          lastReportedProgress = prog;
          setDocuments(prev => prev.map(d => d.id === docId ? { ...d, ocrProgress: prog } : d));
        }
      });
      const localMeta = GeminiService.performLocalHeuristicAnalysis(text);
      const manualSignals = mergeEntitiesIntoManualSignals(doc.manualSignals || [], localMeta.entities || []);
      const updated: DocumentData = {
        ...doc,
        status: 'complete',
        textContent: text,
        pagePreviews: previews,
        ...localMeta,
        manualSignals
      };
      await handleUpdateDoc(updated);
      fileCacheRef.current.delete(docId);
      setStatusMessage('OCR complete');
      setTimeout(() => setStatusMessage(''), 3000);
      if (pendingNeuralLinkDocIdRef.current === docId) {
        pendingNeuralLinkDocIdRef.current = null;
        try {
          await handleDeepScanRef.current?.(updated);
        } catch (_) {
          // Already marked error in handleDeepScan on failure
        }
      }
    } catch (err) {
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'error' } : d));
      setStatusMessage('OCR failed');
      setTimeout(() => setStatusMessage(''), 3000);
    } finally {
      setActiveTaskCount(prev => prev - 1);
      activeTaskCountRef.current = Math.max(0, activeTaskCountRef.current - 1);
      const nextId = processingQueueRef.current.shift();
      if (nextId) processSingleDoc(nextId);
    }
  }, [handleUpdateDoc]);

  const processSingleDocRef = useRef(processSingleDoc);
  processSingleDocRef.current = processSingleDoc;
  const runOcr = useCallback((docId: string) => {
    processSingleDocRef.current(docId);
  }, []);

  const handleBatchProcess = async () => {
    const pending = documents.filter(d => d.status === 'pending');
    if (pending.length === 0) return;
    setUploading(true);
    setStatusMessage(`Mobilizing Intelligence Workers...`);
    
    pending.forEach(doc => {
      if (!processingQueueRef.current.includes(doc.id)) {
        processingQueueRef.current.push(doc.id);
      }
    });

    for (let i = 0; i < 2; i++) {
      const nextId = processingQueueRef.current.shift();
      if (nextId) processSingleDoc(nextId);
    }
    
    setUploading(false);
    setStatusMessage('');
  };

  const handleDeepScan = useCallback(async (doc: DocumentData) => {
    if (doc.status !== 'complete') { alert("Unit must be initialized first."); return; }
    setNlpRunningDocId(doc.id);
    const fromRef = documentsRef.current.find(d => d.id === doc.id);
    const latestDoc = (doc.textContent && doc.status === 'complete') ? doc : (fromRef || doc);
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'processing' } : d));
    try {
      const analysis = GeminiService.performLocalNer(latestDoc.title, latestDoc.textContent);
      const timeline = (analysis.timeline || []).map((e: any, i: number) => ({
        id: e.id || `ner-${Date.now()}-${i}`,
        date: e.date || '',
        event: e.event || '',
        isAiGenerated: false
      }));
      const manualSignals = mergeEntitiesIntoManualSignals(latestDoc.manualSignals || [], analysis.entities || []);
      const updated: DocumentData = {
        ...latestDoc,
        status: 'complete',
        hasAiAnalysis: true,
        title: analysis.suggested_title || latestDoc.title,
        textContent: analysis.full_ocr_text ?? latestDoc.textContent,
        aiContext: analysis.ai_context ?? '',
        docCategory: analysis.doc_type || 'Forensic Unit',
        entities: analysis.entities || [],
        locations: analysis.locations || [],
        timeline,
        hotWords: analysis.hotWords || [],
        manualSignals
      };
      await handleUpdateDoc(updated);
      setStatusMessage('NLP complete');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error('NLP failed:', err);
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'complete' } : d));
      setStatusMessage('NLP failed — try Redo NLP or check console');
      setTimeout(() => setStatusMessage(''), 4000);
    } finally {
      setNlpRunningDocId(null);
    }
  }, [handleUpdateDoc]);

  const handleRunAiScan = useCallback(async (doc: DocumentData) => {
    if (doc.status !== 'complete') { alert("Unit must be initialized first."); return; }
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'processing' } : d));
    try {
      const analysis = await GeminiService.analyzeDocument(doc.title, doc.textContent, doc.pagePreviews);
      const timeline = (analysis.timeline || []).map((e: any, i: number) => ({
        id: e.id || `ai-${Date.now()}-${i}`,
        date: e.date || '',
        event: e.event || '',
        isAiGenerated: true
      }));
      const manualSignals = mergeEntitiesIntoManualSignals(doc.manualSignals || [], analysis.entities || []);
      const updated: DocumentData = {
        ...doc,
        status: 'complete',
        hasAiAnalysis: true,
        title: analysis.suggested_title || doc.title,
        textContent: analysis.full_ocr_text ?? doc.textContent,
        aiContext: analysis.ai_context ?? '',
        docCategory: analysis.doc_type || 'Forensic Unit',
        entities: analysis.entities || [],
        locations: analysis.locations || [],
        timeline,
        hotWords: analysis.hotWords || [],
        manualSignals
      };
      await handleUpdateDoc(updated);
    } catch (err) {
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: 'error' } : d));
    }
  }, [handleUpdateDoc]);

  const handleDeepScanRef = useRef(handleDeepScan);
  handleDeepScanRef.current = handleDeepScan;

  const handleNeuralLink = useCallback((doc: DocumentData) => {
    if (doc.hasAiAnalysis) return;
    if (doc.status !== 'complete') {
      pendingNeuralLinkDocIdRef.current = doc.id;
      runOcr(doc.id);
    } else {
      handleDeepScan(doc);
    }
  }, [runOcr, handleDeepScan]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setStatusMessage("Mapping Forensic Structure...");
    try {
      const fileList = Array.from(files) as File[];
      const allPdfFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.pdf'));
      const existingKeys = new Set(
        documents.map((d) => {
          const name = d.title.replace(/\\/g, "/").split("/").pop() || d.title;
          return `${name.toLowerCase()}|${d.size}`;
        })
      );
      const pdfFiles = allPdfFiles.filter((f) => {
        const name = (f as any).webkitRelativePath ? String((f as any).webkitRelativePath).replace(/\\/g, "/").split("/").pop() : f.name;
        const sizeStr = `${(f.size / 1024 / 1024).toFixed(2)} MB`;
        const key = `${(name || "").toLowerCase()}|${sizeStr}`;
        return !existingKeys.has(key);
      });
      const skippedCount = allPdfFiles.length - pdfFiles.length;
      if (skippedCount > 0 && pdfFiles.length === 0) {
        setUploading(false);
        setStatusMessage("");
        if (e.target) e.target.value = "";
        alert(`All ${skippedCount} file(s) are already in the vault (duplicates skipped).`);
        return;
      }

      const nowStr = new Date().toLocaleDateString();

      const newDocs: DocumentData[] = pdfFiles.map((file, index) => {
        const id = `doc-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`;
        fileCacheRef.current.set(id, file);
        const displayTitle = (file as any).webkitRelativePath || file.name;
        return {
          id, title: displayTitle, date: nowStr, size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          type: 'application/pdf', status: 'pending', hasAiAnalysis: false,
          aiContext: 'Awaiting Deep Link...', manualContext: '', textContent: '',
          manualSummary: '', pagePreviews: [], entities: [], locations: [], timeline: [],
          hotWords: [], manualSignals: [], infoFound: [], manualFacts: [],
          investigationPriority: 'Routine', verdictSlant: 'Neutral', docBias: 'None',
          docCategory: 'Pending Ingestion'
        };
      });

      await VaultService.saveDocumentsBatch(newDocs).catch(() => {});
      for (const d of newDocs) {
        const file = fileCacheRef.current.get(d.id);
        if (file) {
          try {
            await VaultService.savePdfFile(d.id, file);
          } catch {
            console.warn("Could not persist PDF for", d.title);
          }
        }
      }
      const totalAfter = documents.length + newDocs.length;
      setDocuments(prev => {
        const next = [...newDocs, ...prev];
        localStorage.setItem('nexus_vault_mirror_doc_count', next.length.toString());
        return next;
      });
      if (skippedCount > 0) {
        setStatusMessage(`Added ${newDocs.length} file(s). ${skippedCount} duplicate(s) skipped. Total: ${totalAfter} units.`);
      } else {
        setStatusMessage(`Added ${newDocs.length} file(s). Total: ${totalAfter} units.`);
      }
      setTimeout(() => setStatusMessage(""), 5000);
    } catch (err) {
      console.error("Upload Failure:", err);
      alert("Nexus Vault error during batch ingestion.");
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleClearVault = useCallback(async () => {
    if (!window.confirm("Clear the entire vault? All documents, PDFs, case logic, canvas, wikis, and bounties will be permanently removed. This cannot be undone.")) return;
    try {
      await VaultService.clearVault();
      fileCacheRef.current.clear();
      processingQueueRef.current = [];
      setDocuments([]);
      setSelectedDoc(null);
      setCanvasNodes([]);
      setCanvasLinks([]);
      setCaseLogic({ hypothesis: "Initial forensic sweep active.", aiHypothesis: "", facts: [], actors: [] });
      setBounties([]);
      setWikis([]);
      window.location.reload();
    } catch (err) {
      console.error("Vault clear failed:", err);
      alert("Failed to clear vault. Try again.");
    }
  }, []);

  const getTabIcon = (tab: ProjectTab) => {
    switch(tab) {
      case ProjectTab.LIBRARY: return <Database size={20} />;
      case ProjectTab.ANALYSIS: return <Zap size={20} />;
      case ProjectTab.READER: return <BookOpen size={20} />;
      case ProjectTab.WEB_RESEARCH: return <Search size={20} />;
      case ProjectTab.CASE_LOGIC: return <Landmark size={20} />;
      case ProjectTab.WIKIS: return <Users size={20} />;
      case ProjectTab.PUBLIC_MARKET: return <ShoppingBag size={20} />;
      case ProjectTab.ANALYTICS: return <Activity size={20} />;
      case ProjectTab.LOCATIONS: return <Globe size={20} />;
      case ProjectTab.TIMELINE: return <History size={20} />;
      case ProjectTab.CANVAS: return <Brain size={20} />;
      case ProjectTab.SETTINGS: return <Settings size={20} />;
      default: return <Settings size={20} />;
    }
  };

  if (bootError) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-12 z-[9999] text-center">
         <ShieldAlert size={64} className="text-rose-500 mb-8" />
         <h1 className="text-2xl font-black text-white uppercase tracking-widest mb-4">Registry Lock Active</h1>
         <p className="text-slate-400 max-w-md text-sm leading-relaxed mb-8">{bootError}</p>
         <button onClick={() => window.location.reload()} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-xs">Re-Attempt Handshake</button>
      </div>
    );
  }

  if (!isSystemReady) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 z-[9999]">
         <div className="max-w-md w-full text-center space-y-12">
            <div className="relative">
               <Brain size={48} className="text-indigo-500 mx-auto animate-pulse" />
               <div className="absolute inset-0 bg-indigo-500/20 blur-2xl animate-pulse"></div>
            </div>
            <h1 className="text-xl font-black text-white uppercase tracking-[0.3em]">Restoring Neural Link</h1>
         </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-row min-h-screen w-full overflow-hidden min-w-[960px] ${isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>
      
      {uploading && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="flex flex-col items-center gap-6">
              <Loader2 size={48} className="animate-spin text-indigo-500" />
              <p className="text-sm font-black uppercase text-white tracking-widest animate-pulse text-center">{statusMessage}</p>
           </div>
        </div>
      )}

      {statusMessage && !uploading && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9998] px-6 py-3 rounded-xl text-white text-sm font-black uppercase tracking-widest shadow-xl border ${statusMessage.toLowerCase().includes('failed') ? 'bg-rose-600 border-rose-400/30' : 'bg-emerald-600 border-emerald-400/30'}`}>
          {statusMessage}
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleUpload} multiple accept=".pdf" className="hidden" />
      <input 
        type="file" 
        ref={folderInputRef} 
        onChange={handleUpload} 
        multiple 
        {...({ webkitdirectory: "", directory: "" } as any)} 
        className="hidden" 
      />
      <input type="file" ref={importInputRef} onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsSaving(true);
        const text = await file.text();
        await VaultService.importVault(text);
        window.location.reload();
      }} accept=".json" className="hidden" />
      <input
        type="file"
        ref={ocrReuploadInputRef}
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const docId = ocrReuploadDocIdRef.current;
          if (!file || !docId) return;
          ocrReuploadDocIdRef.current = null;
          fileCacheRef.current.set(docId, file);
          VaultService.savePdfFile(docId, file).catch(() => {});
          processSingleDocRef.current(docId);
          e.target.value = '';
        }}
      />

      {/* Desktop sidebar - always visible */}
      <nav className={`flex-shrink-0 w-64 h-screen flex flex-col border-r py-6 transition-colors z-[100] ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex flex-col items-start gap-3 mb-8 px-5">
           <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 rounded-xl shadow-lg text-white"><Brain size={22} /></div>
              <h1 className="text-lg font-black tracking-tight text-indigo-600">NEXUS<span className={isDarkMode ? 'text-white' : 'text-slate-900'}>VAULT</span></h1>
           </div>
           <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
              <Crown size={12} className="text-amber-500" />
              <span className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Premium Tier</span>
           </div>
        </div>

        <div className="flex-1 flex flex-col items-stretch overflow-y-auto scrollbar-hide px-3 space-y-1">
           {Object.values(ProjectTab).map((tab) => (
             <button
               key={tab}
               onClick={() => setActiveTab(tab)}
               className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all ${
                 activeTab === tab 
                   ? 'bg-indigo-600 text-white shadow-md' 
                   : isDarkMode 
                     ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-200' 
                     : 'text-slate-600 hover:bg-indigo-50 hover:text-slate-900'
               }`}
             >
               {getTabIcon(tab)}
               <span className="text-xs font-semibold uppercase tracking-wide">{tab.replace(/_/g, ' ')}</span>
             </button>
           ))}
        </div>

        <div className="mt-auto px-4 pt-4 border-t dark:border-slate-800">
           <button onClick={() => setIsDarkMode(!isDarkMode)} className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}>
             {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
             <span className="text-xs font-semibold">{isDarkMode ? 'Light mode' : 'Dark mode'}</span>
           </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-14 border-b flex items-center justify-between px-6 flex-shrink-0 dark:border-slate-800 z-50">
           <div className="flex items-center gap-4 min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{activeTab.replace(/_/g, ' ')}</span>
              {selectedDoc && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 rounded-lg text-indigo-500 min-w-0 border border-indigo-500/20">
                  <FileText size={14} className="flex-shrink-0" />
                  <span className="text-sm font-semibold truncate max-w-[320px]">{selectedDoc.title}</span>
                </div>
              )}
           </div>
           <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-xs font-semibold uppercase border border-emerald-500/20">
                <RefreshCw size={12} className={isSaving ? "animate-spin" : ""} /> {isHydratedRef.current ? 'Registry OK' : 'Hydrating...'}
              </div>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-lg border dark:border-slate-800 hover:bg-slate-800">
                {isDarkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-400" />}
              </button>
           </div>
        </header>

        <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          {activeTab === ProjectTab.LIBRARY && (
            <LibraryView 
              documents={documents} 
              onSelect={(doc) => { const latest = documents.find(d => d.id === doc.id) || doc; setSelectedDoc(latest); setActiveTab(ProjectTab.READER); }} 
              onRead={(doc) => { const latest = documents.find(d => d.id === doc.id) || doc; setSelectedDoc(latest); setActiveTab(ProjectTab.READER); }} 
              onUpload={() => fileInputRef.current?.click()} 
              onFolderUpload={() => folderInputRef.current?.click()} 
              onRestore={() => {}} 
              onExport={() => VaultService.exportVault().then(data => {
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `nexus-export.json`;
                link.click();
              })} 
              onExportCSV={() => {}} 
              onImport={() => importInputRef.current?.click()} 
              onUpdateDoc={handleUpdateDoc} 
              onInitialize={runOcr} 
              onDeepScan={handleDeepScan}
              onNeuralLink={handleNeuralLink}
              onRunAiScan={handleRunAiScan}
              onBatchProcess={handleBatchProcess}
              uploading={uploading} 
              nlpRunningDocId={nlpRunningDocId}
              isDarkMode={isDarkMode} 
              vaultDetected={documents.length > 0} 
              suppressedCount={0} 
            />
          )}
          {activeTab === ProjectTab.READER && <ReaderView doc={selectedDoc} onBack={() => setActiveTab(ProjectTab.LIBRARY)} onUpdateDoc={handleUpdateDoc} onRunOcr={runOcr} isDarkMode={isDarkMode} setWikis={setWikis} wikis={wikis} />}
          {activeTab === ProjectTab.ANALYSIS && <AnalysisDashboard doc={selectedDoc} allDocs={documents} onSelectDoc={setSelectedDoc} onUpdateDoc={handleUpdateDoc} onInitialize={runOcr} onDeepScan={handleDeepScan} isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.WEB_RESEARCH && <WebResearchView isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.CASE_LOGIC && <CaseLogicView logic={caseLogic} setLogic={setCaseLogic} documents={documents} canvasNodes={canvasNodes} canvasLinks={canvasLinks} isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.PUBLIC_MARKET && <PublicMarketplace bounties={bounties} setBounties={setBounties} isDarkMode={isDarkMode} documents={documents} />}
          {activeTab === ProjectTab.WIKIS && <IntelligenceWiki wikis={wikis} setWikis={setWikis} documents={documents} isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.ANALYTICS && <AnalyticsView documents={documents} wikis={wikis} isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.LOCATIONS && <LocationsView documents={documents} isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.TIMELINE && <TimelineView documents={documents} onUpdateDoc={handleUpdateDoc} isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.CANVAS && <ForensicCanvas documents={documents} nodes={canvasNodes} setNodes={setCanvasNodes} links={canvasLinks} setLinks={setCanvasLinks} isDarkMode={isDarkMode} />}
          {activeTab === ProjectTab.SETTINGS && <SettingsView onExport={() => {}} onImport={() => importInputRef.current?.click()} onClearVault={handleClearVault} onSelectKey={() => window.aistudio?.openSelectKey().then(checkKeyStatus)} hasApiKey={hasApiKey} isDarkMode={isDarkMode} toggleDarkMode={() => setIsDarkMode(!isDarkMode)} onForceMirrorSync={bootSystem} />}
        </div>
      </main>
    </div>
  );
};

export default App;
