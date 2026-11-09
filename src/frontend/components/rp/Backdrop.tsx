/** Purple light behind the whole site: slow glows, a faint grid and a soft spot that follows the pointer. */
export function Backdrop() {
  return (
    <div className="rp-bg" aria-hidden="true">
      <i className="rp-glow rp-glow-a" />
      <i className="rp-glow rp-glow-b" />
      <i className="rp-glow rp-glow-c" />
      <b className="rp-grid" />
      <b className="rp-spot" />
      <b className="rp-vignette" />
    </div>
  );
}
