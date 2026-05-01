import Image from "next/image";

export function FortniteLlama({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Image
        src="/fortnite-llama.svg"
        alt="Fortnite Llama"
        width={200}
        height={200}
        className="w-full h-full object-contain"
        priority
      />
    </div>
  );
}
