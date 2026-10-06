import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { type createApi } from "./api";

export function MemberPhoto({ api, id, name, hasPhoto }: { api: ReturnType<typeof createApi>; id: string; name: string; hasPhoto: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true; let objectUrl = "";
    setUrl("");
    void api.file("/members/" + encodeURIComponent(id) + "/photo?v=" + Date.now()).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, id, hasPhoto]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">{url ? <img src={url} alt={"Foto de " + name} className="size-full object-cover" loading="lazy" onError={() => setUrl("")} /> : initials || <UserRound className="size-6" aria-hidden="true" />}</span>;
}
