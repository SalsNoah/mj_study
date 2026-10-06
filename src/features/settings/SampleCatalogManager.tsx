import { useApp } from '@/app/store';
import { getSampleRemovalPreview, getSampleUpdatePreview } from '@/data/sampleCatalog';
import { SampleCatalogSettings } from './SampleCatalogSettings';

export function SampleCatalogManager({ inline = false }: { inline?: boolean }) {
  const {
    store,
    updateSampleCatalog,
    removeSampleCatalog,
    restoreSampleCatalog,
    listSampleCatalogBackups,
    exportSampleCatalogSnapshot,
  } = useApp();
  const backups = listSampleCatalogBackups();

  return <SampleCatalogSettings
    inline={inline}
    preview={getSampleUpdatePreview(store)}
    removalPreview={getSampleRemovalPreview(store)}
    backups={backups.ok ? backups.backups : []}
    backupError={backups.ok ? null : backups.reason}
    onApply={updateSampleCatalog}
    onRemove={removeSampleCatalog}
    onRestore={restoreSampleCatalog}
    onExportBackup={exportSampleCatalogSnapshot}
  />;
}
