import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Filter, Box, Globe, Clock, Bell, Eye, Download, Upload, Calendar, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout, PageContainer, LoadingSkeleton, EmptyState } from "@/components/ui-system";
import { getHRDocuments, createHRDocument } from "@/services/documents";

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  
  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: "",
    description: "",
    category: "Personal Documents",
    version: "v1.0",
    status: "Published",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => createHRDocument(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-documents"] });
      setIsUploadOpen(false);
      setSelectedFile(null);
      setUploadData({ title: "", description: "", category: "Personal Documents", version: "v1.0", status: "Published" });
    }
  });

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadData.title || !uploadData.category) return;
    
    const formData = new FormData();
    formData.append("title", uploadData.title);
    formData.append("description", uploadData.description);
    formData.append("category", uploadData.category);
    formData.append("version", uploadData.version);
    formData.append("status", uploadData.status);
    if (selectedFile) formData.append("file", selectedFile);
    
    uploadMutation.mutate(formData);
  };

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["hr-documents"],
    queryFn: getHRDocuments,
  });

  const getCategoryColor = (category: string) => {
    if (category.includes("Personal")) return "text-orange-600 bg-orange-50";
    if (category.includes("Legal")) return "text-slate-600 bg-slate-100";
    if (category.includes("Financial")) return "text-rose-600 bg-rose-50";
    return "text-amber-600 bg-amber-50";
  };

  const getStatusColor = (status: string) => {
    if (status === "Published") return "text-blue-600 bg-blue-50 border-blue-200";
    if (status === "Draft") return "text-gray-600 bg-gray-50 border-gray-200";
    return "text-emerald-600 bg-emerald-50 border-emerald-200";
  };

  const filteredDocs = useMemo(() => {
    let result = documents;
    if (activeTab !== "All") {
      result = result.filter(d => d.status === activeTab);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(d => d.title.toLowerCase().includes(s) || d.category.toLowerCase().includes(s));
    }
    return result;
  }, [documents, activeTab, search]);

  const stats = useMemo(() => {
    const total = documents.length;
    const published = documents.filter(d => d.status === "Published").length;
    return {
      total,
      published,
      publishedPercent: total ? Math.round((published / total) * 100) : 0,
      expiring: 0,
      needsAck: 0
    };
  }, [documents]);

  const tabs = [
    { name: "All", count: documents.length, icon: "LayoutGrid" },
    { name: "Draft", count: documents.filter(d => d.status === "Draft").length, icon: "FileEdit" },
    { name: "Under Review", count: documents.filter(d => d.status === "Under Review").length, icon: "Search" },
    { name: "Approved", count: documents.filter(d => d.status === "Approved").length, icon: "CheckCircle" },
    { name: "Published", count: documents.filter(d => d.status === "Published").length, icon: "Globe" },
    { name: "Archived", count: documents.filter(d => d.status === "Archived").length, icon: "Archive" },
    { name: "Expired", count: documents.filter(d => d.status === "Expired").length, icon: "XCircle" },
  ];

  return (
    <AppLayout>
      <PageContainer>
        <div className="flex flex-col space-y-6 max-w-7xl mx-auto pb-10">
          
          {/* Header */}
          <div className="flex items-start justify-between mt-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">HR Documents</h1>
              <p className="text-sm text-gray-500 mt-1">Store and manage official HR documents for employees.</p>
            </div>
            <Button onClick={() => setIsUploadOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium">
              <Upload className="w-4 h-4 mr-2" /> Upload Document
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Documents</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <p className="text-xs text-gray-500 mt-3">All time</p>
              <div className="absolute right-4 top-4 bg-gray-100 p-3 rounded-full">
                <Box className="w-6 h-6 text-gray-600" />
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Published</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.published}</p>
              </div>
              <p className="text-xs text-blue-600 font-medium mt-3">{stats.publishedPercent}% of total</p>
              <div className="absolute right-4 top-4 bg-blue-50 p-3 rounded-full">
                <Globe className="w-6 h-6 text-blue-500" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Expiring Soon</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.expiring}</p>
              </div>
              <p className="text-xs text-gray-500 mt-3">Within 30 days</p>
              <div className="absolute right-4 top-4 bg-amber-50 p-3 rounded-full">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Needs Acknowledgment</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.needsAck}</p>
              </div>
              <p className="text-xs text-rose-600 font-medium mt-3">0% of total</p>
              <div className="absolute right-4 top-4 bg-rose-50 p-3 rounded-full">
                <Bell className="w-6 h-6 text-rose-500" />
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden mt-6">
            <div className="p-4 flex items-center justify-between gap-4 border-b">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    placeholder="Search..." 
                    className="pl-9 bg-gray-50/50 border-gray-200" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select className="h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>All Categories</option>
                  <option>Personal Documents</option>
                  <option>Legal Documents</option>
                  <option>Financial Documents</option>
                </select>
              </div>
              <Button variant="outline" className="text-gray-600 border-gray-200">
                <Filter className="w-4 h-4 mr-2" /> Filters
              </Button>
            </div>
            
            {/* Tabs */}
            <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.name 
                      ? "bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500" 
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-b-2 border-transparent"
                  }`}
                >
                  {tab.name}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.name ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="mt-6"><LoadingSkeleton rows={5} /></div>
          ) : !filteredDocs.length ? (
            <div className="mt-6"><EmptyState icon={Box} title="No documents found" description="There are no HR documents matching your criteria." /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
              {filteredDocs.map((doc) => (
                <div key={doc.id} className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col h-full relative">
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <h3 className="font-bold text-gray-900 leading-tight">{doc.title}</h3>
                    <button className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center text-xs text-gray-500 mb-4">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    Last Update:
                    <span className="ml-1 text-gray-700 font-medium">{doc.lastUpdate}</span>
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${getCategoryColor(doc.category)}`}>
                      {doc.category}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      {doc.version}
                    </span>
                  </div>
                  
                  <div className="mb-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusColor(doc.status)}`}>
                      {doc.status}
                    </span>
                  </div>

                  <div className="mt-auto pt-4 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-xs flex-shrink-0">
                        {doc.author.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{doc.author.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{doc.author.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center text-gray-400 gap-1 ml-2">
                      <Download className="w-3.5 h-3.5 cursor-pointer hover:text-gray-600" onClick={() => doc.file_url && window.open(doc.file_url, '_blank')} />
                      <span className="text-xs font-medium">{doc.downloads}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </PageContainer>

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">Upload HR Document</h2>
              <button onClick={() => setIsUploadOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document Title *</label>
                <Input required placeholder="e.g. Remote Work Policy" value={uploadData.title} onChange={e => setUploadData({...uploadData, title: e.target.value})} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input placeholder="Brief description of the document" value={uploadData.description} onChange={e => setUploadData({...uploadData, description: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value={uploadData.category} onChange={e => setUploadData({...uploadData, category: e.target.value})}>
                    <option>Personal Documents</option>
                    <option>Legal Documents</option>
                    <option>Financial Documents</option>
                    <option>Employment Documents</option>
                    <option>General Policy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value={uploadData.status} onChange={e => setUploadData({...uploadData, status: e.target.value})}>
                    <option>Draft</option>
                    <option>Under Review</option>
                    <option>Approved</option>
                    <option>Published</option>
                    <option>Archived</option>
                    <option>Expired</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <Input required placeholder="v1.0" value={uploadData.version} onChange={e => setUploadData({...uploadData, version: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload File</label>
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50">
                  <input type="file" id="file-upload" className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                  <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                    <FileText className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-emerald-600 font-medium">Browse files</span>
                    <span className="text-xs text-gray-500 mt-1">{selectedFile ? selectedFile.name : "PDF, DOCX up to 10MB"}</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={uploadMutation.isPending || !uploadData.title} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                  {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}