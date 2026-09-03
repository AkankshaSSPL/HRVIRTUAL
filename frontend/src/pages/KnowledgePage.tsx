import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { X, Send, FileText, Loader2, Database, Folder, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import {
    UserMessageBubble,
    AgentMessageBubble,
} from "@/components/ui-system/ChatMessage"; // adjust import path if it differs
import {
    sendKnowledgeChat,
    getKnowledgeHistory,
    clearKnowledgeHistory,
    getBackendUrl,
    type Citation,
    type HistoryMessage,
} from "@/services/knowledge";
import { DocumentViewer } from "@/components/ui-system/DocumentViewer";
import { useAuthStore } from "@/stores/authStore";

interface ChatTurn {
    role: "user" | "assistant";
    content: string;
    citations?: Citation[] | null;
}

const EXAMPLE_QUESTIONS = [
    "What is the leave policy?",
    "How do I claim travel reimbursement?",
    "What's the process for requesting work from home?",
    "What are the notice period requirements?",
];

export default function KnowledgePage() {
    const user = useAuthStore(s => s.user);
    const [messages, setMessages] = useState<ChatTurn[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDocumentUrl, setSelectedDocumentUrl] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getKnowledgeHistory();
                setMessages(history.map((h: any) => ({
                    role: h.role,
                    content: h.content,
                    citations: h.citations,
                })));
            } catch (err) {
                // A fresh account with no history yet is expected; don't surface an error for it.
                console.error("Failed to load chat history:", err);
            }
        };
        fetchHistory();
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const userText = input.trim();
        setInput("");
        setError(null);

        const newMessages = [...messages, { role: "user", content: userText } as ChatTurn];
        setMessages(newMessages);
        setLoading(true);
        setSelectedDocumentUrl(null);

        try {
            const response = await sendKnowledgeChat(userText);
            setMessages([...newMessages, { role: "assistant", content: response.answer, citations: response.citations }]);
        } catch (err: any) {
            setError(err.message || "Failed to communicate with knowledge agent.");
            setMessages([...newMessages, { role: "assistant", content: "I'm sorry, I encountered an error while searching the knowledge base." }]);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = async () => {
        try {
            await clearKnowledgeHistory();
            setMessages([]);
            setSelectedDocumentUrl(null);
        } catch (err) {
            console.error("Failed to clear history", err);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <AppLayout>
            <div className="flex h-[calc(100vh-4rem)] -mt-6 -mb-6 -mx-4 sm:-mx-6 lg:-mx-8 p-4 sm:p-6 lg:p-8 gap-4 overflow-hidden">
                <div className={cn("flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-all duration-300", selectedDocumentUrl ? "w-1/2" : "w-full max-w-6xl mx-auto")}>
                    <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/30">
                        <div>
                            <h1 className="text-xl font-bold tracking-tight">HR Knowledge Base</h1>
                            <p className="text-sm text-muted-foreground mt-1">Ask questions about policies, benefits, and procedures.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleClear}
                                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                                Clear Chat
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                        {messages.length === 0 && !loading && (
                            <div className="flex h-full flex-col items-center justify-center text-center max-w-md mx-auto">
                                <div className="rounded-full bg-indigo-500/10 p-4 mb-4 ring-8 ring-indigo-500/5">
                                    <Database className="h-8 w-8 text-indigo-500" />
                                </div>
                                <h2 className="text-lg font-semibold mb-2">Welcome to HR Knowledge, {user?.first_name || 'there'}!</h2>
                                <p className="text-sm text-muted-foreground mb-6">
                                    I can answer questions based on the company's uploaded HR documents, policies, and guidelines.
                                </p>
                                <div className="w-full space-y-2 text-left">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Try asking:</p>
                                    {[
                                        "What is the work from home policy?",
                                        "How many sick days do I get?",
                                        "Explain the maternity leave benefits.",
                                        "What are the core working hours?"
                                    ].map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setInput(q)}
                                            className="w-full text-left p-3 text-sm rounded-lg border bg-muted/50 hover:bg-muted hover:border-indigo-500/30 transition-all text-foreground/80 hover:text-foreground flex items-center gap-2"
                                        >
                                            <FileText className="w-4 h-4 text-indigo-400" />
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-6">
                            {messages.map((turn, idx) =>
                                turn.role === "user" ? (
                                    <UserMessageBubble key={idx}>{turn.content}</UserMessageBubble>
                                ) : (
                                    <div key={idx} className="flex flex-col gap-2">
                                        <AgentMessageBubble>
                                            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90">
                                                <ReactMarkdown>
                                                    {turn.content}
                                                </ReactMarkdown>
                                            </div>
                                        </AgentMessageBubble>
                                        {turn.citations && turn.citations.length > 0 && (
                                            <div className="ml-12 flex flex-wrap gap-2 mt-1">
                                                {turn.citations.map((c, cidx) => (
                                                    <button
                                                        key={cidx}
                                                        onClick={() => setSelectedDocumentUrl(getBackendUrl(c.file_url))}
                                                        className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shadow-sm"
                                                        title={c.snippet}
                                                    >
                                                        <FileText className="w-3 h-3 text-indigo-500" />
                                                        <span className="font-medium">{c.title}</span>
                                                        {c.version && <span className="opacity-60">· v{c.version}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            )}
                            {loading && (
                                <div className="flex items-center gap-3 text-sm text-muted-foreground ml-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                                    <span className="animate-pulse">Searching knowledge base...</span>
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {error && (
                            <div className="mt-4 flex items-center gap-2 text-sm text-rose-500 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                                <ShieldAlert className="w-4 h-4" />
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="border-t p-4 bg-muted/10">
                        <div className="relative max-w-6xl mx-auto flex items-end gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about a policy, benefit, or procedure..."
                                rows={1}
                                className="flex-1 resize-none rounded-xl border bg-card px-4 py-3.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[52px] max-h-[150px]"
                            />
                            <button
                                type="button"
                                onClick={() => handleSend()}
                                disabled={loading || !input.trim()}
                                className="rounded-xl bg-indigo-500 p-3.5 text-white shadow-sm hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 transition-colors shrink-0"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-center text-[10px] text-muted-foreground mt-3">
                            Knowledge Agent uses RAG to answer questions based on uploaded documents. Always verify critical information.
                        </p>
                    </div>
                </div>

                {selectedDocumentUrl && (
                    <div className="flex w-1/2 flex-col overflow-hidden rounded-lg border bg-card shadow-sm animate-in slide-in-from-right-8 duration-300">
                        <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Folder className="w-4 h-4 text-indigo-500" />
                                Document Source
                            </h2>
                            <button
                                onClick={() => setSelectedDocumentUrl(null)}
                                className="rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-muted/10">
                            <DocumentViewer url={selectedDocumentUrl} />
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}