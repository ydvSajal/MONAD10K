import Link from "next/link";
import { notFound } from "next/navigation";

import { DOCS, renderDoc } from "../../../../lib/docs";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

const GROUPS = [...new Set(DOCS.map((d) => d.group))];

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const html = renderDoc(slug);
  const i = DOCS.findIndex((d) => d.slug === slug);
  if (html === null || i < 0) notFound();
  const doc = DOCS[i]!;
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];

  return (
    <div className="docs">
      <nav aria-label="Docs">
        {GROUPS.map((group) => (
          <div key={group} className="docs-group">
            <p className="docs-group-title">{group}</p>
            {DOCS.filter((d) => d.group === group).map((d) => (
              <Link key={d.slug} href={`/docs/${d.slug}`} aria-current={d.slug === slug ? "page" : undefined}>
                {d.title}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="docs-body">
        <p className="docs-eyebrow">{doc.group}</p>
        <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="docs-pager">
          {prev ? (
            <Link href={`/docs/${prev.slug}`}>
              <span>Previous</span>
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="next">
              <span>Next</span>
              {next.title}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
