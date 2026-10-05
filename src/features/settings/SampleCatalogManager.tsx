import { useApp } from '@/app/store';
import { getSampleUpdatePreview } from '@/data/sampleCatalog';
import { SampleCatalogSettings } from './SampleCatalogSettings';

export function SampleCatalogManager({ inline = false }: { inline?: boolean }) {
  const {
    store,
    updateSampleCatalog,
    restoreSampleCatalog,
    listSampleCatalogBackups,
    exportSampleCatalogSnapshot,
  } = useApp();
  const backups = listSampleCatalogBackups();

  return <SampleCatalogSettings
    inline={inline}
    preview={getSampleUpdatePreview(store)}
    backups={backups.ok ? backups.backups : []}
    backupError={backups.ok ? null : backups.reason}
    onApply={updateSampleCatalog}
    onRestore={restoreSampleCatalog}
    onExportBackup={exportSampleCatalogSnapshot}
  />;
}
