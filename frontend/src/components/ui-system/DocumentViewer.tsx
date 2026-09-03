import { useEffect, useState } from "react";

export function DocumentViewer({ url }: { url: string }) {
  const [mdContent, setMdContent] = useState<string | null>(null);

  useEffect(() => {
    if (url && (url.endsWith(".md") || url.includes(".md?"))) {
      fetch(url)
        .then((res) => res.text())
        .then(setMdContent)
        .catch(console.error);
    } else {
      setMdContent(null);
    }
  }, [url]);

  if (mdContent !== null) {
    return (
      <div className="h-full w-full overflow-y-auto bg-white p-6 sm:p-8">
        <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-black/80 font-medium">
          {mdContent}
        </pre>
      </div>
    );
  }

  return (
    <iframe
      src={url}
      className="w-full h-full bg-white text-black"
      style={{ colorScheme: "light" }}
      title="Document Preview"
    />
  );
}
