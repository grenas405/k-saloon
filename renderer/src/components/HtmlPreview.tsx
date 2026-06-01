export function HtmlPreview(
  { title, html, defaultFileName, onClose }: {
    title: string;
    html: string;
    defaultFileName: string;
    onClose: () => void;
  },
) {
  async function printDoc() {
    if (window.app?.printDoc) {
      await window.app.printDoc(html);
      return;
    }
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.print();
  }

  async function savePdf() {
    if (window.app?.savePdf) {
      await window.app.savePdf(html, defaultFileName);
      return;
    }
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold">{title}</h3>
          <div className="flex gap-2">
            <button onClick={printDoc} className="btn-mini">Print</button>
            <button onClick={savePdf} className="btn-mini">Save PDF</button>
            <button onClick={onClose} className="btn-mini">Close</button>
          </div>
        </div>
        <iframe
          title={title}
          sandbox=""
          srcDoc={html}
          className="min-h-0 flex-1 bg-white"
        />
      </div>
      <style>{`
        .btn-mini { font-size:0.75rem; font-weight:700; padding:0.45rem 0.7rem; border-radius:0.5rem; background:#f1f5f9; color:#334155; }
      `}</style>
    </div>
  );
}
