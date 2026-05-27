import type { ImgHTMLAttributes } from "react";

type IconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  size?: number;
};

function PngIcon({ src, alt, size = 64, style, ...rest }: IconProps & { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size, display: "inline-block", ...style }}
      {...rest}
    />
  );
}

export function KeyboardIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/01-keyboard.png" alt="Keyboard" {...props} />;
}

export function ImagesIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/02-image.png" alt="Images" {...props} />;
}

export function StickersIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/03-sticky-note.png" alt="Stickers" {...props} />;
}

export function GeneralSettingsIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/04-settings.png" alt="Settings" {...props} />;
}

export function UpdaterIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/05-refresh.png" alt="Updater" {...props} />;
}

export function BugsIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/06-bug.png" alt="Bugs" {...props} />;
}

export function CopyIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/07-copy.png" alt="Copy" {...props} />;
}

export function PasteIcon(props: IconProps) {
  return <PngIcon src="/ref-icons/08-clipboard.png" alt="Paste" {...props} />;
}
