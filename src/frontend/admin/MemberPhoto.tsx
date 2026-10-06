import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { type createApi } from "./api";

export function MemberPhoto({ api, id, name, hasPhoto }: { api: ReturnType<typeof createApi>; id: string; name: string; hasPhoto: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true; let objectUrl = "";
    setUrl("");
    if (hasPhoto) void api.file("/members/" + encodeURIComponent(id) + "/photo").then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, id, hasPhoto]);
  return <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">{url ? <img src={url} alt={"Foto de " + name} className="size-full object-cover" onError={() => setUrl("")} /> : <UserRound className="size-6" aria-hidden="true" />}</span>;
}
