import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50 md:flex-row">
      <Sidebar />
      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
