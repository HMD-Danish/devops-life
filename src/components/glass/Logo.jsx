import { cn } from "@/lib/utils";

/**
 * The DevOps Life mark. Served from the app's own storage at the exact pixel
 * size needed, with a 2x asset for high-density screens. Always square and
 * contained, so the artwork is never stretched.
 */
const SIZES = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 96, 112, 128, 144, 160, 180, 192, 224, 256, 320, 384, 512, 1024];

const nearest = (value) => SIZES.find((size) => size >= value) || 1024;

export default function Logo({ size = 32, className, decorative = false, style }) {
  const one = nearest(size);
  const two = nearest(size * 2);

  return (
    <img
      src={`/icons/logo-${one}.png`}
      srcSet={`/icons/logo-${one}.png 1x, /icons/logo-${two}.png 2x`}
      width={size}
      height={size}
      alt={decorative ? "" : "DevOps Life logo"}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn("logo-mark", className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}

/**
 * Loading mark: the black disc stays still while the infinity loop turns.
 * The rotation is switched off under prefers-reduced-motion.
 */
export function LogoLoader({ size = 64, className }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full bg-black",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.1)] dark:shadow-[0_0_0_2px_rgba(255,255,255,0.55),0_0_24px_rgba(255,255,255,0.18)]",
        className
      )}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      <img
        src="/icons/logo-art-480.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="logo-spin absolute inset-0 h-full w-full object-contain"
      />
    </span>
  );
}