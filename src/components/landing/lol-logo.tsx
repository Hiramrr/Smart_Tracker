import Image from "next/image";

export function LolLogo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Image
        src="/lol-logo.svg"
        alt="League of Legends"
        width={200}
        height={200}
        className="w-full h-full object-contain"
        priority
      />
    </div>
  );
}
