import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  size?: number;
  priority?: boolean;
}

export function BrandLogo({ className, size = 28, priority = false }: BrandLogoProps) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center shrink-0 overflow-hidden rounded-lg shadow-sm border border-cyan-500/30 bg-slate-950/80 transition-transform duration-200 hover:scale-105',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="Agentic OS"
        width={size}
        height={size}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
