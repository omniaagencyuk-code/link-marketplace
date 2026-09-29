import Image from 'next/image';
import { artworkSize, findArtwork, isUploaded } from '@/lib/cms/artwork';

/**
 * Wide artwork behind a landing page's first screen.
 *
 * The mascot beside the headline is a picture in a column. This is the whole
 * section: a scene running edge to edge with the copy sitting on it, which is
 * what a gambling page is expected to look like by anyone arriving from a
 * search for one.
 *
 * From `lg` up only. A banner is drawn wide - this one is nearly three times
 * as wide as it is tall - and on a phone that shape is a thin strip with a
 * parrot too small to read. Small screens keep the mascot column they already
 * had, which is the artwork drawn for that shape; this is the artwork drawn
 * for this one.
 *
 * Decorative: `alt` is empty on purpose. The picture says nothing the headline
 * over it does not, and a screen reader announcing a parrot before the h1 is
 * noise. The CMS still carries alt text for the mascot, which is a picture
 * rather than a backdrop.
 */
export function NicheBanner({ src }: { src: string }) {
  const artwork = findArtwork(src);
  // An uploaded banner lives on another host, so there is no file to measure -
  // and without its shape the fade below would land in the wrong place.
  if (!artwork || isUploaded(artwork)) return null;

  const { width, height } = artworkSize(artwork);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      {/*
        Contained rather than covering, and stood on the bottom edge.

        Covering stretches the picture to fill a section that is nearer 2:1,
        so it zooms by half: the parrot's head goes off the top and its body
        lands under the headline. Contained keeps the shape it was drawn in at
        every width - the subject stays the size and the place it was composed
        for - and what varies is how much plain white sits above it, which is
        where the breadcrumb and the eyebrow already are.
      */}
      <Image
        src={artwork}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-contain object-right-bottom"
      />

      {/*
        The top of a contained picture is a hard line across the page wherever
        the section is taller than the picture, which is every width where the
        copy sets the height. This box is the picture's own - same width, same
        shape, same bottom edge - so a fade at its top lands exactly on that
        line. Short on purpose: the parrot's crest begins a few percent down,
        and a deeper fade would wash the top of its head.

        The shape comes from the file rather than a constant, so the next
        banner needs no edit here.
      */}
      <div
        style={{ aspectRatio: `${width} / ${height}` }}
        className="absolute inset-x-0 bottom-0 max-h-full bg-[linear-gradient(to_bottom,#fff_0%,rgba(255,255,255,0.45)_3%,rgba(255,255,255,0)_7%)]"
      />

      {/*
        The picture already fades towards white on its left, but at the
        narrow end of this range the copy column reaches almost to where the
        parrot begins. So the left is washed back to the page's own white,
        firmly where the text sits and not at all where the parrot does -
        which reads as the scene fading in from the right, the way it was
        drawn.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff_0%,#fff_40%,rgba(255,255,255,0.8)_58%,rgba(255,255,255,0)_74%)]" />
    </div>
  );
}
