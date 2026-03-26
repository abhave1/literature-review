import MxmlAnalyzer from '@/components/MxmlAnalyzer';

export default function Mxml4Page() {
  return (
    <MxmlAnalyzer
      title="MxML Phase 4 Analysis Hub"
      promptMode="mxml4"
      showUpload={true}
      showJournalType={true}
      fileCategories={[
        { key: 'measurement', label: 'Measurement Journals', folderKey: 'mxml4-measurement', blobPrefix: 'mxml4-measurement/' },
        { key: 'nonmeasurement', label: 'Non-measurement Journals', folderKey: 'mxml4-nonmeasurement', blobPrefix: 'mxml4-nonmeasurement/' },
      ]}
    />
  );
}
