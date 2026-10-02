import type { Metadata } from "next";
import { BadgeCheck, Receipt, Search, ShieldCheck } from "lucide-react";
import { ServicePage } from "@/components/marketing/service-page";
import { PageSections } from "@/components/cms/page-sections";
import { metadataForPage } from "@/lib/cms/metadata";
import { pageContentService } from "@/lib/services/page-content-service";
import { websiteService } from "@/lib/services";

const SLUG = "buy-backlinks";

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [Search, Receipt, BadgeCheck, ShieldCheck];

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  const [content, preview] = await Promise.all([
    pageContentService.content(SLUG),
    websiteService.getPublicPreview(6),
  ]);

  /*
    Sections are the page; the template is what it renders until it has any.

    `extra` drew the whole template and then appended the page's sections to
    the bottom, so a hero added in the builder sat first in the section list
    and halfway down the page, under the one the template had already drawn.
  */
  return (
    <PageSections
      slug={SLUG}
      provided={{ preview: preview.rows }}
      fallback={
        <ServicePage
          content={content}
          highlightIcons={highlightIcons}
          preview={preview.rows}
          path="/buy-backlinks"
          breadcrumbLabel="Buy backlinks"
        />
      }
    />
  );
}
