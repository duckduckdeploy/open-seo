import type { Metadata } from 'next';
import { SITE_NAME } from './site';

interface PageMetaInput {
  title: string;
  description: string;
  /** Path beginning with "/". Resolved against metadataBase. */
  path: string;
  /** Use the title as-is instead of applying the "%s · OpenSEO" template. */
  absoluteTitle?: boolean;
  noIndex?: boolean;
}

/** Per-page metadata: title, description, canonical, Open Graph and Twitter tags. */
export function pageMeta({ title, description, path, absoluteTitle, noIndex }: PageMetaInput): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} · ${SITE_NAME}`;
  const images = [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${SITE_NAME}: open-source SEO workspace` }];

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    robots: noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en',
      title: socialTitle,
      description,
      url: path,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: images.map((image) => image.url),
    },
  };
}
