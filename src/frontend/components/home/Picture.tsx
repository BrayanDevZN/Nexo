import type { Picture as PictureData } from "@/lib/pictures";

export function Picture({
  picture,
  eager = false,
  className,
  caption = true,
}: {
  picture: PictureData;
  eager?: boolean;
  className?: string;
  caption?: boolean;
}) {
  return (
    <figure className={className ? `nx-photo ${className}` : "nx-photo"}>
      <img
        src={picture.src}
        width={picture.width}
        height={picture.height}
        alt={picture.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
      {caption ? <figcaption>{picture.caption}</figcaption> : null}
    </figure>
  );
}
