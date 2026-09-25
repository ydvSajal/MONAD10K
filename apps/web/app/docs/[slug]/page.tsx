import Link from "next/link";
import { notFound } from "next/navigation";

import { DOCS, renderDoc } from "../../../lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const html = renderDoc(slug);
  if (html === null) notFound();

  return (
    <div className="docs">
      <nav aria-label="Docs">
        {DOCS.map((d) => (
          <Link key={d.slug} href={`/docs/${d.slug}`} aria-current={d.slug === slug ? "page" : undefined}>
            {d.title}
          </Link>
        ))}
      </nav>
      <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
