import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import { useApp } from "./stores/app";
import GeneratePage from "./features/generate/GeneratePage";
import GalleryPage from "./features/gallery/GalleryPage";
import QueuePage from "./features/queue/QueuePage";
import PresetsPage from "./features/presets/PresetsPage";
import BatchPage from "./features/batch/BatchPage";
import ModelsPage from "./features/models/ModelsPage";
import SettingsPage from "./features/settings/SettingsPage";

export default function App() {
  const { tab, init, initError } = useApp();

  useEffect(() => {
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        {initError && (
          <div className="m-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Failed to initialise: {initError}
          </div>
        )}
        {tab === "generate" && <GeneratePage />}
        {tab === "gallery" && <GalleryPage />}
        {tab === "queue" && <QueuePage />}
        {tab === "presets" && <PresetsPage />}
        {tab === "batch" && <BatchPage />}
        {tab === "models" && <ModelsPage />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
