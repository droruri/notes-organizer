import { splitLinks } from '@notes/shared';

/** Text with every http(s) URL rendered as a link that opens in a new tab. */
export function LinkedText({ text }: { text: string }) {
  return splitLinks(text).map((seg, i) =>
    seg.kind === 'link' ? (
      <a
        key={i}
        href={seg.url}
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
        className="text-accent underline underline-offset-2 break-all transition-opacity duration-150 hover:opacity-80"
      >
        {seg.url}
      </a>
    ) : (
      seg.text
    ),
  );
}
