type ExplainerVideoProps = {
  title?: string | null;
  description?: string | null;
  youtubeUrl?: string | null;
};

function getYoutubeEmbedUrl(url?: string | null) {
  if (!url) return null;

  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);

  if (!match?.[1]) return null;

  return `https://www.youtube-nocookie.com/embed/${match[1]}`;
}

export default function ExplainerVideo({
  title,
  description,
  youtubeUrl,
}: ExplainerVideoProps) {
  const embedUrl = getYoutubeEmbedUrl(youtubeUrl);

  if (!embedUrl) return null;

  return (
    <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-orange-100 sm:p-5">
      <div className="mb-4">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-[#FF6B00]">
          Product Demo
        </p>

        <h3 className="mt-2 text-2xl font-black">
          {title || 'See SpinBite in Action'}
        </h3>

        <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
          {description || 'Watch how restaurants turn menus into interactive games.'}
        </p>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-3xl bg-black shadow-xl">
        <iframe
          src={embedUrl}
          title={title || 'SpinBite explainer video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
