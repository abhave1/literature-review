import MxmlAnalyzer from '@/components/MxmlAnalyzer';

export default function Mxml1Page() {
  return (
    <MxmlAnalyzer
      title="MxML Phase 1 Analysis Hub"
      promptMode="mxml"
      showUpload={true}
      fileCategories={[
        { key: 'mxml', label: 'MxML PDFs', folderKey: 'mxml', blobPrefix: 'mxml-pdfs/' },
      ]}
    />
  );
}
