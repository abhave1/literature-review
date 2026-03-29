import MxmlAnalyzer from '@/components/MxmlAnalyzer';

export default function Mxml4OpenPage() {
  return (
    <MxmlAnalyzer
      title="MxML4 Open-Ended Analysis"
      promptMode="mxml4-open"
      showUpload={true}
      showJournalType={true}
      fileCategories={[
        { key: 'measurement', label: 'Measurement Journals', folderKey: 'mxml4-measurement', blobPrefix: 'mxml4-measurement/' },
        { key: 'nonmeasurement', label: 'Non-measurement Journals', folderKey: 'mxml4-nonmeasurement', blobPrefix: 'mxml4-nonmeasurement/' },
      ]}
    />
  );
}
