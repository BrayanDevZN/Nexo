const ORIGIN = "https://nexoaicompany.com";

/** One canonical address per public page, so /contabilidade and /contabilidade/ count as the same page. */
export function setCanonical(pathname: string): void {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.append(link);
  }
  link.href = ORIGIN + path;
}

/** The panel is private: keep it out of search results. */
export function setNoIndex(): void {
  const meta = document.createElement("meta");
  meta.name = "robots";
  meta.content = "noindex";
  document.head.append(meta);
}
