import Image from "next/image";

export function AppLoadingScreen({
  label = "Loading your collection",
}: {
  label?: string;
}) {
  return (
    <div className="fixed inset-0 z-[1003] flex items-center justify-center bg-[var(--background)] px-6 text-center">
      <div className="flex flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/[0.04] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
          <Image
            src="/icon.png"
            alt="TCG"
            width={52}
            height={52}
            priority
            className="animate-spin rounded-[1rem]"
          />
        </div>
        <p className="mt-5 text-base font-semibold text-white/90">{label}</p>
        <p className="mt-1 text-sm text-white/45">Hang tight while we get everything ready.</p>
      </div>
    </div>
  );
}
