// Slot for the demo video. Renders nothing until NEXT_PUBLIC_DEMO_VIDEO_URL is set
// (a YouTube/Vimeo URL or a direct .mp4 link).
const URL_ = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL ?? "";

function embed(u: string): { kind: "iframe" | "video"; src: string } | null {
  if (!u) return null;
  const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  return { kind: "video", src: u };
}

export function DemoVideo() {
  const e = embed(URL_);
  if (!e) return null;
  return (
    <section className="panel video" aria-label="Demo video">
      <header className="panel-h"><h2 className="label">Demo</h2><span className="corner">1:54</span></header>
      <div className="video-box">
        {e.kind === "iframe" ? (
          <iframe src={e.src} title="Live mainnet checker demo" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <video src={e.src} controls preload="none" playsInline />
        )}
      </div>
    </section>
  );
}
