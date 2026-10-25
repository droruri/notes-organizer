import { extractLinks, videoEmbed } from '@notes/shared';
import { ArticleCard } from './ArticleCard';

/** Previews for the links in a note body: video players for YouTube / Vimeo, cards otherwise. */
export function LinkPreviews({ body }: { body: string }) {
  const links = extractLinks(body).slice(0, 5);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {links.map((url) => {
        const embed = videoEmbed(url);
        return embed ? (
          <iframe
            key={url}
            src={embed}
            title={url}
            loading="lazy"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="aspect-video w-full rounded-[10px] bg-surface-hover"
          />
        ) : (
          <ArticleCard key={url} url={url} />
        );
      })}
    </div>
  );
}
